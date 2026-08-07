import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { socialAccounts, workspaceMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/accounts/[id]
 * Disconnects a social account. Only workspace members can disconnect.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [account] = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.id, id))
      .limit(1);

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const [membership] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, account.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting social account:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
