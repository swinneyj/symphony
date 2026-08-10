# video-worker

Symphony AI Video Studio worker. Polls the `video_batch_jobs` table in Neon,
processes jobs, and uploads results to Vercel Blob.

Phase 1 ships the polling loop + the `product_process` job type (download
original image → upload processed image to Blob → mark product `ready`).
Phases 2–4 add rembg background removal, 9:16 canvas, and the Sora/Seedance
video generation pipeline as new processors.

## Run

```bash
npm install
DATABASE_URL=postgres://... \
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_... \
npm run dev          # tsx watch
```

## Docker

```bash
docker build -t symphony-video-worker .
docker run -d --name video-worker --restart unless-stopped \
  -e DATABASE_URL=... \
  -e BLOB_READ_WRITE_TOKEN=... \
  -p 8080:8080 \
  symphony-video-worker
```

## Environment

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — (required) | Neon Postgres connection string (same as Vercel) |
| `BLOB_READ_WRITE_TOKEN` | — (required) | Vercel Blob read-write token (same as Vercel) |
| `POLL_INTERVAL_MS` | `5000` | Poll loop interval |
| `WORKER_CONCURRENCY` | `3` | Max jobs claimed per tick |
| `WORKER_MAX_RETRIES` | `3` | Retries before a job is marked failed |
| `WORKER_STALE_MINUTES` | `15` | Running jobs older than this are requeued (crash recovery) |
| `PORT` | `8080` | Health endpoint port |

Health: `GET /` → `{"status":"ok"}`

## Job state machine

```
queued → running → done
           │  error
           ▼
        queued (retries+1) ──retries exhausted──▶ failed
```

- Claims are atomic (`UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`) so multiple workers can't double-claim.
- On startup and every tick, `running` jobs older than `WORKER_STALE_MINUTES` are requeued — this is the crash-recovery path.

## Adding a processor

1. Create `src/processors/<name>.ts` exporting `handle<Name>(job, maxRetries)`.
2. Register it in the `processJob` switch in `src/index.ts`.
