import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatchJobs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * PATCH /api/batches/[id]/jobs/[jobId] — toggle the manual Post Queue flag.
 * Body: { posted: boolean }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, jobId } = await params;

    const [job] = await db
      .select()
      .from(videoBatchJobs)
      .where(and(eq(videoBatchJobs.id, jobId), eq(videoBatchJobs.batchId, id)));
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!(await hasWorkspaceAccess(job.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const posted = Boolean(body.posted);
    if (posted && (job.status !== "done" || !job.finalUrl)) {
      return NextResponse.json(
        { error: "Job has no finished video to mark as posted" },
        { status: 409 }
      );
    }

    const [updated] = await db
      .update(videoBatchJobs)
      .set({
        posted,
        postedAt: posted ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(videoBatchJobs.id, job.id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating job:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
