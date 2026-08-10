import { NextResponse } from "next/server";
import { syncMetaAnalytics } from "@/lib/meta/sync";

/**
 * GET /api/cron/analytics — analytics sync tick.
 *
 * Pulls real platform metrics for every connected Meta account and writes
 * daily analytics_snapshots rows. Guarded by CRON_SECRET (same convention as
 * /api/cron/publish); runs only on production (Vercel limitation).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncMetaAnalytics();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Cron analytics sync failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
