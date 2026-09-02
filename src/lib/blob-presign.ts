import { issueSignedToken, presignUrl } from "@vercel/blob";
import { blobToken } from "@/lib/blob-token";

/**
 * Presign a PRIVATE Blob URL so a browser <img>/<video> can fetch it directly.
 *
 * Raw private URLs (put()'s `url` AND `downloadUrl`) 403 an unauthenticated
 * browser fetch — VERIFIED 2026-09-02 (probes: scripts/probes/blob-render-probe.mjs
 * vs blob-presign-probe.mjs). Only a presigned URL
 * (?vercel-blob-delegation=…&vercel-blob-signature=…) returns 200, for
 * `ttlMs` (default 15 min, read-only get). Use for transient previews
 * (create-dialog faces, asset downloads); never store presigned URLs in the
 * DB — store the raw URL and serve long-term through a Bearer proxy route
 * (e.g. /api/personas/[id]/image, /api/media/[id]/public).
 */
export async function presignBlobGet(url: string, ttlMs = 15 * 60 * 1000): Promise<string> {
  const token = blobToken();
  if (!token) throw new Error("Blob token missing");
  // Strip the leading slash: new URL().pathname returns "/path/name" but
  // presignUrl appends its own "/" → "//path" 404s (VERIFIED 2026-09-02).
  const pathname = new URL(url).pathname.replace(/^\//, "");
  const signed = await issueSignedToken({
    token,
    pathname,
    operations: ["get"],
    validUntil: Date.now() + ttlMs,
  });
  const { presignedUrl } = await presignUrl(
    { clientSigningToken: signed.clientSigningToken, delegationToken: signed.delegationToken },
    { operation: "get", pathname, access: "private" }
  );
  return presignedUrl;
}
