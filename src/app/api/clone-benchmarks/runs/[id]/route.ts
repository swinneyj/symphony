import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { cloneBenchmarkRatings, cloneBenchmarkRuns, cloneBenchmarks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

const scoreFields = ["faceLikeness", "voiceLikeness", "lipSync", "movementNaturalness", "overallRealism"] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const [run] = await db.select({ run: cloneBenchmarkRuns, workspaceId: cloneBenchmarks.workspaceId })
      .from(cloneBenchmarkRuns).innerJoin(cloneBenchmarks, eq(cloneBenchmarkRuns.benchmarkId, cloneBenchmarks.id))
      .where(eq(cloneBenchmarkRuns.id, id)).limit(1);
    if (!run) return NextResponse.json({ error: "Benchmark run not found" }, { status: 404 });
    if (!(await hasWorkspaceAccess(run.workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const values: Record<string, unknown> = { runId: id, userId: session.user.id, updatedAt: new Date() };
    for (const field of scoreFields) {
      if (body[field] !== undefined) {
        const score = Number(body[field]);
        if (!Number.isInteger(score) || score < 1 || score > 5) return NextResponse.json({ error: `${field} must be 1-5` }, { status: 400 });
        values[field] = score;
      }
    }
    if (body.notes !== undefined) values.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
    const [rating] = await db.insert(cloneBenchmarkRatings).values(values as typeof cloneBenchmarkRatings.$inferInsert)
      .onConflictDoUpdate({ target: [cloneBenchmarkRatings.runId, cloneBenchmarkRatings.userId], set: values }).returning();
    return NextResponse.json(rating);
  } catch (error) {
    console.error("Error rating clone benchmark run:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
