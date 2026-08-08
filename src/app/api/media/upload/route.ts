import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaAssets, workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Server-side media upload: multipart file → private Blob store → media_assets row.
 * Browser never sees BLOB_READ_WRITE_TOKEN. Finished videos/images are served
 * back through the public proxy route (GET /api/media/[id]/public) which IG,
 * TikTok PULL_FROM_URL and in-app previews all use.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;
    const workspaceId = (form.get("workspaceId") as string | null) ?? "";

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Verify membership so users can only upload into their own workspaces
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

    const mime = file.type || "application/octet-stream";
    const mediaType = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : mime.startsWith("audio/")
          ? "audio"
          : "document";

    const blob = await put(`media/${workspaceId}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`, file, {
      access: "private",
      addRandomSuffix: true,
      contentType: mime,
    });

    const [asset] = await db
      .insert(mediaAssets)
      .values({
        workspaceId,
        uploadedById: session.user.id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: mime,
        mediaType,
        url: blob.url,
      })
      .returning();

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Error uploading media:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
