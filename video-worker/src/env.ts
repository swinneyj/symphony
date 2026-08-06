/**
 * Env helpers. BSM secret keys map to env var names 1:1 via `bws run`; the
 * Blob token can land as BLOB_READ_WRITE_TOKEN or (Vercel store naming)
 * BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN — accept both.
 */
export function blobToken(): string | undefined {
  const raw =
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN ||
    undefined;
  return raw?.trim() || undefined;
}
