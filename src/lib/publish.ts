/**
 * Cross-platform publish dispatcher (spec docs/IG-FB-PUBLISHING-SPEC.md, P3).
 *
 * Fans a post out to each target platform adapter and records per-platform
 * state in `platformConfigs[platform].publish`.
 *
 * Target resolution (both conventions supported):
 *  - new map shape:   { facebook: {}, instagram: {} }            → keys
 *  - legacy shape:    { platforms: ["instagram", "facebook"] }   → .platforms
 *
 * Semantics:
 *  - Facebook: feed post via the page-scoped token (live — P1 verified).
 *  - Instagram: media attach → UUID-gated public proxy URL → image/reel
 *    container → publish (live — P4). IG has no delete API: real publish
 *    tests are permanent.
 *  - TikTok: video attach → direct private post via the Content Posting API
 *    (live — approved app, verified SELF_ONLY flow).
 *  - youtube / x / linkedin: no adapter yet → skipped.
 */

import { db } from "@/db";
import { posts, socialAccounts, mediaAssets } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { PlatformPublishState, PlatformPostConfig } from "@/db/schema";
import { facebookPostFeed } from "@/lib/meta/facebook";
import { instagramPostImage, instagramPostReel } from "@/lib/meta/instagram";
import { initializeTikTokUpload, sendVideoToTikTok } from "@/lib/tiktok";
import { blobToken } from "@/lib/blob-token";

const KNOWN_PLATFORMS = ["tiktok", "youtube", "instagram", "facebook", "x", "linkedin"] as const;

export async function publishPostToPlatforms(
  postId: string,
  opts?: { platforms?: string[] }
): Promise<{
  postId: string;
  results: Record<string, PlatformPublishState>;
  status: "published" | "failed" | "partial";
}> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error("Post not found");

  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.workspaceId, post.workspaceId));

  const config: Record<string, PlatformPostConfig> = post.platformConfigs ?? {};
  // Legacy composer shape stores the list under a "platforms" key with an
  // array value — cast around the map type to read it.
  const legacyPlatforms = (config as unknown as { platforms?: string[] }).platforms;
  const targets =
    opts?.platforms ??
    legacyPlatforms ??
    Object.keys(config).filter((k) => (KNOWN_PLATFORMS as readonly string[]).includes(k));

  const results: Record<string, PlatformPublishState> = {};

  for (const platform of targets) {
    const prior = config[platform]?.publish;
    if (prior?.status === "published") {
      results[platform] = prior;
      continue;
    }
    try {
      const state = await publishToPlatform(platform, post, accounts);
      results[platform] = state;
      config[platform] = { ...config[platform], publish: state };
    } catch (error) {
      const state: PlatformPublishState = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
      results[platform] = state;
      config[platform] = { ...config[platform], publish: state };
    }
  }

  const states = Object.values(results);
  const published = states.filter((s) => s.status === "published").length;
  const overall: "published" | "failed" | "partial" =
    published === 0 ? "failed" : states.some((s) => s.status === "failed") ? "partial" : "published";

  const [updated] = await db
    .update(posts)
    .set({
      platformConfigs: config,
      status: overall === "failed" ? "failed" : "published",
      publishedAt: published > 0 ? new Date() : post.publishedAt,
      failureReason:
        overall === "published"
          ? null
          : states
              .filter((s) => s.status === "failed")
              .map((s) => s.error)
              .join("; ") || null,
    })
    .where(eq(posts.id, postId))
    .returning();

  return { postId: updated.id, results, status: overall };
}

async function publishToPlatform(
  platform: string,
  post: typeof posts.$inferSelect,
  accounts: Array<typeof socialAccounts.$inferSelect>
): Promise<PlatformPublishState> {
  const config = (post.platformConfigs ?? {}) as Record<string, PlatformPostConfig>;
  // Composer-picked account (platformConfigs[platform].accountId) wins;
  // fall back to the first connected account for legacy posts.
  const connected = accounts.filter(
    (a) => a.platform === platform && a.status === "connected"
  );
  const account = config[platform]?.accountId
    ? connected.find((a) => a.id === config[platform]!.accountId) ?? connected[0]
    : connected[0];

  switch (platform) {
    case "facebook": {
      if (!account) {
        return {
          status: "failed",
          error: "No connected Facebook Page (Settings → Accounts)",
        };
      }
      const { postId } = await facebookPostFeed({
        pageId: account.platformAccountId,
        accessToken: account.accessToken,
        message: post.content ?? "",
      });
      return { status: "published", externalId: postId, publishedAt: new Date().toISOString() };
    }

    case "instagram": {
      if (!account) {
        return { status: "failed", error: "No connected Instagram Business account" };
      }
      if (!post.mediaIds?.length) {
        return {
          status: "failed",
          error: "Instagram posts require media — attach an image or video in the composer",
        };
      }
      const assets = await db
        .select()
        .from(mediaAssets)
        .where(inArray(mediaAssets.id, post.mediaIds));
      if (assets.length === 0) {
        return { status: "failed", error: "Attached media was not found" };
      }
      // Public URLs go through the UUID-gated proxy (Blob is private, and IG's
      // servers need a fetchable URL). AUTH_URL points at a reachable deploy
      // sharing the same DB, so the asset resolves on any host.
      const origin = process.env.AUTH_URL ?? "https://symphonyapp.company";
      const video = assets.find((a) => a.mediaType === "video");
      const image = assets.find((a) => a.mediaType === "image");
      try {
        if (video) {
          const { mediaId } = await instagramPostReel({
            igUserId: account.platformAccountId,
            accessToken: account.accessToken,
            caption: post.content ?? "",
            videoUrl: `${origin}/api/media/${video.id}/public`,
          });
          return { status: "published", externalId: mediaId, publishedAt: new Date().toISOString() };
        }
        if (image) {
          const { mediaId } = await instagramPostImage({
            igUserId: account.platformAccountId,
            accessToken: account.accessToken,
            caption: post.content ?? "",
            imageUrl: `${origin}/api/media/${image.id}/public`,
          });
          return { status: "published", externalId: mediaId, publishedAt: new Date().toISOString() };
        }
        return { status: "failed", error: "No image or video in the attached media" };
      } catch (error) {
        return {
          status: "failed",
          error: error instanceof Error ? error.message : "Instagram publish failed",
        };
      }
    }

    case "tiktok": {
      // Scheduled/automatic TikTok publish: pull the post's video from the
      // media store and drive the same init → upload → status flow as the
      // TikTok page (verified live with SELF_ONLY on the approved app).
      const tiktokAccount = accounts.find(
        (a) => a.platform === "tiktok" && a.status === "connected"
      );
      if (!tiktokAccount) {
        return { status: "failed", error: "No connected TikTok account in this workspace" };
      }
      const mediaId = post.mediaIds?.[0];
      if (!mediaId) {
        return { status: "failed", error: "TikTok posts require a video — attach one in the composer" };
      }
      const [asset] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, mediaId))
        .limit(1);
      if (!asset || !asset.mimeType?.startsWith("video/")) {
        return { status: "failed", error: "TikTok posts require a video asset" };
      }

      // Fetch the video bytes server-side (same Blob auth as the public proxy).
      const token = blobToken();
      if (!token) return { status: "failed", error: "Blob token missing — media store not configured" };
      const upstream = await fetch(asset.url, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!upstream.ok) {
        return { status: "failed", error: `Could not read video from media store (HTTP ${upstream.status})` };
      }
      const bytes = new Uint8Array(await upstream.arrayBuffer());

      // Defaults for scheduled posts: private visibility (same verified flow
      // as the TikTok page), commenting enabled.
      const tiktokConfig = config.tiktok ?? {};
      const privacyLevel =
        (tiktokConfig as { privacyLevel?: string }).privacyLevel ?? "SELF_ONLY";
      const allowComment = (tiktokConfig as { allowComment?: boolean }).allowComment ?? true;
      const allowDuet = (tiktokConfig as { allowDuet?: boolean }).allowDuet ?? true;
      const allowStitch = (tiktokConfig as { allowStitch?: boolean }).allowStitch ?? true;

      const initialized = await initializeTikTokUpload({
        accessToken: tiktokAccount.accessToken,
        mode: "direct",
        fileSize: bytes.byteLength,
        caption: post.content ?? "",
        privacyLevel,
        allowComment,
        allowDuet,
        allowStitch,
      });
      await sendVideoToTikTok(initialized.upload_url, bytes, asset.mimeType);

      // Record the publish id immediately (status becomes final via the
      // TikTok status endpoint / posts page).
      return {
        status: "published",
        externalId: initialized.publish_id,
        publishedAt: new Date().toISOString(),
      };
    }

    case "youtube":
    case "x":
    case "linkedin":
      return { status: "skipped", error: "No adapter yet" };

    default:
      return { status: "skipped", error: "Unknown platform" };
  }
}
