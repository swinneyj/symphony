#!/usr/bin/env python3
"""
img-worker: owns video_batch_jobs of type product_process.
Downloads the product image → rembg background removal → transparent PNG →
Vercel Blob → products.processed_image_url + status=ready.

The video-worker explicitly skips product_process; only this worker claims it.
"""
import io
import os
import sys
import time
import json
import http.server
import threading
import urllib.request
import urllib.error

import psycopg2
import requests
from rembg import remove
from PIL import Image

DATABASE_URL = os.environ.get("DATABASE_URL")
BLOB_TOKEN = (os.environ.get("BLOB_READ_WRITE_TOKEN") or os.environ.get("BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN") or "").strip() or None
POLL_MS = int(os.environ.get("POLL_INTERVAL_MS", "5000"))


# ── Neon compute gate ────────────────────────────────────────────────────────
# Skip the DB poll unless a KV job-flag is set (see neon-compute-frugality.md:
# every DB wake costs the full 5-min suspend delay). Gate is best-effort:
# any failure → poll the DB as usual.
GATE_URL = os.environ.get("WORKER_GATE_URL", "https://www.symphonyapp.company/api/cron/worker-gate")
GATE_SECRET = os.environ.get("CRON_SECRET", "")


def _gate_headers():
    return {"Authorization": f"Bearer {GATE_SECRET}"} if GATE_SECRET else {}


def gate_open(worker):
    try:
        req = urllib.request.Request(f"{GATE_URL}?w={worker}", headers=_gate_headers())
        with urllib.request.urlopen(req, timeout=5) as r:
            return bool(json.loads(r.read().decode()).get("due", False))
    except Exception:
        return True  # gate unreachable → poll DB as usual


def gate_clear(worker):
    try:
        req = urllib.request.Request(f"{GATE_URL}?w={worker}", method="DELETE", headers=_gate_headers())
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass
CONCURRENCY = int(os.environ.get("WORKER_CONCURRENCY", "2"))
MAX_RETRIES = int(os.environ.get("WORKER_MAX_RETRIES", "3"))
STALE_MINUTES = int(os.environ.get("WORKER_STALE_MINUTES", "15"))
HEALTH_PORT = int(os.environ.get("PORT", "8081"))
MAX_IMAGE_BYTES = 25 * 1024 * 1024

if not DATABASE_URL:
    print("FATAL: DATABASE_URL is required", file=sys.stderr)
    sys.exit(1)


def connect():
    return psycopg2.connect(DATABASE_URL)


def requeue_stale(cur):
    cur.execute(
        """
        UPDATE video_batch_jobs
        SET status = 'queued', retries = retries + 1, updated_at = now()
        WHERE status = 'running' AND job_type = 'product_process'
          AND updated_at < now() - make_interval(mins => %s)
        RETURNING id
        """,
        (STALE_MINUTES,),
    )
    return cur.rowcount


def claim(cur, limit):
    cur.execute(
        """
        UPDATE video_batch_jobs
        SET status = 'running', updated_at = now()
        WHERE id IN (
          SELECT id FROM video_batch_jobs
          WHERE status = 'queued' AND job_type = 'product_process'
          ORDER BY created_at ASC
          LIMIT %s
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, workspace_id, product_id
        """,
        (limit,),
    )
    return cur.fetchall()


def upload_to_blob(token, path, data, content_type):
    # Mirrors @vercel/blob SDK put():
    #   PUT https://vercel.com/api/blob/?pathname=<urlencoded path>
    #   headers: authorization Bearer, x-api-version: 12, x-content-type,
    #            x-vercel-blob-access: private
    # Token layout: vercel_blob_rw_<STORE_ID>_<secret> (store id unused here).
    import urllib.parse

    qs = urllib.parse.urlencode({"pathname": path})
    url = f"https://vercel.com/api/blob/?{qs}"
    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "x-api-version": "12",
            "x-content-type": content_type,
            "x-vercel-blob-access": "private",
            "x-allow-overwrite": "1",
            "Content-Type": "application/octet-stream",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:  # noqa: F841
        raise RuntimeError(f"blob upload HTTP {e.code}: {e.read().decode()[:300]}")


def process_job(cur, job_id, workspace_id, product_id):
    cur.execute("SELECT name, original_image_url FROM products WHERE id = %s", (product_id,))
    row = cur.fetchone()
    if not row:
        fail(cur, job_id, "product not found", None)
        return
    name, image_url = row
    if not image_url:
        fail(cur, job_id, "product has no original_image_url", None)
        return

    try:
        resp = requests.get(image_url, timeout=60, stream=True)
        resp.raise_for_status()
        length = int(resp.headers.get("content-length", "0"))
        if length > MAX_IMAGE_BYTES:
            raise RuntimeError(f"source image too large ({length} bytes)")
        raw = resp.content
    except Exception as e:
        fail(cur, job_id, f"download failed: {e}", None)
        return

    try:
        pil_img = Image.open(io.BytesIO(raw))
        if pil_img.mode not in ("RGBA", "RGB", "L"):
            pil_img = pil_img.convert("RGB")
        cutout = remove(pil_img)  # RGBA with transparent background
        # Pad to a 720x1280 (9:16) canvas — Sora requires the input image to
        # match the requested size exactly.
        W, H = 720, 1280
        scale = min(W / cutout.width, H / cutout.height)
        nw, nh = max(1, round(cutout.width * scale)), max(1, round(cutout.height * scale))
        resample = getattr(Image, "Resampling", Image).LANCZOS
        cutout = cutout.resize((nw, nh), resample)
        canvas = Image.new("RGBA", (W, H), (255, 255, 255, 0))
        canvas.paste(cutout, ((W - nw) // 2, (H - nh) // 2), cutout)
        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        png = buf.getvalue()
    except Exception as e:
        fail(cur, job_id, f"rembg failed: {e}", None)
        return

    if not BLOB_TOKEN:
        fail(cur, job_id, "BLOB_READ_WRITE_TOKEN not set", None)
        return

    try:
        blob_path = f"products/{workspace_id}/{product_id}/processed.png"
        result = upload_to_blob(BLOB_TOKEN, blob_path, png, "image/png")
        processed_url = result.get("url")
        if not processed_url:
            raise RuntimeError(f"blob upload returned no url: {result}")
        cur.execute(
            "UPDATE products SET processed_image_url = %s, status = 'ready', updated_at = now() WHERE id = %s",
            (processed_url, product_id),
        )
        cur.execute(
            "UPDATE video_batch_jobs SET status = 'done', error = NULL, updated_at = now() WHERE id = %s",
            (job_id,),
        )
        print(f"[img-worker] done job={job_id} product={name!r} -> {processed_url}")
    except Exception as e:
        fail(cur, job_id, f"upload failed: {e}", None)


def fail(cur, job_id, message, retries):
    cur.execute(
        """
        UPDATE video_batch_jobs
        SET status = CASE WHEN retries < %s THEN 'queued'::video_job_status ELSE 'failed'::video_job_status END,
            retries = retries + 1,
            error = %s,
            updated_at = now()
        WHERE id = %s
        """,
        (MAX_RETRIES, message[:2000], job_id),
    )
    print(f"[img-worker] fail job={job_id}: {message}")


def tick(conn):
    with conn.cursor() as cur:
        reclaimed = requeue_stale(cur)
        if reclaimed:
            print(f"[img-worker] requeued {reclaimed} stale job(s)")
        jobs = claim(cur, CONCURRENCY)
        if not jobs:
            gate_clear("img")
            return
        for job_id, workspace_id, product_id in jobs:
            process_job(cur, job_id, workspace_id, product_id)
        conn.commit()


def main():
    class Healthz(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok","worker":"img-worker"}')

        def log_message(self, format, *args):  # noqa: A002
            pass

    threading.Thread(
        target=lambda: http.server.HTTPServer(("0.0.0.0", HEALTH_PORT), Healthz).serve_forever(),
        daemon=True,
    ).start()

    conn = connect()
    print(f"[img-worker] starting poll={POLL_MS}ms concurrency={CONCURRENCY}")
    while True:
        try:
            if gate_open("img"):
                tick(conn)
        except Exception as e:
            print(f"[img-worker] tick error: {e}", file=sys.stderr)
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(2)
            conn = connect()
        time.sleep(POLL_MS / 1000.0)


if __name__ == "__main__":
    main()
