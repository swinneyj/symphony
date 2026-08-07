/**
 * Workspace-scoped API keys for the Symphony MCP server / agent access.
 *
 * Keys are issued as `sym_live_<base64url>` and stored ONLY as bcrypt hashes
 * (same lib as user passwords). The raw secret is shown once at creation.
 * A `key_prefix` column (first 16 chars) is used for indexed lookup so we
 * never scan all hashes; bcrypt.compare then confirms the exact key.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

export const API_KEY_PREFIX = "sym_live_";
export const API_KEY_SCOPES = [
  "accounts:read",
  "posts:read",
  "posts:write",
  "posts:publish",
  "analytics:read",
  "ai:generate",
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export type ApiKeyContext = {
  keyId: string;
  workspaceId: string;
  userId: string;
  scopes: string[];
};

export type ApiKeyRow = typeof apiKeys.$inferSelect;

const BCRYPT_ROUNDS = 10;

function generateSecret(): string {
  return API_KEY_PREFIX + randomBytes(24).toString("base64url");
}

export async function createApiKey(opts: {
  workspaceId: string;
  createdById: string;
  name: string;
  scopes: string[];
}): Promise<{ secret: string; row: ApiKeyRow }> {
  const secret = generateSecret();
  const keyHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
  const [row] = await db
    .insert(apiKeys)
    .values({
      workspaceId: opts.workspaceId,
      createdById: opts.createdById,
      name: opts.name,
      keyHash,
      keyPrefix: secret.slice(0, 16),
      scopes: opts.scopes,
    })
    .returning();
  return { secret, row };
}

/**
 * Resolve a raw `sym_live_...` secret to its workspace context, or null when
 * the key is unknown, revoked, or the secret doesn't match the hash.
 */
export async function verifyApiKey(secret: string): Promise<ApiKeyContext | null> {
  if (!secret.startsWith(API_KEY_PREFIX)) return null;
  const prefix = secret.slice(0, 16);
  const candidates = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, prefix))
    .limit(5);

  for (const row of candidates) {
    if (row.revokedAt) continue;
    const valid = await bcrypt.compare(secret, row.keyHash);
    if (valid) {
      // Touch last_used_at (best-effort; never fails a request).
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, row.id))
        .catch(() => {});
      return {
        keyId: row.id,
        workspaceId: row.workspaceId,
        userId: row.createdById,
        scopes: row.scopes,
      };
    }
  }
  return null;
}

export async function listApiKeys(workspaceId: string): Promise<ApiKeyRow[]> {
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(id: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, workspaceId)))
    .returning({ id: apiKeys.id });
  return Boolean(row);
}

/** Sanitize a row for client display (never leak the hash). */
export function sanitizeApiKey(row: ApiKeyRow) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: `${row.keyPrefix}…`,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}
