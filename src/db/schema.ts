import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  varchar,
  integer,
  boolean,
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
