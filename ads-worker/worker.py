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
        RETURNING id, workspace_id, source_url, platform
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


def process_row(conn, cur, source_id, source_url, platform):
    workdir = tempfile.mkdtemp(prefix="ads-worker-")
    try:
        video_path, title, author = download_video(source_url, workdir, platform, BLOB_TOKEN)
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
        conn.rollback()
        cur.execute(
            "UPDATE ad_sources SET status = 'failed', error = %s, updated_at = now() WHERE id = %s",
            (str(e)[:2000], source_id),
        )
        conn.commit()
        print(f"[ads-worker] FAILED source={source_id}: {e}", file=sys.stderr)
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
        for source_id, _ws, source_url, platform in rows:
            process_row(conn, cur, source_id, source_url, platform)
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
