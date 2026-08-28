import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchProductAnalytics } from "@/lib/market";
import type { MarketSource } from "@/lib/market/types";

/**
 * GET /api/market/products/analytics?workspaceId&source=echotik&sourceProductId=...
 * Per-product drill-down for LIVE (unstored) search rows — same payload as the
 * [id]/analytics route but keyed by source id instead of a DB row id.
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

    const analytics = await fetchProductAnalytics(source, sourceProductId);
    return NextResponse.json({ analytics });
  } catch (error) {
    console.error("Error in market analytics:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ analytics: null, notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
