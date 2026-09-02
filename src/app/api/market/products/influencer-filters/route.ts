import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchInfluencerProductFilters } from "@/lib/market";

/**
 * GET /api/market/products/influencer-filters?workspaceId&influencerId
 * Category filter options for a creator's products (cached 6h). Kept separate
 * so the filter bar loads once per drill instead of riding every product fetch.
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

    const { categories, dryRun } = await fetchInfluencerProductFilters(influencerId);
    return NextResponse.json({ categories, dryRun });
  } catch (error) {
    console.error("Error in market influencer filters:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
