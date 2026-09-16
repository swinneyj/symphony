import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { cloneBenchmarks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const [benchmark] = await db.select().from(cloneBenchmarks).where(eq(cloneBenchmarks.id, id)).limit(1);
    if (!benchmark) return NextResponse.json({ error: "Benchmark not found" }, { status: 404 });
    if (!(await hasWorkspaceAccess(benchmark.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await db.delete(cloneBenchmarks).where(eq(cloneBenchmarks.id, id));
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting clone benchmark:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
