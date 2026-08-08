import { createHmac, timingSafeEqual } from "crypto";

/**
 * Stateless password-reset tokens: HMAC-SHA256 signed payload with expiry.
 * No DB schema changes needed — the token itself carries userId + expiry.
 */

const RESET_TTL_SECONDS = 60 * 60; // 1 hour

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function secretKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return Buffer.from(secret);
}

export interface ResetTokenPayload {
  sub: string; // user id
  type: "password-reset";
  exp: number; // unix seconds
}

export function createResetToken(userId: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      type: "password-reset",
      exp: Math.floor(Date.now() / 1000) + RESET_TTL_SECONDS,
    } satisfies ResetTokenPayload)
  );
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", secretKey())
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

export function verifyResetToken(token: string): ResetTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const signingInput = `${header}.${payload}`;

    const expected = createHmac("sha256", secretKey())
      .update(signingInput)
      .digest("base64url");

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    // Header check
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString());
    if (parsedHeader.alg !== "HS256") return null;

    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    ) as ResetTokenPayload;

    if (parsed.type !== "password-reset") return null;
    if (typeof parsed.sub !== "string" || !parsed.sub) return null;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 < Date.now()) {
      return null; // expired
    }

    return parsed;
  } catch {
    return null;
  }
}

/** Is this a demo account with no real mailbox? (reset link returned in API response) */
export function isDemoAccount(email: string): boolean {
  return email.toLowerCase().endsWith("@symphony.app");
}
