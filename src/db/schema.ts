import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  varchar,
  integer,
  boolean,
  numeric,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── ENUMS ───────────────────────────────────────────────────────────────────

export const workspaceRoleEnum = pgEnum("workspace_role", ["owner", "admin", "member", "viewer"]);
export const postStatusEnum = pgEnum("post_status", ["draft", "scheduled", "approved", "published", "failed", "cancelled"]);
export const platformEnum = pgEnum("platform", ["tiktok", "youtube", "instagram", "facebook", "twitter", "linkedin"]);
export const accountStatusEnum = pgEnum("account_status", ["connected", "expired", "disconnected"]);
export const inboxMessageTypeEnum = pgEnum("inbox_message_type", ["comment", "direct_message", "mention", "reply"]);
export const inboxMessageStatusEnum = pgEnum("inbox_message_status", ["unread", "read", "replied", "archived", "spam"]);
export const mediaTypeEnum = pgEnum("media_type", ["image", "video", "audio", "document"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "changes_requested", "rejected"]);
// Video Studio (AI product content)
export const productSourceEnum = pgEnum("product_source", ["manual", "link", "tiktok_showcase"]);
export const productStatusEnum = pgEnum("product_status", ["raw", "processing", "ready", "failed"]);
export const videoProviderEnum = pgEnum("video_provider", ["sora", "seedance", "kling", "openai_tts", "elevenlabs", "kokoro"]);
export const videoJobTypeEnum = pgEnum("video_job_type", ["product_process", "footage", "overlay", "slideshow", "batch_video", "scene_render"]);
export const videoJobStatusEnum = pgEnum("video_job_status", ["queued", "running", "done", "failed", "cancelled"]);
export const videoBatchStatusEnum = pgEnum("video_batch_status", ["queued", "running", "done", "partial", "failed"]);

// ─── USERS & AUTH ────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  sessionToken: text("session_token").unique().notNull(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// ─── WORKSPACES ──────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  logo: text("logo"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: workspaceRoleEnum("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── SOCIAL ACCOUNTS ─────────────────────────────────────────────────────────

export const socialAccounts = pgTable("social_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  platformAccountId: text("platform_account_id").notNull(),
  accountName: text("account_name").notNull(),
  accountUsername: text("account_username"),
  avatarUrl: text("avatar_url"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { mode: "date" }),
  status: accountStatusEnum("status").notNull().default("connected"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── POSTS / SCHEDULING ──────────────────────────────────────────────────────

export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  content: text("content"),
  mediaIds: uuid("media_ids").array().default([]),
  platformConfigs: jsonb("platform_configs")
    .$type<Record<string, PlatformPostConfig>>()
    .notNull()
    .default({}),
  status: postStatusEnum("status").notNull().default("draft"),
  scheduledFor: timestamp("scheduled_for", { mode: "date" }),
  publishedAt: timestamp("published_at", { mode: "date" }),
  failureReason: text("failure_reason"),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  approvalStatus: approvalStatusEnum("approval_status"),
  isTemplate: boolean("is_template").default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const postPlatformStatus = pgTable("post_platform_status", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  socialAccountId: uuid("social_account_id")
    .notNull()
    .references(() => socialAccounts.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  status: postStatusEnum("status").notNull().default("draft"),
  platformPostId: text("platform_post_id"),
  platformPostUrl: text("platform_post_url"),
  publishedAt: timestamp("published_at", { mode: "date" }),
  failureReason: text("failure_reason"),
});

// ─── CAMPAIGNS ───────────────────────────────────────────────────────────────

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  startDate: timestamp("start_date", { mode: "date" }),
  endDate: timestamp("end_date", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── MEDIA ASSETS ────────────────────────────────────────────────────────────

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  uploadedById: text("uploaded_by_id")
    .notNull()
    .references(() => users.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  mediaType: mediaTypeEnum("media_type").notNull(),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  width: integer("width"),
  height: integer("height"),
  duration: integer("duration"),
  alt: text("alt"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── INBOX ───────────────────────────────────────────────────────────────────

export const inboxMessages = pgTable("inbox_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  socialAccountId: uuid("social_account_id")
    .notNull()
    .references(() => socialAccounts.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  platformMessageId: text("platform_message_id").notNull(),
  messageType: inboxMessageTypeEnum("message_type").notNull(),
  status: inboxMessageStatusEnum("status").notNull().default("unread"),
  senderId: text("sender_id"),
  senderName: text("sender_name"),
  senderAvatar: text("sender_avatar"),
  senderUsername: text("sender_username"),
  content: text("content").notNull(),
  mediaUrls: text("media_urls").array().default([]),
  parentId: uuid("parent_id"),
  assignedToId: text("assigned_to_id").references(() => users.id),
  tags: text("tags").array().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  receivedAt: timestamp("received_at", { mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const inboxReplies = pgTable("inbox_replies", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => inboxMessages.id, { onDelete: "cascade" }),
  repliedById: text("replied_by_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  platformPostId: text("platform_post_id"),
  sentAt: timestamp("sent_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── APPROVALS ───────────────────────────────────────────────────────────────

export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  requestedById: text("requested_by_id")
    .notNull()
    .references(() => users.id),
  reviewedById: text("reviewed_by_id").references(() => users.id),
  status: approvalStatusEnum("status").notNull().default("pending"),
  comment: text("comment"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
});

// ─── SCHEDULES ───────────────────────────────────────────────────────────────

export const schedules = pgTable("schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  platformConfigs: jsonb("platform_configs")
    .$type<Record<string, { days: number[]; times: string[] }>>()
    .notNull()
    .default({}),
  timezone: text("timezone").notNull().default("UTC"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  socialAccountId: uuid("social_account_id")
    .notNull()
    .references(() => socialAccounts.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  period: text("period").notNull(), // "daily" | "weekly" | "monthly"
  snapshotDate: timestamp("snapshot_date", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── SAVED REPLIES ───────────────────────────────────────────────────────────

export const savedReplies = pgTable("saved_replies", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── AI GENERATION HISTORY ───────────────────────────────────────────────────

export const aiGenerations = pgTable("ai_generations", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(), // "caption", "image", "video", "hashtag", "idea"
  prompt: text("prompt").notNull(),
  result: jsonb("result").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── VIDEO STUDIO: PRODUCTS & AI CONTENT PIPELINE ─────────────────────────────

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  // Keep price as text so "49.99" and "$49.99" both survive a link import.
  price: text("price"),
  currency: text("currency").default("USD"),
  originalImageUrl: text("original_image_url"),
  processedImageUrl: text("processed_image_url"),
  sceneImageUrl: text("scene_image_url"),
  sourceType: productSourceEnum("source_type").notNull().default("manual"),
  sourceUrl: text("source_url"),
  tiktokProductId: text("tiktok_product_id"),
  status: productStatusEnum("status").notNull().default("raw"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const voices = pgTable("voices", {
  id: uuid("id").defaultRandom().primaryKey(),
  // null = system voice available to every workspace
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  provider: videoProviderEnum("provider").notNull().default("openai_tts"),
  providerVoiceId: text("provider_voice_id"),
  isCloned: boolean("is_cloned").default(false),
  sampleUrl: text("sample_url"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const videoFormulas = pgTable("video_formulas", {
  id: uuid("id").defaultRandom().primaryKey(),
  // null = system formula available to every workspace
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  scriptTemplate: text("script_template").notNull(),
  scenePromptTemplate: text("scene_prompt_template"),
  // 'render' (default): AI re-renders the product into a custom scene before
  // image-to-video (compliance: brand-owned listing photos must not be copied).
  // 'original': use the user's own photography as the first frame.
  sourceFrame: text("source_frame").notNull().default("render"),
  motionPreset: text("motion_preset").default("none"),
  voiceId: uuid("voice_id").references(() => voices.id, { onDelete: "set null" }),
  durationSec: integer("duration_sec").default(6),
  quality: text("quality").default("standard"),
  isSystem: boolean("is_system").default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const videoBatches = pgTable("video_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  formulaId: uuid("formula_id").references(() => videoFormulas.id, { onDelete: "set null" }),
  voiceId: uuid("voice_id").references(() => voices.id, { onDelete: "set null" }),
  quality: text("quality").notNull().default("standard"),
  provider: videoProviderEnum("provider").default("sora"),
  status: videoBatchStatusEnum("status").notNull().default("queued"),
  totalCount: integer("total_count").default(0),
  completedCount: integer("completed_count").default(0),
  failedCount: integer("failed_count").default(0),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const videoBatchJobs = pgTable("video_batch_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").references(() => videoBatches.id, { onDelete: "set null" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  formulaId: uuid("formula_id").references(() => videoFormulas.id, { onDelete: "set null" }),
  jobType: videoJobTypeEnum("job_type").notNull().default("batch_video"),
  status: videoJobStatusEnum("status").notNull().default("queued"),
  script: text("script"),
  sceneImageUrl: text("scene_image_url"),
  footageUrl: text("footage_url"),
  voiceoverUrl: text("voiceover_url"),
  finalUrl: text("final_url"),
  thumbnailUrl: text("thumbnail_url"),
  error: text("error"),
  retries: integer("retries").default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const marketProducts = pgTable("market_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceProductId: text("source_product_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  priceMin: numeric("price_min", { precision: 12, scale: 2 }),
  priceMax: numeric("price_max", { precision: 12, scale: 2 }),
  currency: text("currency").default("USD"),
  categoryL1: text("category_l1"),
  categoryL2: text("category_l2"),
  categoryL3: text("category_l3"),
  region: text("region"),
  rank: integer("rank"),
  rankPeriod: text("rank_period"),
  sales7d: integer("sales_7d"),
  sales30d: integer("sales_30d"),
  gmv30d: numeric("gmv_30d", { precision: 14, scale: 2 }),
  growthRate: numeric("growth_rate", { precision: 8, scale: 3 }),
  commissionRate: numeric("commission_rate", { precision: 6, scale: 3 }),
  videoCount: integer("video_count"),
  creatorCount: integer("creator_count"),
  isHot: boolean("is_hot").default(false),
  momentumScore: numeric("momentum_score", { precision: 8, scale: 2 }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  snapshotDate: timestamp("snapshot_date", { mode: "date" }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const marketCreators = pgTable("market_creators", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceCreatorId: text("source_creator_id").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  followers: integer("followers"),
  engagementRate: numeric("engagement_rate", { precision: 6, scale: 3 }),
  region: text("region"),
  rating: numeric("rating", { precision: 4, scale: 2 }),
  snapshotDate: timestamp("snapshot_date", { mode: "date" }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const marketProductCreators = pgTable("market_product_creators", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => marketCreators.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => marketProducts.id, { onDelete: "cascade" }),
  videoCount: integer("video_count"),
  salesForProduct: integer("sales_for_product"),
  snapshotDate: timestamp("snapshot_date", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const productWatchlist = pgTable("product_watchlist", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceProductId: text("source_product_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  alertRankDrop: integer("alert_rank_drop").default(10),
  lastAlertedAt: timestamp("last_alerted_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── API KEYS (MCP / agent access) ───────────────────────────────────────────

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  createdById: text("created_by_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
});

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type PlatformPostConfig = {
  platforms: string[];
  mediaOrder?: string[];
  firstComment?: string;
  location?: string;
  tags?: string[];
  altText?: string;
};

// ─── RELATIONS ───────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  workspaceMembers: many(workspaceMembers),
  posts: many(posts),
  inboxReplies: many(inboxReplies),
  products: many(products),
  videoBatches: many(videoBatches),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  socialAccounts: many(socialAccounts),
  posts: many(posts),
  mediaAssets: many(mediaAssets),
  inboxMessages: many(inboxMessages),
  campaigns: many(campaigns),
  schedules: many(schedules),
  analyticsSnapshots: many(analyticsSnapshots),
  products: many(products),
  voices: many(voices),
  videoFormulas: many(videoFormulas),
  videoBatches: many(videoBatches),
  videoBatchJobs: many(videoBatchJobs),
}));

export const socialAccountsRelations = relations(socialAccounts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [socialAccounts.workspaceId],
    references: [workspaces.id],
  }),
  posts: many(posts),
  inboxMessages: many(inboxMessages),
  analyticsSnapshots: many(analyticsSnapshots),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [posts.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [posts.createdById],
    references: [users.id],
  }),
  campaign: one(campaigns, {
    fields: [posts.campaignId],
    references: [campaigns.id],
  }),
  platformStatuses: many(postPlatformStatus),
  approvals: many(approvals),
}));

export const inboxMessagesRelations = relations(inboxMessages, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [inboxMessages.workspaceId],
    references: [workspaces.id],
  }),
  socialAccount: one(socialAccounts, {
    fields: [inboxMessages.socialAccountId],
    references: [socialAccounts.id],
  }),
  replies: many(inboxReplies),
}));

export const inboxRepliesRelations = relations(inboxReplies, ({ one }) => ({
  message: one(inboxMessages, {
    fields: [inboxReplies.messageId],
    references: [inboxMessages.id],
  }),
  repliedBy: one(users, {
    fields: [inboxReplies.repliedById],
    references: [users.id],
  }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [mediaAssets.workspaceId],
    references: [workspaces.id],
  }),
  uploadedBy: one(users, {
    fields: [mediaAssets.uploadedById],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [products.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [products.createdById],
    references: [users.id],
  }),
  jobs: many(videoBatchJobs),
}));

export const voicesRelations = relations(voices, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [voices.workspaceId],
    references: [workspaces.id],
  }),
}));

export const videoFormulasRelations = relations(videoFormulas, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [videoFormulas.workspaceId],
    references: [workspaces.id],
  }),
  voice: one(voices, {
    fields: [videoFormulas.voiceId],
    references: [voices.id],
  }),
  batches: many(videoBatches),
}));

export const videoBatchesRelations = relations(videoBatches, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [videoBatches.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [videoBatches.createdById],
    references: [users.id],
  }),
  formula: one(videoFormulas, {
    fields: [videoBatches.formulaId],
    references: [videoFormulas.id],
  }),
  voice: one(voices, {
    fields: [videoBatches.voiceId],
    references: [voices.id],
  }),
  jobs: many(videoBatchJobs),
}));

export const videoBatchJobsRelations = relations(videoBatchJobs, ({ one }) => ({
  batch: one(videoBatches, {
    fields: [videoBatchJobs.batchId],
    references: [videoBatches.id],
  }),
  workspace: one(workspaces, {
    fields: [videoBatchJobs.workspaceId],
    references: [workspaces.id],
  }),
  product: one(products, {
    fields: [videoBatchJobs.productId],
    references: [products.id],
  }),
  formula: one(videoFormulas, {
    fields: [videoBatchJobs.formulaId],
    references: [videoFormulas.id],
  }),
}));
