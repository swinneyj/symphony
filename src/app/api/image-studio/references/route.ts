import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/lib/auth";
import { blobToken } from "@/lib/blob-token";
import { presignBlobGet } from "@/lib/blob-presign";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

/** Upload supporting product/detail references without adding library clutter. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const workspaceId = (form.get("workspaceId") as string | null) ?? "";
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (files.length === 0 || files.length > MAX_FILES) {
      return NextResponse.json({ error: `Select 1–${MAX_FILES} images` }, { status: 400 });
    }

    const invalid = files.find((file) => !file.type.startsWith("image/") || file.size > MAX_BYTES);
    if (invalid) {
      return NextResponse.json(
        { error: `"${invalid.name}" must be an image no larger than 10MB` },
        { status: 400 }
      );
    }

    const uploaded = await Promise.all(
      files.map(async (file, index) => {
        const ext = (file.type.split("/")[1] ?? "png").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "png";
        const blob = await put(
          `image-studio/references/${workspaceId}/${Date.now()}-${index}.${ext}`,
          file,
          {
            access: "private",
            addRandomSuffix: true,
            contentType: file.type,
            token: blobToken(),
          }
        );
        return {
          name: file.name,
          url: blob.url,
          previewUrl: await presignBlobGet(blob.url),
        };
      })
    );

    return NextResponse.json({ references: uploaded }, { status: 201 });
  } catch (error) {
    console.error("[image-studio/references]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
