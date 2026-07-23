import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaAssets, workspaceMembers } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify user is a member of this workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const assets = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.workspaceId, workspaceId))
      .orderBy(desc(mediaAssets.createdAt));

    return NextResponse.json(assets);
  } catch (error) {
    console.error("Error listing media assets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      workspaceId,
      fileName,
      fileSize,
      mimeType,
      mediaType,
      url,
      thumbnailUrl,
      width,
      height,
      duration,
      alt,
    } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    if (!fileName) {
      return NextResponse.json(
        { error: "fileName is required" },
        { status: 400 }
      );
    }

    if (!mediaType) {
      return NextResponse.json(
        { error: "mediaType is required" },
        { status: 400 }
      );
    }

    const validMediaTypes = ["image", "video", "audio", "document"];
    if (!validMediaTypes.includes(mediaType)) {
      return NextResponse.json(
        { error: "Invalid mediaType. Must be one of: image, video, audio, document" },
        { status: 400 }
      );
    }

    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    // Verify user is a member of this workspace
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [asset] = await db
      .insert(mediaAssets)
      .values({
        workspaceId,
        uploadedById: session.user.id,
        fileName,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
        mediaType,
        url,
        thumbnailUrl: thumbnailUrl || null,
        width: width || null,
        height: height || null,
        duration: duration || null,
        alt: alt || null,
      })
      .returning();

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Error creating media asset:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 }
      );
    }

    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id))
      .limit(1);

    if (!asset) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Verify user is a member of the workspace that owns this asset
    const membership = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, asset.workspaceId),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.delete(mediaAssets).where(eq(mediaAssets.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting media asset:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
