FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 U2NET_HOME=/models

# rembg + deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Pre-cache the u2net background-removal model at build time (~170MB)
RUN mkdir -p /models && python -c "from rembg import new_session; new_session('u2net')"

# bws CLI baked in (from .build-assets, gitignored) for `bws run` secret injection
COPY .build-assets/bws /usr/local/bin/bws
RUN chmod +x /usr/local/bin/bws

COPY worker.py ./
EXPOSE 8081
CMD ["python", "worker.py"]
