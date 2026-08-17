import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import {
  fetchTikTokCreatorInfo,
  ensureFreshTikTokAccessToken,
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
    const accountId = String(formData.get("accountId") || "");
    const mode = String(formData.get("mode") || "") as "draft" | "direct";
    const caption = String(formData.get("caption") || "").trim();
    const privacyLevel = String(formData.get("privacyLevel") || "");
    const allowComment = formData.get("allowComment") === "true";
    const allowDuet = formData.get("allowDuet") === "true";
    const allowStitch = formData.get("allowStitch") === "true";
    const contentDisclosure = formData.get("contentDisclosure") === "true";
    const brandOrganic = formData.get("brandOrganic") === "true";
    const brandedContent = formData.get("brandedContent") === "true";
    const consent = formData.get("consent") === "true";
    const videoDurationSec = Number(formData.get("videoDurationSec") || 0);
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
    if (mode === "direct" && contentDisclosure && !brandOrganic && !brandedContent) {
      return NextResponse.json(
        { error: "Indicate whether this content promotes your brand, a third party, or both" },
        { status: 400 }
      );
    }
    if (mode === "direct" && brandedContent && privacyLevel === "SELF_ONLY") {
      return NextResponse.json(
        { error: "Branded content visibility cannot be set to private" },
        { status: 400 }
      );
    }
    if (mode === "direct" && (!Number.isFinite(videoDurationSec) || videoDurationSec <= 0)) {
      return NextResponse.json({ error: "Could not verify the video duration" }, { status: 400 });
    }

    const result = await getTikTokAccountForMember(workspaceId, session.user.id);
    if (!result.authorized) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!result.account) {
      return NextResponse.json({ error: "Connect TikTok first" }, { status: 409 });
    }

    // Multi-account: pick the requested connected account, else fall back to
    // the first connected one (keeps old single-account behavior).
    let account = result.account;
    if (accountId) {
      const [requested] = await db
        .select()
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.workspaceId, workspaceId),
            eq(socialAccounts.platform, "tiktok"),
            eq(socialAccounts.id, accountId),
            eq(socialAccounts.status, "connected")
          )
        )
        .limit(1);
      if (requested) account = requested;
    }

    const accessToken = await ensureFreshTikTokAccessToken(account);

    if (mode === "direct") {
      const creator = await fetchTikTokCreatorInfo(accessToken);
      if (!creator.privacy_level_options.includes(privacyLevel)) {
        return NextResponse.json({ error: "That privacy option is no longer available" }, { status: 409 });
      }
      if (videoDurationSec > creator.max_video_post_duration_sec) {
        return NextResponse.json(
          { error: `This creator currently allows videos up to ${creator.max_video_post_duration_sec} seconds` },
          { status: 409 }
        );
      }
      if ((creator.comment_disabled && allowComment) || (creator.duet_disabled && allowDuet) || (creator.stitch_disabled && allowStitch)) {
        return NextResponse.json(
          { error: "One or more interaction settings are no longer available. Refresh the creator settings and try again." },
          { status: 409 }
        );
      }
    }

    const initialized = await initializeTikTokUpload({
      accessToken,
      mode,
      fileSize: video.size,
      caption,
      privacyLevel,
      allowComment,
      allowDuet,
      allowStitch,
      brandContentToggle: contentDisclosure && brandedContent,
      brandOrganicToggle: contentDisclosure && brandOrganic,
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
