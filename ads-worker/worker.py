#!/usr/bin/env python3
"""
ads-worker: owns ad_sources rows (Steal This Ad).

Claims ad_sources with status='queued', downloads the video (yt-dlp),
extracts audio (ffmpeg), transcribes (faster-whisper "small", CPU),
then writes transcript segments + raw text back to the row.

The app (Vercel) never touches the video bytes — the original ad is
downloaded to /tmp, transcribed, and deleted. We keep the transcript
(our own remix source), not the copyrighted video.

Status flow: queued → downloading → transcribing → transcribed | failed
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlencode
import http.server
import threading

import psycopg2
import requests
import yt_dlp

from faster_whisper import WhisperModel
from yt_dlp.networking.impersonate import ImpersonateTarget

DATABASE_URL = os.environ.get("DATABASE_URL")
BLOB_TOKEN = (
    os.environ.get("BLOB_READ_WRITE_TOKEN")
    or os.environ.get("BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN")
    or ""
).strip() or None
POLL_MS = int(os.environ.get("POLL_INTERVAL_MS", "5000"))
CONCURRENCY = int(os.environ.get("WORKER_CONCURRENCY", "2"))
STALE_MINUTES = int(os.environ.get("WORKER_STALE_MINUTES", "15"))
HEALTH_PORT = int(os.environ.get("PORT", "8082"))
MAX_VIDEO_BYTES = 400 * 1024 * 1024

if not DATABASE_URL:
    print("FATAL: DATABASE_URL is required", file=sys.stderr)
    sys.exit(1)

# Load the model once at startup (pre-cached at build time).
WHISPER = WhisperModel("small", device="cpu", compute_type="int8")


def connect():
    return psycopg2.connect(DATABASE_URL)


def requeue_stale(cur):
    cur.execute(
        """
        UPDATE ad_sources
        SET status = 'queued', updated_at = now()
        WHERE status IN ('downloading', 'transcribing')
          AND updated_at < now() - make_interval(mins => %s)
        RETURNING id
        """,
        (STALE_MINUTES,),
    )
    return cur.rowcount


def claim(cur, limit):
    cur.execute(
        """
        UPDATE ad_sources
        SET status = 'downloading', updated_at = now()
        WHERE id IN (
          SELECT id FROM ad_sources
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT %s
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, workspace_id, source_url, video_url, platform
        """,
        (limit,),
    )
    return cur.fetchall()


def fail(cur, source_id, message):
    cur.execute(
        "UPDATE ad_sources SET status = 'failed', error = %s, updated_at = now() WHERE id = %s",
        (str(message)[:2000], source_id),
    )


def mark_transcribing(cur, source_id):
    cur.execute(
        "UPDATE ad_sources SET status = 'transcribing', updated_at = now() WHERE id = %s",
        (source_id,),
    )


def download_tiktok_direct(url, workdir):
    """TikTok video download that works from datacenter IPs.

    yt-dlp's TikTok web extractor gets bot-challenged from this VPS IP
    ("Unexpected response from webpage request" — TikTok serves a stripped
    page to its request). A plain browser-like `requests` session, however,
    receives the full page including the signed playAddr, and the video CDN
    serves that same session the file (session cookies + Referer required).
    No login/cookies needed (verified 2026-08 from an Oracle DC IP).

    Returns (video_path, title, author).
    """
    UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    )
    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    if "/view/product/" in resp.url:
        raise RuntimeError(
            "This is a TikTok Shop product link, not a video — product resolution "
            "isn't wired up yet. Paste an ad video URL or upload the file."
        )
    m = re.search(r"/video/(\d+)", resp.url)
    if not m:
        raise RuntimeError(f"no TikTok video id found at {resp.url[:120]}")
    page = resp.text
    if m.group(1) not in page:  # short-link interstitial — refetch canonical page
        page = session.get(resp.url, timeout=30).text
    match = re.search(
        r'<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">(.*?)</script>',
        page,
        re.S,
    )
    if not match:
        raise RuntimeError("TikTok page returned no rehydration data (bot-walled?)")
    data = json.loads(match.group(1))
    item = (
        data.get("__DEFAULT_SCOPE__", {})
        .get("webapp.video-detail", {})
        .get("itemInfo", {})
        .get("itemStruct") or {}
    )
    video = item.get("video") or {}
    play = video.get("playAddr")
    if isinstance(play, str):
        play_url = play
    elif isinstance(play, dict):
        play_url = (play.get("urlList") or play.get("url_list") or [None])[0]
    else:
        play_url = None
    if not play_url:
        raise RuntimeError("no playable video URL in page data")
    r = session.get(
        play_url,
        headers={"Referer": "https://www.tiktok.com/"},
        timeout=90,
        stream=True,
    )
    r.raise_for_status()
    video_path = os.path.join(workdir, "video.mp4")
    with open(video_path, "wb") as fh:
        for chunk in r.iter_content(chunk_size=1 << 16):
            fh.write(chunk)
    if os.path.getsize(video_path) == 0:
        raise RuntimeError("downloaded video is empty")
    title = (item.get("desc") or "").strip()[:300] or None
    author = None
    author_struct = item.get("author")
    if isinstance(author_struct, dict) and author_struct.get("uniqueId"):
        author = f"@{author_struct['uniqueId']}"[:200]
    return video_path, title, author


def download_video(url, workdir, platform, blob_token):
    """Returns (video_path, title, author) or raises.

    platform == 'upload' → the URL is a private Vercel Blob URL (user uploaded
    the ad file directly); fetch it with the blob auth header, no yt-dlp.
    Otherwise yt-dlp with chrome impersonation (TikTok's TLS-fingerprint
    check) and, when TIKTOK_COOKIES is set, a Netscape cookie file (the
    reliable fix for TikTok's datacenter-IP block).
    """
    if platform == "upload":
        headers = {"Authorization": f"Bearer {blob_token}"} if blob_token else {}
        resp = requests.get(url, headers=headers, timeout=60, stream=True)
        resp.raise_for_status()
        video_path = os.path.join(workdir, "video.mp4")
        with open(video_path, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                fh.write(chunk)
        return video_path, None, None

    if platform == "product":
        # Shop main video: a direct CDN URL (ttcdn/v16…) resolved by the app
        # at paste time. DC-IP safe — plain requests, no yt-dlp needed.
        resp = requests.get(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                ),
                "Referer": "https://www.tiktok.com/",
            },
            timeout=90,
            stream=True,
        )
        resp.raise_for_status()
        video_path = os.path.join(workdir, "video.mp4")
        with open(video_path, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 16):
                fh.write(chunk)
        if os.path.getsize(video_path) == 0:
            raise RuntimeError("downloaded product video is empty")
        return video_path, None, None

    if platform == "tiktok":
        # yt-dlp's web extractor is bot-challenged from this VPS IP; the
        # direct page-parse path works (see download_tiktok_direct).
        try:
            return download_tiktok_direct(url, workdir)
        except Exception as direct_err:  # noqa: BLE001 — fall back to yt-dlp
            print(
                f"[ads-worker] direct tiktok download failed, falling back to yt-dlp: {direct_err}",
                file=sys.stderr,
            )

    ydl_opts = {
        "outtmpl": os.path.join(workdir, "video.%(ext)s"),
        "format": "best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "retries": 2,
        "max_filesize": MAX_VIDEO_BYTES,
        "impersonate": ImpersonateTarget(client="chrome"),
    }
    cookie_file = None
    raw_cookies = (os.environ.get("TIKTOK_COOKIES") or "").strip()
    if raw_cookies:
        cookie_file = os.path.join(workdir, "cookies.txt")
        with open(cookie_file, "w", encoding="utf-8") as fh:
            fh.write("# Netscape HTTP Cookie File\n")
            fh.write(raw_cookies)
        ydl_opts["cookies"] = cookie_file

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if info is None:
            raise RuntimeError("yt-dlp returned no info")
        video_path = ydl.prepare_filename(info)
        if not os.path.exists(video_path):
            # Some formats land with a different extension than the template.
            matches = [f for f in os.listdir(workdir) if f.startswith("video.")]
            if not matches:
                raise RuntimeError("download produced no video file")
            video_path = os.path.join(workdir, sorted(matches)[-1])
        title = (info.get("title") or "").strip()[:300] or None
        author = (info.get("uploader") or info.get("creator") or "").strip()[:200] or None
        return video_path, title, author


def extract_audio(video_path, workdir):
    wav_path = os.path.join(workdir, "audio.wav")
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", video_path,
            "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", wav_path,
        ],
        check=True,
        capture_output=True,
        timeout=180,
    )
    return wav_path


def transcribe(wav_path):
    segments, _info = WHISPER.transcribe(
        wav_path,
        language="en",
        vad_filter=True,
        word_timestamps=False,
    )
    segs = []
    raw = []
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        segs.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": text})
        raw.append(text)
    return segs, " ".join(raw)


def fetch_product_brief(url):
    """Best-effort og:title/description/image brief for a TikTok Shop
    product page — used when the shop main video can't be downloaded."""
    try:
        UA = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        )
        resp = requests.get(
            url,
            headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
            timeout=30,
        )
        resp.raise_for_status()
        html = resp.text
        og = lambda name: (  # noqa: E731
            re.search(
                rf'<meta[^>]+(?:property|name)="og:{name}"[^>]+content="([^"]*)"',
                html, re.I,
            )
            or re.search(
                rf'<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="og:{name}"',
                html, re.I,
            )
        )
        title_m = og("title")
        title = (title_m.group(1) if title_m else "").strip()
        desc_m = og("description")
        description = desc_m.group(1) if desc_m else ""
        img_m = og("image")
        image = img_m.group(1) if img_m else ""
        import html as _html

        title = _html.unescape(title)
        description = _html.unescape(description)
        if not title:
            return None
        return "\n\n".join(
            part
            for part in [
                f"Product: {title}",
                f"Description: {description}" if description else "",
                f"Product image: {image}" if image else "",
            ]
            if part
        )[:4000]
    except Exception:  # noqa: BLE001 — brief is best-effort
        return None


def process_row(conn, cur, source_id, source_url, video_url, platform):
    workdir = tempfile.mkdtemp(prefix="ads-worker-")
    try:
        # Product sources carry the shop main video in video_url (a direct
        # CDN URL, DC-IP safe); everything else downloads from source_url.
        dl_url = video_url if (platform == "product" and video_url) else source_url
        video_path, title, author = download_video(dl_url, workdir, platform, BLOB_TOKEN)
        mark_transcribing(cur, source_id)
        conn.commit()
        wav_path = extract_audio(video_path, workdir)
        segs, raw_text = transcribe(wav_path)
        if not raw_text:
            raise RuntimeError("transcription produced no text (silent video?)")
        cur.execute(
            """
            UPDATE ad_sources
            SET status = 'transcribed', transcript = %s, raw_text = %s,
                title = COALESCE(title, %s), author_name = COALESCE(author_name, %s),
                error = NULL, updated_at = now()
            WHERE id = %s
            """,
            (json.dumps(segs), raw_text, title, author, source_id),
        )
        conn.commit()
        print(f"[ads-worker] transcribed source={source_id} segments={len(segs)} words={len(raw_text.split())}")
    except Exception as e:  # noqa: BLE001 — report any failure on the row
        # Shop main video unavailable (no video on listing / CDN refused):
        # fall back to a brief-only source so the row stays usable.
        if platform == "product":
            brief = fetch_product_brief(source_url)
            if brief:
                conn.rollback()
                cur.execute(
                    "UPDATE ad_sources SET status = 'fetched', raw_text = %s, "
                    "error = NULL, updated_at = now() WHERE id = %s",
                    (brief, source_id),
                )
                conn.commit()
                print(
                    f"[ads-worker] shop video unavailable, fell back to brief-only "
                    f"source={source_id}: {e}",
                    file=sys.stderr,
                )
                return
        conn.rollback()
        cur.execute(
            "UPDATE ad_sources SET status = 'failed', error = %s, updated_at = now() WHERE id = %s",
            (str(e)[:2000], source_id),
        )
        conn.commit()
        print(f"[ads-worker] FAILED source={source_id}: {e}", file=sys.stderr)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)



def blob_put(pathname, data, content_type):
    """Private Vercel Blob upload (same REST endpoint the JS SDK uses).

    Verified live 2026-08-14: x-vercel-blob-store-id + x-api-version are
    REQUIRED (without them the API 400s "Invalid pathname"). Store id is
    the 4th underscore segment of the read-write token.
    """
    if not BLOB_TOKEN:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not set")
    store_id = BLOB_TOKEN.split("_")[3] if BLOB_TOKEN.startswith("vercel_blob_rw_") else ""
    resp = requests.put(
        f"https://vercel.com/api/blob/?{urlencode({'pathname': pathname})}",
        data=data,
        headers={
            "Authorization": f"Bearer {BLOB_TOKEN}",
            "x-vercel-blob-access": "private",
            "x-content-type": content_type,
            "x-vercel-blob-store-id": store_id,
            "x-api-version": "12",
        },
        timeout=180,
    )
    if not resp.ok:
        raise RuntimeError(f"blob put failed: {resp.status_code} {resp.text[:300]}")
    return resp.json()["url"]


def extract_mp3(video_path, workdir):
    """ffmpeg: video → MP3 (libmp3lame)."""
    mp3_path = os.path.join(workdir, "audio.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", video_path, "-vn",
         "-acodec", "libmp3lame", "-q:a", "2", mp3_path],
        check=True, timeout=300,
    )
    return mp3_path


def detect_platform(url):
    if "tiktok.com" in url:
        return "tiktok"
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube"
    if "instagram.com" in url:
        return "instagram"
    return "other"


def safe_filename(name, ext):
    base = re.sub(r"[^\w\- ]+", "_", name or "download").strip("_") or "download"
    return f"{base[:80]}.{ext}"


def probe_video(path):
    """Best-effort ffprobe → (width, height, duration_s). All None on failure."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json",
             "-show_streams", "-show_format", path],
            capture_output=True, text=True, timeout=60, check=True,
        ).stdout
        data = json.loads(out)
        duration = None
        width = height = None
        for s in data.get("streams", []):
            if s.get("codec_type") == "video":
                width = s.get("width")
                height = s.get("height")
                duration = duration or s.get("duration")
        if not duration:
            duration = (data.get("format") or {}).get("duration")
        return width, height, int(float(duration)) if duration else None
    except Exception:  # noqa: BLE001 — metadata is best-effort
        return None, None, None


def claim_downloads(cur, limit):
    cur.execute(
        """
        UPDATE media_downloads
        SET status = 'downloading', updated_at = now()
        WHERE id IN (
          SELECT id FROM media_downloads
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT %s
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, workspace_id, source_url, platform, want_audio, created_by_id
        """,
        (limit,),
    )
    return cur.fetchall()


def requeue_stale_downloads(cur):
    cur.execute(
        """
        UPDATE media_downloads
        SET status = 'queued', updated_at = now()
        WHERE status = 'downloading'
          AND updated_at < now() - make_interval(mins => %s)
        RETURNING id
        """,
        (STALE_MINUTES,),
    )
    return cur.rowcount


def process_download(conn, cur, dl_id, _ws, source_url, platform, want_audio, created_by):
    workdir = tempfile.mkdtemp(prefix="dl-worker-")
    try:
        # TikTok → DC-safe direct path; other platforms → yt-dlp impersonation.
        video_path, title, author = download_video(source_url, workdir, platform, BLOB_TOKEN)
        video_url = blob_put(f"downloads/{dl_id}.mp4", open(video_path, "rb").read(), "video/mp4")
        audio_url = None
        if want_audio:
            mp3_path = extract_mp3(video_path, workdir)
            audio_url = blob_put(f"downloads/{dl_id}.mp3", open(mp3_path, "rb").read(), "audio/mpeg")
        cur.execute(
            """
            UPDATE media_downloads
            SET status = 'done', title = COALESCE(title, %s),
                author_name = COALESCE(author_name, %s),
                video_url = %s, audio_url = %s, error = NULL, updated_at = now()
            WHERE id = %s
            """,
            (title, author, video_url, audio_url, dl_id),
        )
        # Also surface it in the Media Library (media_assets) so downloaded
        # videos are reusable (e.g. as a Video Clone source) without re-upload.
        width, height, dur = probe_video(video_path)
        cur.execute(
            """
            INSERT INTO media_assets
              (workspace_id, uploaded_by_id, file_name, file_size, mime_type,
               media_type, url, width, height, duration, alt)
            VALUES (%s, %s, %s, %s, 'video/mp4', 'video', %s, %s, %s, %s, %s)
            """,
            (
                _ws,
                created_by,
                safe_filename(title or f"download-{dl_id}", "mp4"),
                os.path.getsize(video_path),
                video_url,
                width,
                height,
                dur,
                title or source_url,
            ),
        )
        conn.commit()
        print(f"[ads-worker] download {dl_id} done → {video_url}" + (" + mp3" if audio_url else ""))
    except Exception as e:  # noqa: BLE001 — report any failure on the row
        conn.rollback()
        cur.execute(
            "UPDATE media_downloads SET status = 'failed', error = %s, updated_at = now() WHERE id = %s",
            (str(e)[:2000], dl_id),
        )
        conn.commit()
        print(f"[ads-worker] FAILED download {dl_id}: {e}", file=sys.stderr)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def tick():
    conn = connect()
    try:
        cur = conn.cursor()
        reclaimed = requeue_stale(cur)
        if reclaimed > 0:
            print(f"[ads-worker] requeued {reclaimed} stale source(s)")
            conn.commit()
        rows = claim(cur, CONCURRENCY)
        conn.commit()
        for source_id, _ws, source_url, video_url, platform in rows:
            process_row(conn, cur, source_id, source_url, video_url, platform)

        # Media Downloader loop (TikTok-first MVP): video (+ optional MP3) → Blob.
        reclaimed = requeue_stale_downloads(cur)
        if reclaimed > 0:
            print(f"[ads-worker] requeued {reclaimed} stale download(s)")
            conn.commit()
        dl_rows = claim_downloads(cur, CONCURRENCY)
        conn.commit()
        for dl_id, ws, url, platform, want_audio, created_by in dl_rows:
            process_download(conn, cur, dl_id, ws, url, platform, want_audio, created_by)
    finally:
        conn.close()


class Health(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        body = json.dumps({"status": "ok", "worker": "ads-worker"}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002 — silence
        pass


if __name__ == "__main__":
    threading.Thread(
        target=lambda: http.server.HTTPServer(("", HEALTH_PORT), Health).serve_forever(),
        daemon=True,
    ).start()
    print(f"[ads-worker] starting: poll={POLL_MS}ms concurrency={CONCURRENCY} healthz=:{HEALTH_PORT}")
    while True:
        try:
            tick()
        except Exception as e:  # noqa: BLE001 — keep the loop alive
            print(f"[ads-worker] tick error: {e}", file=sys.stderr)
        time.sleep(POLL_MS / 1000.0)
