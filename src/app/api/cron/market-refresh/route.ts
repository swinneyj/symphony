import { NextResponse } from "next/server";
import { fetchWinningProducts, ingestMarketRows } from "@/lib/market";
import { db } from "@/db";
import { workspaces } from "@/db/schema";

/**
 * GET /api/cron/market-refresh
 * Daily refresh hook for winning-product snapshots. Guarded by CRON_SECRET
 * (Vercel cron pattern). Without source credentials it returns 200 + skipped
 * so a cron can run before provisioning.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const authorization = request.headers.get("authorization");
  const headerSecret = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!process.env.CRON_SECRET || (secret !== process.env.CRON_SECRET && headerSecret !== process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedWorkspaceId = searchParams.get("workspaceId");
  const targets = requestedWorkspaceId
    ? [{ id: requestedWorkspaceId }]
    : await db.select({ id: workspaces.id }).from(workspaces);

  const today = new Date().toISOString().slice(0, 10);
  const results: Record<string, unknown> = {};

  for (const workspace of targets) {
    const workspaceResults: Record<string, unknown> = {};
    for (const source of ["echotik", "fastmoss"] as const) {
      try {
        const { rows, dryRun } = await fetchWinningProducts(source, {
          period: "day",
          region: "US",
          limit: 50,
        });
        if (dryRun) {
          workspaceResults[source] = { skipped: "dry-run mode — no creds provisioned" };
          continue;
        }
        const stored = await ingestMarketRows(workspace.id, source, rows);
        workspaceResults[source] = { stored };
      } catch (error) {
        workspaceResults[source] = { error: error instanceof Error ? error.message : "failed" };
      }
    }
    results[workspace.id] = workspaceResults;
  }

  return NextResponse.json({ date: today, results });
}

export const dynamic = "force-dynamic";
