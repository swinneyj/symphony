/**
 * Blob store token resolver.
 *
 * Vercel's Blob integration injects vars with the configured prefix, so the
 * read-write token can land as `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN` (plus a
 * `..._STORE_ID`). The workers hit this same naming trap — always check both
 * names, like video-worker's src/env.ts blobToken().
 */
export function blobToken(): string | undefined {
  return (
    process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN ??
    process.env.BLOB_READ_WRITE_TOKEN ??
    undefined
  );
}
