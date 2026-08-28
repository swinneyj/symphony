/**
 * Minimal Upstash KV cache (Vercel KV) — no dependency, plain REST.
 * Used to avoid re-paying EchoTik's daily API quota for identical queries.
 * Degrades to a no-op when KV env vars are absent (local dev, tests).
 */
import { createHash } from "node:crypto";

const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

export function cacheKey(prefix: string, input: string): string {
  return `market:${prefix}:${createHash("sha1").update(input).digest("hex").slice(0, 24)}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!URL || !TOKEN) return null;
  try {
    const res = await fetch(`${URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string | null };
    if (json.result == null) return null;
    return JSON.parse(json.result) as T;
  } catch {
    return null; // cache must never break the app
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!URL || !TOKEN) return;
  try {
    const body = JSON.stringify(value);
    await fetch(`${URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(body)}?EX=${ttlSeconds}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    /* non-fatal */
  }
}
