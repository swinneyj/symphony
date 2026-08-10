import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { posts, workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { publishPostToPlatforms } from "@/lib/publish";

/**
 * POST /api/posts/[id]/publish
 * Body: { platforms?: string[] } — publish now to the post's selected
 * platforms (or a subset). Draft-first: TikTok stays draft-mode once media
 * wiring lands; FB/IG are direct by platform nature (no draft API).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const requested = Array.isArray(body?.platforms) ? body.platforms : undefined;

    const [post] = await db
      .select({ workspaceId: posts.workspaceId })
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);
    if (!post) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, post.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);
    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await publishPostToPlatforms(id, { platforms: requested });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error publishing post:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
