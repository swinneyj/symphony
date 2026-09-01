import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchTopCreators, getLeaderboardFilters } from "@/lib/market";

/**
 * GET /api/market/creators/top?workspaceId&period=day|week|month&role=creator|seller|all&board=champion-sales&limit=50&categoryId=
 * Top creators by sales/volume from the EchoTik "Sales Champion" leaderboard
 * (champion-sales default; also followers, darkhorse-*, hot-live). 1 request
 * per combo, cached 4h in KV. Returns the leaderboard filters alongside so
 * the UI has time-range/role/category options without an extra round trip.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const periodRaw = searchParams.get("period");
    const roleRaw = searchParams.get("role");
    const boardRaw = searchParams.get("board");
    const limitRaw = searchParams.get("limit");
    const categoryId = searchParams.get("categoryId") ?? undefined;

    const period = periodRaw === "week" || periodRaw === "month" ? periodRaw : "day";
    const role = roleRaw === "creator" || roleRaw === "seller" ? roleRaw : "all";
    const limit = limitRaw && Number.isFinite(Number(limitRaw)) ? Math.min(Math.max(Number(limitRaw), 10), 100) : 50;

    const BOARDS = new Set(["champion-sales", "followers", "followers-increment", "darkhorse-creator", "darkhorse-seller", "hot-live", "most-views-live"]);
    const board = boardRaw && BOARDS.has(boardRaw) ? (boardRaw as "champion-sales") : "champion-sales";

    const [{ rows, dryRun }, filters] = await Promise.all([
      fetchTopCreators({ period, role, board, limit, categoryId }),
      getLeaderboardFilters(),
    ]);

    return NextResponse.json({ creators: rows, filters, dryRun });
  } catch (error) {
    console.error("Error in market top creators:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ creators: [], filters: null, notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
