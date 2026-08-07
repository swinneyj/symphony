import { NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { and, lte, eq, isNotNull } from "drizzle-orm";
import { publishPostToPlatforms } from "@/lib/publish";

/**
 * GET /api/cron/publish — scheduler tick.
 * Fires every due scheduled post (status=scheduled, scheduled_for <= now).
 * Guarded by the CRON_SECRET header (Vercel cron standard); runs only on
 * production deployments (Vercel limitation) — the branch/preview builds
 * never fire it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  return NextResponse.json({ fired: due.length, results });
}
