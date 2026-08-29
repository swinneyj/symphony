import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchInfluencerProducts } from "@/lib/market";

/**
 * GET /api/market/products/influencer-products?workspaceId&source=echotik&influencerId=...
 * Every product promoted by a creator/influencer (influencers/{id}/products, cached 6h).
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const influencerId = searchParams.get("influencerId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!influencerId) return NextResponse.json({ error: "influencerId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { rows, dryRun } = await fetchInfluencerProducts(influencerId);
    return NextResponse.json({ products: rows, dryRun });
  } catch (error) {
    console.error("Error in market influencer products:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    if (msg.includes("credentials missing")) {
      return NextResponse.json({ products: [], notice: msg }, { status: 200 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
