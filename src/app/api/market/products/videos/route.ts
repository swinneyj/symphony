import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchProductVideos } from "@/lib/market";
import type { MarketSource } from "@/lib/market/types";

/**
 * GET /api/market/products/videos?workspaceId&source=echotik&sourceProductId=...
 * Videos featuring a product (content layer) — sorted by video GMV, enriched
 * with paid-promotion ("Promote") + 1/7/30d engagement deltas via video/detail
 * batch (2 EchoTik calls total, cached 6h). Works for live AND stored rows.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const sourceProductId = searchParams.get("sourceProductId");
    const source = (searchParams.get("source") ?? "echotik") as MarketSource;
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!sourceProductId) return NextResponse.json({ error: "sourceProductId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { rows, dryRun } = await fetchProductVideos(source, sourceProductId);
    const promoteCount = rows.filter((v) => v.isAd).length;
    return NextResponse.json({ videos: rows, promoteCount, dryRun });
  } catch (error) {
    console.error("Error in market product videos:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ videos: [], notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
