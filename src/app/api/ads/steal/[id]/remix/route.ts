import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adSources, adRemixes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { restructureAd } from "@/lib/ads/restructure";

/**
 * POST /api/ads/steal/[id]/remix — { variants?, tone? }
 * LLM rewrites the source transcript (or, for product links, the product
 * info) into N original scripts. Requires transcribed (video) or fetched
 * (product link) sources.
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
    const isProduct = source.platform === "product" || source.status === "fetched";
    if (!source.rawText?.trim()) {
      return NextResponse.json(
        { error: "Source has no content to remix" },
        { status: 409 }
      );
    }
    if (!isProduct && source.status !== "transcribed") {
      return NextResponse.json(
        { error: "Source is not transcribed yet" },
        { status: 409 }
      );
    }
    if (isProduct && source.status !== "fetched") {
      return NextResponse.json(
        { error: "Product info is not resolved yet" },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => null);
    const variants = body?.variants ?? 3;
    const tone = typeof body?.tone === "string" ? body.tone : undefined;
    const userId = session.user.id;

    const remixes = await restructureAd(source.rawText, {
      variants,
      tone,
      mode: isProduct ? "product" : "transcript",
    });
    if (remixes.length === 0) {
      return NextResponse.json(
        { error: "Could not generate remixes" },
        { status: 500 }
      );
    }

    const rows = await db
      .insert(adRemixes)
      .values(
        remixes.map((r) => ({
          adSourceId: id,
          workspaceId: source.workspaceId,
          createdById: userId,
          hook: r.hook,
          angle: r.angle,
          tone: r.tone,
          script: r.script,
        }))
      )
      .returning();

    return NextResponse.json(rows, { status: 201 });
  } catch (error) {
    console.error("Error generating remixes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
