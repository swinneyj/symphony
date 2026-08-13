import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adSources, adRemixes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { restructureAd } from "@/lib/ads/restructure";
import { resolveProductLink } from "@/lib/ads/product-link";

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
    const isProduct = source.platform === "product";
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

    const body = await request.json().catch(() => null);
    const variants = body?.variants ?? 3;
    const tone = typeof body?.tone === "string" ? body.tone : undefined;
    const userId = session.user.id;

    // Product sources: rebuild the product brief (fresh og tags from the
    // product page) and append the shop video transcript when the worker
    // transcribed one — remixes sell the product, informed by its own VO.
    let input = source.rawText;
    if (isProduct) {
      const brief = await resolveProductLink(source.sourceUrl)
        .then((p) => p?.brief ?? `Product: ${source.title ?? ""}`)
        .catch(() => `Product: ${source.title ?? ""}`);
      const parts = [brief];
      if (source.status === "transcribed" && source.rawText?.trim()) {
        parts.push(
          `Shop video transcript:\n"""${source.rawText.trim().slice(0, 4000)}"""`
        );
      }
      input = parts.join("\n\n");
    }

    const remixes = await restructureAd(input, {
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
