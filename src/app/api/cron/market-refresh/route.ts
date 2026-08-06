import { NextResponse } from "next/server";
import { fetchWinningProducts, ingestMarketRows } from "@/lib/market";

/**
 * GET /api/cron/market-refresh?secret=...&workspaceId=...
 * Daily refresh hook for winning-product snapshots. Guarded by CRON_SECRET
 * (Vercel cron pattern). Without source credentials it returns 200 + skipped
 * so a cron can run before provisioning.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const results: Record<string, unknown> = {};

  for (const source of ["echotik", "fastmoss"] as const) {
    try {
      const { rows, dryRun } = await fetchWinningProducts(source, {
        period: "day",
        region: "US",
        limit: 50,
      });
      if (dryRun) {
        results[source] = { skipped: "dry-run mode — no creds provisioned" };
        continue;
      }
      const stored = await ingestMarketRows(workspaceId, source, rows);
      results[source] = { stored };
    } catch (error) {
      results[source] = { error: error instanceof Error ? error.message : "failed" };
    }
  }

  return NextResponse.json({ date: today, results });
}

// Vercel cron schedule lives in vercel.json (not yet present in this repo) —
// add when deploying: {"crons":[{"path":"/api/cron/market-refresh","schedule":"0 8 * * *"}]}
export const dynamic = "force-dynamic";
