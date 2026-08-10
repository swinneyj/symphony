import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaces, workspaceMembers } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;

  // Get user's workspaces
  const userWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      createdAt: workspaces.createdAt,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaces.createdAt));

  // Get or create default workspace
  let activeWorkspace = userWorkspaces[0];
  if (!activeWorkspace) {
    const [newWorkspace] = await db
      .insert(workspaces)
      .values({
        name: "My Workspace",
        slug: `my-workspace-${userId.slice(0, 8)}`,
      })
      .returning();

    await db.insert(workspaceMembers).values({
      workspaceId: newWorkspace.id,
      userId,
      role: "owner",
    });

    activeWorkspace = {
      id: newWorkspace.id,
      name: newWorkspace.name,
      slug: newWorkspace.slug,
      createdAt: newWorkspace.createdAt,
      role: "owner",
    };
  }

  return (
    <DashboardShell
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
      workspace={activeWorkspace}
      workspaces={userWorkspaces}
    >
      {children}
    </DashboardShell>
  );
}
