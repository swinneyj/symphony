/**
 * TikTok Content Posting API (Direct Post) client.
 *
 * App has Content Posting API + Direct Post enabled (dev-portal approved,
 * scopes: video.publish, video.upload). Uses PULL_FROM_URL so the worker's
 * Blob-hosted final video posts without an upload step.
 *
 * POST_DRY_RUN=1 simulates the whole flow (no external call).
 */

const API = "https://open.tiktokapis.com/v2";
const DRY_RUN = ["1", "true"].includes((process.env.POST_DRY_RUN ?? "").toLowerCase());

export type PostPrivacyLevel = "SELF_ONLY" | "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS";

export type PublishInitResult = {
  publishId: string;
  dryRun: boolean;
};

export type PublishStatusResult = {
  status: string; // PUBLISH_COMPLETE | FAILED | PROCESSING_* | SENDING | ...
  failReason?: string;
  dryRun: boolean;
};

export async function initVideoPublish(opts: {
  accessToken: string;
  videoUrl: string; // public URL (Blob)
  title: string;
  privacyLevel: PostPrivacyLevel;
  coverTimestampMs?: number;
  /**
   * Label the post as AI-generated on TikTok (is_ai_generated). DEFAULT TRUE:
   * every video this app publishes is AI-generated (Nano Banana renders,
   * Kling/Sora footage). TikTok requires the label — prevention at source.
   * Pass false ONLY for genuinely human-made content.
   */
  isAiGenerated?: boolean;
}): Promise<PublishInitResult> {
  if (DRY_RUN) {
    return { publishId: `dryrun-${Date.now()}`, dryRun: true };
  }

  const res = await fetch(`${API}/post/publish/video/init/`, {
    method: "POST",
    headers: {
      authorization: "Bearer " + opts.accessToken,
      "content-type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: opts.title,
        privacy_level: opts.privacyLevel,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
        ...(opts.isAiGenerated !== false ? { is_ai_generated: true } : {}),
        ...(opts.coverTimestampMs != null ? { video_cover_timestamp_ms: opts.coverTimestampMs } : {}),
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: opts.videoUrl,
      },
    }),
  });

  const body = (await res.json().catch(() => null)) as { data?: { publish_id?: string }; error?: { message?: string } } | null;
  if (!res.ok || !body?.data?.publish_id) {
    throw new Error(`tiktok init failed (${res.status}): ${body?.error?.message ?? JSON.stringify(body)}`);
  }
  return { publishId: body.data.publish_id, dryRun: false };
}

export async function fetchPublishStatus(opts: {
  accessToken: string;
  publishId: string;
}): Promise<PublishStatusResult> {
  if (DRY_RUN) {
    return { status: "PUBLISH_COMPLETE", dryRun: true };
  }

  const res = await fetch(`${API}/post/publish/status/fetch/`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts.accessToken}`,
      "content-type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({ publish_id: opts.publishId }),
  });

  const body = (await res.json().catch(() => null)) as
    | { data?: { status?: string; fail_reason?: string } }
    | null;
  if (!res.ok || !body?.data?.status) {
    throw new Error(`tiktok status fetch failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return { status: body.data.status, failReason: body.data.fail_reason, dryRun: false };
}
