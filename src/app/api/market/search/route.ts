import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { searchMarketEntities } from "@/lib/market";
import type { MarketSearchType } from "@/lib/market/types";

/**
 * GET /api/market/search?workspaceId&type=product|influencer|shop|video&keyword=...&region=US&limit=20
 * Global EchoTik site search across entity types (search/products,
 * search/influencers, search/sellers, search/videos). Cached 30 min.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const type = (searchParams.get("type") ?? "product") as MarketSearchType;
    const keyword = searchParams.get("keyword")?.trim() ?? "";
    const region = searchParams.get("region") ?? "US";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!["product", "influencer", "shop", "video"].includes(type)) {
      return NextResponse.json({ error: `unknown type: ${type}` }, { status: 400 });
    }
    if (!keyword) return NextResponse.json({ rows: [], dryRun: false });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { rows, dryRun } = await searchMarketEntities(type, keyword, region, limit);
    return NextResponse.json({ rows, dryRun });
  } catch (error) {
    console.error("Error in market search:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ rows: [], notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
