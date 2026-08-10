import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatches, videoBatchJobs, products } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * GET /api/batches/[id] — batch header + jobs (with product name/image).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [batch] = await db.select().from(videoBatches).where(eq(videoBatches.id, id)).limit(1);
    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }
    if (!(await hasWorkspaceAccess(batch.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const jobs = await db
      .select({
        id: videoBatchJobs.id,
        jobType: videoBatchJobs.jobType,
        status: videoBatchJobs.status,
        script: videoBatchJobs.script,
        footageUrl: videoBatchJobs.footageUrl,
        voiceoverUrl: videoBatchJobs.voiceoverUrl,
        finalUrl: videoBatchJobs.finalUrl,
        posted: videoBatchJobs.posted,
        postedAt: videoBatchJobs.postedAt,
        error: videoBatchJobs.error,
        metadata: videoBatchJobs.metadata,
        retries: videoBatchJobs.retries,
        createdAt: videoBatchJobs.createdAt,
        updatedAt: videoBatchJobs.updatedAt,
        productId: videoBatchJobs.productId,
        productName: products.name,
        productImage: products.processedImageUrl,
        productOriginalImage: products.originalImageUrl,
      })
      .from(videoBatchJobs)
      .innerJoin(products, eq(videoBatchJobs.productId, products.id))
      .where(eq(videoBatchJobs.batchId, id))
      .orderBy(asc(videoBatchJobs.createdAt));

    return NextResponse.json({ ...batch, jobs });
  } catch (error) {
    console.error("Error fetching batch:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
