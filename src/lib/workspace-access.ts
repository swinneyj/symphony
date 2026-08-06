import { db } from "@/db";
import { workspaceMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Returns true if the user is a member of the given workspace.
 * Used to gate workspace-scoped resources (products, batches, jobs).
 */
export async function hasWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  return rows.length > 0;
}
