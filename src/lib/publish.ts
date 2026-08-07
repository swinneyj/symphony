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
 *  - Instagram/TikTok: require media; blocked until composer media upload +
 *    public-Blob store land (IG needs PUBLIC media URLs; TikTok is draft-first).
 *  - youtube / x / linkedin: no adapter yet → skipped.
 */

import { db } from "@/db";
import { posts, socialAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PlatformPublishState, PlatformPostConfig } from "@/db/schema";
import { facebookPostFeed } from "@/lib/meta/facebook";

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
          error: "Instagram posts require media — composer media upload lands with the public-Blob store",
        };
      }
      // TODO(P3+): resolve media → public URL → instagramPostImage/Reel.
      return { status: "failed", error: "Instagram media path pending public-Blob store" };
    }

    case "tiktok": {
      if (!post.mediaIds?.length) {
        return {
          status: "failed",
          error: "TikTok posts require a video — composer media upload lands with the public-Blob store",
        };
      }
      // TODO(P3+): initVideoPublish (draft mode) once media wiring lands.
      return { status: "failed", error: "TikTok media path pending composer media upload" };
    }

    case "youtube":
    case "x":
    case "linkedin":
      return { status: "skipped", error: "No adapter yet" };

    default:
      return { status: "skipped", error: "Unknown platform" };
  }
}
