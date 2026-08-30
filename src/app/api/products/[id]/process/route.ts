import { NextResponse } from "next/server";
import { flagJobs } from "@/lib/market/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products, videoBatchJobs, videoFormulas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/products/[id]/process
 * Enqueues a product_process job for the worker:
 * download original image -> (Phase 2: rembg background removal + 9:16 canvas)
 * -> upload processed image to Blob -> mark product "ready".
 *
 * Idempotent: if the product already has a queued/running product_process job,
 * returns that job instead of creating a duplicate.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (!(await hasWorkspaceAccess(product.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Optional formulaId → enqueue a scene_render job instead of product_process.
    // The card's "Generate Scene" dropdown passes the chosen formula (scene).
    const body = (await request.json().catch(() => ({}))) as {
      formulaId?: string;
    };
    if (body.formulaId) {
      const [formula] = await db
        .select()
        .from(videoFormulas)
        .where(eq(videoFormulas.id, body.formulaId))
        .limit(1);
      if (!formula) {
        return NextResponse.json({ error: "Formula not found" }, { status: 404 });
      }
      const [job] = await db
        .insert(videoBatchJobs)
        .values({
          workspaceId: product.workspaceId,
          productId: product.id,
          formulaId: formula.id,
          jobType: "scene_render",
          status: "queued",
          script: formula.scriptTemplate ?? "",
          metadata: {},
        })
        .returning();
      await Promise.all([flagJobs("video"), flagJobs("img")]);
      return NextResponse.json(job, { status: 201 });
    }

    if (!product.originalImageUrl) {
      return NextResponse.json(
        { error: "Product has no original image to process" },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(videoBatchJobs)
      .where(eq(videoBatchJobs.productId, id))
      .limit(1);

    if (
      existing &&
      (existing.status === "queued" || existing.status === "running")
    ) {
      return NextResponse.json(existing, { status: 200 });
    }

    const [job] = await db
      .insert(videoBatchJobs)
      .values({
        workspaceId: product.workspaceId,
        productId: product.id,
        jobType: "product_process",
        status: "queued",
        metadata: {
          originalImageUrl: product.originalImageUrl,
          name: product.name,
        },
      })
      .returning();

    await Promise.all([flagJobs("video"), flagJobs("img")]);
    await db
      .update(products)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(products.id, product.id));

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    console.error("Error enqueueing product process job:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
