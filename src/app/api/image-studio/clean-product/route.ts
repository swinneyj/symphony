import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products, videoBatchJobs } from "@/db/schema";
import { flagJobs } from "@/lib/market/cache";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Queue a fidelity-first clean product pack shot before lifestyle generation. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const productId = typeof body.productId === "string" ? body.productId : "";
    if (!workspaceId || !productId) {
      return NextResponse.json({ error: "workspaceId and productId are required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product || product.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (!product.originalImageUrl) {
      return NextResponse.json({ error: "Product has no source image" }, { status: 400 });
    }
    const gallery = ((product.metadata ?? {}) as { galleryImageUrls?: unknown }).galleryImageUrls;
    const refs = Array.isArray(gallery)
      ? gallery.filter((url): url is string => typeof url === "string" && url !== product.originalImageUrl).slice(0, 5)
      : [];

    const [job] = await db.insert(videoBatchJobs).values({
      workspaceId,
      productId,
      jobType: "scene_render",
      status: "queued",
      metadata: {
        sourceImageUrl: product.originalImageUrl,
        referenceImageUrls: refs,
        productCleanup: true,
        fidelityLock: true,
        quality: "pro",
        strictProvider: true,
        requestedImageModel: "gemini-3-pro-image",
        aspectRatio: "1:1",
        imageSize: "2K",
        noChain: true,
        imageStudio: true,
        scenePromptTemplate:
          "Create a clean, catalog-quality product reference on a pure white #FFFFFF seamless background. Isolate only the physical retail products and packaging shown across the references. Remove promotional headlines, badges, arrows, decorative graphics, scenery, props, and any text that is not printed on the physical packaging. Preserve the exact brand logo, package text, colors, flavor variants, dimensions, materials, and proportions. Show the complete products centered, front-facing, evenly spaced, fully inside frame, with a subtle realistic grounding shadow. No hands, people, extra products, floating objects, or invented packaging.",
      },
    }).returning();
    await db.update(products).set({ status: "processing", updatedAt: new Date() }).where(eq(products.id, productId));
    await flagJobs("video");
    return NextResponse.json({ jobId: job.id }, { status: 201 });
  } catch (error) {
    console.error("[image-studio/clean-product]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare product" },
      { status: 500 }
    );
  }
}
