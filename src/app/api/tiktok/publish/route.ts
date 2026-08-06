import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import {
  fetchTikTokCreatorInfo,
  getTikTokAccountForMember,
  initializeTikTokUpload,
  sendVideoToTikTok,
} from "@/lib/tiktok";

export const runtime = "nodejs";

const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const MAX_DEMO_VIDEO_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const workspaceId = String(formData.get("workspaceId") || "");
    const mode = String(formData.get("mode") || "") as "draft" | "direct";
    const caption = String(formData.get("caption") || "").trim();
    const privacyLevel = String(formData.get("privacyLevel") || "");
    const allowComment = formData.get("allowComment") === "true";
    const allowDuet = formData.get("allowDuet") === "true";
    const allowStitch = formData.get("allowStitch") === "true";
    const consent = formData.get("consent") === "true";
    const video = formData.get("video");

    if (!workspaceId || !["draft", "direct"].includes(mode)) {
      return NextResponse.json({ error: "Invalid TikTok publishing request" }, { status: 400 });
    }
    if (!(video instanceof File) || video.size === 0) {
      return NextResponse.json({ error: "Choose an MP4, MOV, or WebM video" }, { status: 400 });
    }
    if (!ACCEPTED_VIDEO_TYPES.has(video.type)) {
      return NextResponse.json({ error: "TikTok supports MP4, MOV, or WebM for this demo" }, { status: 400 });
    }
    if (video.size > MAX_DEMO_VIDEO_BYTES) {
      return NextResponse.json({ error: "Use a video smaller than 4 MB for this web demo" }, { status: 400 });
    }
    if (mode === "direct" && (!privacyLevel || !consent)) {
      return NextResponse.json(
        { error: "Select a privacy setting and accept TikTok's Music Usage Confirmation" },
        { status: 400 }
      );
    }

    const result = await getTikTokAccountForMember(workspaceId, session.user.id);
    if (!result.authorized) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!result.account) {
      return NextResponse.json({ error: "Connect TikTok first" }, { status: 409 });
    }

    if (mode === "direct") {
      const creator = await fetchTikTokCreatorInfo(result.account.accessToken);
      if (!creator.privacy_level_options.includes(privacyLevel)) {
        return NextResponse.json({ error: "That privacy option is no longer available" }, { status: 409 });
      }
    }

    const initialized = await initializeTikTokUpload({
      accessToken: result.account.accessToken,
      mode,
      fileSize: video.size,
      caption,
      privacyLevel,
      allowComment,
      allowDuet,
      allowStitch,
    });
    const bytes = new Uint8Array(await video.arrayBuffer());
    await sendVideoToTikTok(initialized.upload_url, bytes, video.type);

    return NextResponse.json({
      success: true,
      mode,
      publishId: initialized.publish_id,
      uploadedBytes: video.size,
      capability: mode === "draft" ? "video.upload" : "video.publish",
      nextStep: mode === "draft"
        ? "TikTok delivered the video to the creator inbox for final editing and posting."
        : "TikTok accepted the private direct post and is processing it.",
    });
  } catch (error) {
    console.error("TikTok publishing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TikTok publishing failed" },
      { status: 502 }
    );
  }
}
