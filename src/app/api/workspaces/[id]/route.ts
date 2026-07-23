import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  workspaces,
  workspaceMembers,
  socialAccounts,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify user is a member of this workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [workspace] = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        description: workspaces.description,
        logo: workspaces.logo,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
        memberCount: sql<number>`(SELECT COUNT(*) FROM ${workspaceMembers} WHERE ${workspaceMembers.workspaceId} = ${workspaces.id})`,
        socialAccountCount: sql<number>`(SELECT COUNT(*) FROM ${socialAccounts} WHERE ${socialAccounts.workspaceId} = ${workspaces.id})`,
      })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error("Error getting workspace:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, slug, description, logo } = body;

    // Verify user is a member (admin or owner can update)
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const role = membership[0].role;
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "Workspace name cannot be empty" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    if (slug !== undefined) {
      if (typeof slug !== "string" || slug.trim().length === 0) {
        return NextResponse.json(
          { error: "Workspace slug cannot be empty" },
          { status: 400 }
        );
      }
      // Check slug uniqueness (excluding current workspace)
      const existing = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(eq(workspaces.slug, slug.trim()), sql`${workspaces.id} != ${id}`)
        )
        .limit(1);
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "A workspace with this slug already exists" },
          { status: 409 }
        );
      }
      updateData.slug = slug.trim();
    }
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }
    if (logo !== undefined) {
      updateData.logo = logo;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating workspace:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Only owner can delete
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (membership[0].role !== "owner") {
      return NextResponse.json(
        { error: "Only the workspace owner can delete the workspace" },
        { status: 403 }
      );
    }

    await db.delete(workspaces).where(eq(workspaces.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting workspace:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
