import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketBookmarks } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * Saved seller / influencer bookmarks (Market tab).
 *   GET    /api/market/bookmarks?workspaceId           — all bookmarks
 *   POST   /api/market/bookmarks { workspaceId, kind, source, sourceId, name, avatarUrl, category, followers }
 *   DELETE /api/market/bookmarks?workspaceId&kind&source&sourceId
 * Idempotent: re-bookmarking is a no-op (returns the existing row).
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
    const rows = await db
      .select()
      .from(marketBookmarks)
      .where(eq(marketBookmarks.workspaceId, workspaceId))
      .orderBy(desc(marketBookmarks.createdAt));
    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Error in market bookmarks GET:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const { workspaceId, kind, source, sourceId, name, avatarUrl, category, followers } = body;
    if (!workspaceId || !kind || !sourceId || !name) {
      return NextResponse.json(
        { error: "workspaceId, kind, sourceId, name required" },
        { status: 400 }
      );
    }
    if (!["influencer", "shop"].includes(kind)) {
      return NextResponse.json({ error: `unknown kind: ${kind}` }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [row] = await db
      .insert(marketBookmarks)
      .values({
        workspaceId,
        kind,
        source: String(source ?? "echotik"),
        sourceId,
        name: String(name),
        avatarUrl: avatarUrl ?? null,
        category: category ?? null,
        followers: followers != null ? Math.round(Number(followers)) : null,
      })
      .onConflictDoNothing()
      .returning();
    return NextResponse.json({ row, added: Boolean(row) }, { status: row ? 201 : 200 });
  } catch (error) {
    console.error("Error in market bookmarks POST:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const kind = searchParams.get("kind");
    const source = searchParams.get("source") ?? "echotik";
    const sourceId = searchParams.get("sourceId");
    if (!workspaceId || !kind || !sourceId) {
      return NextResponse.json({ error: "workspaceId, kind, sourceId required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db
      .delete(marketBookmarks)
      .where(
        and(
          eq(marketBookmarks.workspaceId, workspaceId),
          eq(marketBookmarks.kind, kind),
          eq(marketBookmarks.source, source),
          eq(marketBookmarks.sourceId, sourceId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error in market bookmarks DELETE:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
