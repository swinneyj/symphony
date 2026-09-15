import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { blobToken } from "@/lib/blob-token";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      token: blobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = JSON.parse(clientPayload ?? "{}") as { workspaceId?: string };
        if (!payload.workspaceId || !(await hasWorkspaceAccess(payload.workspaceId, userId))) {
          throw new Error("Forbidden");
        }
        if (!pathname.startsWith(`creator-training/${payload.workspaceId}/`)) {
          throw new Error("Invalid upload path");
        }
        return {
          allowedContentTypes: ["video/*", "audio/*"],
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ workspaceId: payload.workspaceId, userId }),
        };
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error authorizing creator media upload:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload authorization failed" },
      { status: 400 }
    );
  }
}
