/**
 * TikTok OAuth (Login Kit + Content Posting API) helpers.
 *
 * Flow: /api/auth/tiktok/connect → authorize URL → callback exchanges the
 * code for an access token (24h) + rotating refresh token (365d), fetches the
 * user profile, and stores one `social_accounts` row per TikTok identity —
 * the DB has no unique constraint on (workspace, platform), so N TikTok
 * accounts can coexist (each connect adds another).
 */

const AUTHORIZE_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const API_BASE = "https://open.tiktokapis.com/v2";

export const TIKTOK_SCOPES = "user.info.basic,video.publish,video.upload";

export function tiktokClientKey(): string {
  return process.env.AUTH_TIKTOK_CLIENT_KEY ?? process.env.TIKTOK_CLIENT_KEY ?? "";
}

export function tiktokClientSecret(): string {
  return process.env.AUTH_TIKTOK_CLIENT_SECRET ?? process.env.TIKTOK_CLIENT_SECRET ?? "";
}

export function tiktokAuthorizeUrl(opts: {
  clientKey: string;
  redirectUri: string;
  state: string;
  scopes?: string;
}): string {
  const params = new URLSearchParams({
    client_key: opts.clientKey,
    response_type: "code",
    scope: opts.scopes ?? TIKTOK_SCOPES,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `${AUTHORIZE_BASE}?${params.toString()}`;
}

export type TikTokTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null; // seconds
  openId: string;
  scope: string;
};

/** Exchange the authorization code for an access token (+ rotating refresh). */
export async function exchangeCodeForToken(opts: {
  clientKey: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<TikTokTokenResult> {
  const body = new URLSearchParams({
    client_key: opts.clientKey,
    client_secret: opts.clientSecret,
    code: opts.code,
    grant_type: "authorization_code",
    redirect_uri: opts.redirectUri,
  });

  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => null)) as {
    data?: { access_token?: string; refresh_token?: string; expires_in?: number; open_id?: string; scope?: string };
    error?: { message?: string };
  } | null;

  if (!res.ok || !data?.data?.access_token) {
    throw new Error(data?.error?.message ?? `TikTok token exchange failed (${res.status})`);
  }

  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token ?? null,
    expiresIn: data.data.expires_in ?? null,
    openId: data.data.open_id ?? "",
    scope: data.data.scope ?? "",
  };
}

export type TikTokUser = {
  openId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

/** Fetch the connected TikTok user's profile (display name, @username, avatar). */
export async function fetchTikTokUser(accessToken: string): Promise<TikTokUser> {
  const fields = "open_id,union_id,avatar_url,display_name,username";
  const res = await fetch(`${API_BASE}/user/info/?fields=${encodeURIComponent(fields)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json().catch(() => null)) as {
    data?: { user?: { open_id?: string; display_name?: string; username?: string; avatar_url?: string } };
    error?: { message?: string };
  } | null;

  const user = data?.data?.user;
  if (!res.ok || !user?.open_id) {
    throw new Error(data?.error?.message ?? `TikTok user info failed (${res.status})`);
  }

  return {
    openId: user.open_id,
    displayName: user.display_name || user.username || "TikTok account",
    username: user.username ?? "",
    avatarUrl: user.avatar_url ?? null,
  };
}

/**
 * Refresh a TikTok access token (tokens last 24h; refresh tokens rotate).
 * Returns the new access token, or null when there's nothing to refresh.
 */
export async function refreshTikTokToken(opts: {
  clientKey: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number | null } | null> {
  const body = new URLSearchParams({
    client_key: opts.clientKey,
    client_secret: opts.clientSecret,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
  });

  const res = await fetch(`${API_BASE}/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => null)) as {
    data?: { access_token?: string; refresh_token?: string; expires_in?: number };
    error?: { message?: string };
  } | null;

  if (!res.ok || !data?.data?.access_token) {
    return null;
  }

  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token ?? null,
    expiresIn: data.data.expires_in ?? null,
  };
}
