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

export async function cacheDel(key: string): Promise<void> {
  if (!URL || !TOKEN) return;
  try {
    await fetch(`${URL}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Job-pending flags for the Neon compute gate (see neon-compute-frugality.md).
 * Set by every API route that enqueues worker work; read by the workers via
 * /api/cron/worker-gate so they skip their Neon poll when nothing is pending.
 * TTL is a safety net — workers clear the flag when they observe an empty queue.
 */
export const JOB_FLAGS = { video: "jobs:video", img: "jobs:img", ads: "jobs:ads" } as const;
export type JobFlagKind = keyof typeof JOB_FLAGS;
const JOB_FLAG_TTL = 6 * 3600; // 6h safety net; cleared on empty-queue observation

export async function flagJobs(kind: JobFlagKind): Promise<void> {
  await cacheSet(JOB_FLAGS[kind], 1, JOB_FLAG_TTL);
}

export async function jobsPending(kind: JobFlagKind): Promise<boolean> {
  const v = await cacheGet<number>(JOB_FLAGS[kind]);
  return v === 1;
}
