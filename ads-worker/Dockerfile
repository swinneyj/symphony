FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

# ffmpeg for audio extraction (transcription input)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp + faster-whisper + pg driver
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-cache the whisper "small" model (~460MB) at build time so first job
# doesn't stall on a download (same pattern as img-worker's u2net cache).
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

# bws CLI baked in (from .build-assets, gitignored) for `bws run` secret injection
COPY .build-assets/bws /usr/local/bin/bws
RUN chmod +x /usr/local/bin/bws

COPY worker.py ./
EXPOSE 8082
CMD ["python", "worker.py"]
