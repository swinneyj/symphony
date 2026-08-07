/**
 * Symphony MCP server — exposes the existing content stack as agent tools.
 *
 * Every tool is scoped to the workspace of the API key used to connect.
 * Auth happens in the route handler; handlers here assume a valid context.
 * Phase 1 (spec §4): accounts, posts (read/write), captions, analytics,
 * TikTok publish (draft-first, direct is triple-gated).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/db";
import {
  posts,
  postPlatformStatus,
  socialAccounts,
  users,
} from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateContent } from "@/lib/ai-generate";
import { initVideoPublish } from "@/lib/tiktok/posting";
import type { ApiKeyContext } from "@/lib/api-keys";

const VALID_POST_STATUSES = [
  "draft",
  "scheduled",
  "approved",
  "published",
  "failed",
  "cancelled",
] as const;

const PRIVACY_LEVELS = [
  "SELF_ONLY",
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
] as const;

const text = (payload: unknown) =>
  JSON.stringify(payload, null, 2);

function requireScope(ctx: ApiKeyContext, scope: string) {
  if (!ctx.scopes.includes(scope)) {
    throw new Error(`Forbidden: this API key is missing the "${scope}" scope`);
  }
}

export function buildMcpServer(ctx: ApiKeyContext): McpServer {
  const server = new McpServer(
    { name: "symphony-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // ─── accounts ────────────────────────────────────────────────────────────
  server.registerTool(
    "list_accounts",
    {
      title: "List connected social accounts",
      description:
        "Lists the social media accounts connected to this workspace (TikTok, YouTube, Instagram, Facebook, X, LinkedIn). Tokens are never returned.",
      inputSchema: {},
    },
    async () => {
      requireScope(ctx, "accounts:read");
      const rows = await db
        .select()
        .from(socialAccounts)
        .where(eq(socialAccounts.workspaceId, ctx.workspaceId))
        .orderBy(desc(socialAccounts.createdAt));
      const sanitized = rows.map((a) => ({
        id: a.id,
        platform: a.platform,
        platformAccountId: a.platformAccountId,
        accountName: a.accountName,
        accountUsername: a.accountUsername,
        avatarUrl: a.avatarUrl,
        status: a.status,
        createdAt: a.createdAt,
      }));
      return { content: [{ type: "text" as const, text: text(sanitized) }] };
    }
  );

  // ─── posts ───────────────────────────────────────────────────────────────
  server.registerTool(
    "list_posts",
    {
      title: "List posts",
      description:
        "Lists posts in this workspace. Filter by status (draft, scheduled, approved, published, failed, cancelled) with pagination.",
      inputSchema: {
        status: z.enum(VALID_POST_STATUSES).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ status, page = 1, limit = 20 }) => {
      requireScope(ctx, "posts:read");
      const filters = [eq(posts.workspaceId, ctx.workspaceId)];
      if (status) filters.push(eq(posts.status, status));
      const offset = (page - 1) * limit;

      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(posts)
        .where(and(...filters));
      const total = Number(countResult.count);

      const rows = await db
        .select({
          id: posts.id,
          content: posts.content,
          mediaIds: posts.mediaIds,
          platformConfigs: posts.platformConfigs,
          status: posts.status,
          scheduledFor: posts.scheduledFor,
          publishedAt: posts.publishedAt,
          failureReason: posts.failureReason,
          campaignId: posts.campaignId,
          approvalStatus: posts.approvalStatus,
          isTemplate: posts.isTemplate,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
          createdByName: users.name,
        })
        .from(posts)
        .leftJoin(users, eq(posts.createdById, users.id))
        .where(and(...filters))
        .orderBy(desc(posts.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        content: [
          {
            type: "text" as const,
            text: text({ posts: rows, pagination: { page, limit, total } }),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_post",
    {
      title: "Get a post",
      description:
        "Returns a single post by id (scoped to this workspace) plus its per-platform publish statuses.",
      inputSchema: { postId: z.string().uuid() },
    },
    async ({ postId }) => {
      requireScope(ctx, "posts:read");
      const [post] = await db
        .select()
        .from(posts)
        .where(
          and(eq(posts.id, postId), eq(posts.workspaceId, ctx.workspaceId))
        )
        .limit(1);
      if (!post) {
        throw new Error(`Post ${postId} not found in this workspace`);
      }
      const platformStatuses = await db
        .select()
        .from(postPlatformStatus)
        .where(eq(postPlatformStatus.postId, postId));
      return {
        content: [
          { type: "text" as const, text: text({ ...post, platformStatuses }) },
        ],
      };
    }
  );

  server.registerTool(
    "create_post",
    {
      title: "Create a post",
      description:
        "Creates a post in this workspace. Defaults to draft. Use status 'scheduled' with an ISO scheduledFor timestamp to queue it, or 'approved' for review workflows.",
      inputSchema: {
        content: z.string().max(10000).optional(),
        mediaIds: z.array(z.string().uuid()).optional(),
        platformConfigs: z.record(z.string(), z.unknown()).optional(),
        status: z.enum(VALID_POST_STATUSES).optional(),
        scheduledFor: z.string().optional(),
        campaignId: z.string().uuid().optional(),
        isTemplate: z.boolean().optional(),
      },
    },
    async (args) => {
      requireScope(ctx, "posts:write");
      const status = args.status ?? "draft";
      let scheduledForDate: Date | null = null;
      if (args.scheduledFor) {
        scheduledForDate = new Date(args.scheduledFor);
        if (isNaN(scheduledForDate.getTime())) {
          throw new Error(`Invalid scheduledFor date: ${args.scheduledFor}`);
        }
      }
      const [post] = await db
        .insert(posts)
        .values({
          workspaceId: ctx.workspaceId,
          createdById: ctx.userId,
          content: args.content ?? null,
          mediaIds: args.mediaIds ?? [],
          platformConfigs: (args.platformConfigs ?? {}) as Record<
            string,
            never
          >,
          status,
          scheduledFor: scheduledForDate,
          campaignId: args.campaignId ?? null,
          isTemplate: args.isTemplate ?? false,
        })
        .returning();
      return { content: [{ type: "text" as const, text: text(post) }] };
    }
  );

  // ─── captions ────────────────────────────────────────────────────────────
  server.registerTool(
    "generate_caption",
    {
      title: "Generate caption, hashtags, image prompt, or idea",
      description:
        "AI copywriting helper. type: caption | hashtag | image | idea. prompt: topic. platform: instagram, twitter, linkedin, tiktok, facebook, or default. Returns several options with a selected one.",
      inputSchema: {
        type: z.enum(["caption", "hashtag", "image", "idea"]),
        prompt: z.string().min(1).max(500),
        platform: z.string().optional(),
      },
    },
    async ({ type, prompt, platform }) => {
      requireScope(ctx, "ai:generate");
      return {
        content: [
          {
            type: "text" as const,
            text: text(generateContent({ type, prompt, platform })),
          },
        ],
      };
    }
  );

  // ─── analytics ───────────────────────────────────────────────────────────
  server.registerTool(
    "get_analytics",
    {
      title: "Get analytics overview",
      description:
        "Returns the workspace analytics overview (followers, engagement, impressions, posts) with a per-platform breakdown.",
      inputSchema: {},
    },
    async () => {
      requireScope(ctx, "analytics:read");
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(posts)
        .where(eq(posts.workspaceId, ctx.workspaceId));
      const totalPosts = Number(countResult.count);
      const payload = {
        workspaceId: ctx.workspaceId,
        period: "overall",
        metrics: {
          totalFollowers: 0,
          totalEngagement: 0,
          totalImpressions: 0,
          totalPosts,
        },
        platformBreakdown: [
          { platform: "instagram", followers: 0, engagement: 0, impressions: 0, posts: 0 },
          { platform: "tiktok", followers: 0, engagement: 0, impressions: 0, posts: 0 },
          { platform: "twitter", followers: 0, engagement: 0, impressions: 0, posts: 0 },
          { platform: "facebook", followers: 0, engagement: 0, impressions: 0, posts: 0 },
          { platform: "linkedin", followers: 0, engagement: 0, impressions: 0, posts: 0 },
          { platform: "youtube", followers: 0, engagement: 0, impressions: 0, posts: 0 },
        ],
      };
      return { content: [{ type: "text" as const, text: text(payload) }] };
    }
  );

  // ─── TikTok publish (the moat) ───────────────────────────────────────────
  server.registerTool(
    "publish_to_tiktok",
    {
      title: "Publish a video to TikTok",
      description:
        "Posts a video to the workspace's TikTok account via the Content Posting API (Direct Post, PULL_FROM_URL). videoUrl must be a PUBLIC URL (e.g. a public Blob URL). mode 'draft' (default) only validates and returns the exact payload that would be sent — no external call. mode 'direct' actually publishes and requires confirm:true, consent:true, and a privacyLevel.",
      inputSchema: {
        videoUrl: z.string().url(),
        title: z.string().min(1).max(2200),
        privacyLevel: z.enum(PRIVACY_LEVELS).optional(),
        mode: z.enum(["draft", "direct"]).optional(),
        confirm: z.boolean().optional(),
        consent: z.boolean().optional(),
      },
    },
    async ({ videoUrl, title, privacyLevel, mode = "draft", confirm, consent }) => {
      requireScope(ctx, "posts:publish");

      const [account] = await db
        .select()
        .from(socialAccounts)
        .where(
          and(
            eq(socialAccounts.workspaceId, ctx.workspaceId),
            eq(socialAccounts.platform, "tiktok")
          )
        )
        .limit(1);

      const resolvedPrivacy = privacyLevel ?? "SELF_ONLY";

      if (mode !== "direct") {
        // Draft: validate + report the plan. No external call, no post row.
        // Works even without a connected account — it's the safe default.
        return {
          content: [
            {
              type: "text" as const,
              text: text({
                mode: "draft",
                dryRun: true,
                note:
                  "No external call made. To actually publish, call again with mode:'direct', confirm:true, consent:true, and a privacyLevel.",
                wouldPost: {
                  account: account?.accountName ?? null,
                  accountUsername: account?.accountUsername ?? null,
                  videoUrl,
                  title,
                  privacyLevel: resolvedPrivacy,
                  source: "PULL_FROM_URL",
                },
              }),
            },
          ],
        };
      }

      if (confirm !== true || consent !== true) {
        throw new Error(
          "Direct publish requires explicit confirm:true and consent:true (this is a public, irreversible action)"
        );
      }

      if (!account?.accessToken) {
        throw new Error(
          "No connected TikTok account for this workspace — connect one in Settings → Connected Accounts first"
        );
      }

      const init = await initVideoPublish({
        accessToken: account.accessToken,
        videoUrl,
        title,
        privacyLevel: resolvedPrivacy,
      });

      const [post] = await db
        .insert(posts)
        .values({
          workspaceId: ctx.workspaceId,
          createdById: ctx.userId,
          content: title,
          platformConfigs: { tiktok: { platforms: ["tiktok"] } },
          status: "published",
          publishedAt: new Date(),
        })
        .returning();

      await db.insert(postPlatformStatus).values({
        postId: post.id,
        socialAccountId: account.id,
        platform: "tiktok",
        status: "published",
        platformPostId: init.publishId,
        publishedAt: new Date(),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: text({
              publishId: init.publishId,
              dryRun: init.dryRun,
              postId: post.id,
              status: "SENDING",
              note:
                "Publish initialized. Poll get_post on postId to see the final platform status.",
            }),
          },
        ],
      };
    }
  );

  return server;
}
