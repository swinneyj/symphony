import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adSources, adRemixes } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * GET /api/ads/steal/[id] — source detail (transcript) + its remixes.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const [source] = await db
      .select()
      .from(adSources)
      .where(eq(adSources.id, id))
      .limit(1);
    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!(await hasWorkspaceAccess(source.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const remixes = await db
      .select()
      .from(adRemixes)
      .where(eq(adRemixes.adSourceId, id))
      .orderBy(asc(adRemixes.createdAt));

    return NextResponse.json({ ...source, remixes });
  } catch (error) {
    console.error("Error loading ad source:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
