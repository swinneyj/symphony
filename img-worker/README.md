# img-worker

Python + rembg worker for Symphony Video Studio. Owns `product_process` jobs:
downloads the product's original image → background removal (u2net) →
transparent PNG → Vercel Blob → `products.processed_image_url` + `ready`.

The video-worker skips `product_process`; only this container claims it.

## Env
| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon connection string |
| `BLOB_READ_WRITE_TOKEN` | yes | Vercel Blob token (upload destination) |
| `POLL_INTERVAL_MS` | no | default 5000 |
| `WORKER_CONCURRENCY` | no | default 2 |
| `WORKER_MAX_RETRIES` | no | default 3 |
| `WORKER_STALE_MINUTES` | no | default 15 (crash recovery) |
| `PORT` | no | healthz port, default 8081 |

## Build & run
```bash
docker build -t img-worker .
docker run -d --env-file .env --name img-worker img-worker
```
