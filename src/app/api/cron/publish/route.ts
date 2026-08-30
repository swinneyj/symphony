import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { and, lte, eq, isNotNull, gt, asc } from "drizzle-orm";
import { publishPostToPlatforms } from "@/lib/publish";
import { cacheGet, cacheSet, cacheDel } from "@/lib/market/cache";

const GATE_KEY = "publish:next_due_at";
const GATE_TTL = 30 * 24 * 3600; // 30d; refreshed on every DB touch

/**
 * GET /api/cron/publish — scheduler tick.
 * Fires every due scheduled post (status=scheduled, scheduled_for <= now).
 * Guarded by the CRON_SECRET header (Vercel cron standard); runs only on
 * production deployments (Vercel limitation) — the branch/preview builds
 * never fire it.
 *
 * Neon compute gate: the tick is KV-gated so it touches the DB only when a
 * post is actually due (see neon-compute-frugality.md). `publish:next_due_at`
 * holds the next scheduled post's time; ticks before that short-circuit with
 * zero DB queries. Schedule changes invalidate the key (posts API), and a
 * failed publish clears it so the next tick retries immediately.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── KV gate: nothing due yet → skip the DB entirely ─────────────────────
  const nextDueRaw = await cacheGet<string>(GATE_KEY);
  if (nextDueRaw) {
    const nextDue = new Date(nextDueRaw);
    if (!isNaN(nextDue.getTime()) && nextDue > new Date()) {
      return NextResponse.json({ fired: 0, gated: true, nextDue: nextDue.toISOString() });
    }
  }

  const due = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), isNotNull(posts.scheduledFor), lte(posts.scheduledFor, new Date())))
    .limit(50);

  const results: Array<{ id: string; status: string }> = [];
  for (const { id } of due) {
    try {
      const res = await publishPostToPlatforms(id);
      results.push({ id, status: res.status });
    } catch (error) {
      results.push({ id, status: "error" });
      console.error("Cron publish failed for post", id, error);
    }
  }

  // ── Gate maintenance ─────────────────────────────────────────────────────
  if (results.some((r) => r.status === "error")) {
    // A failed publish must retry next tick — don't gate past it.
    await cacheDel(GATE_KEY);
  } else {
    // Happy path: arm the gate for the next future scheduled post.
    const next = await db
      .select({ t: posts.scheduledFor })
      .from(posts)
      .where(and(eq(posts.status, "scheduled"), isNotNull(posts.scheduledFor), gt(posts.scheduledFor, new Date())))
      .orderBy(asc(posts.scheduledFor))
      .limit(1);
    if (next[0]?.t) {
      await cacheSet(GATE_KEY, next[0].t.toISOString(), GATE_TTL);
    } else {
      await cacheDel(GATE_KEY);
    }
  }

  return NextResponse.json({ fired: due.length, results });
}
