import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { socialAccounts, workspaceMembers } from "@/db/schema";

export const TIKTOK_SCOPES = [
  "user.info.basic",
  "video.upload",
  "video.publish",
] as const;

export const TIKTOK_OAUTH_COOKIE = "symphony_tiktok_oauth";

export type TikTokUser = {
  open_id: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
};

export type TikTokCreatorInfo = {
  creator_avatar_url?: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
};

type TikTokError = {
  code?: string;
  message?: string;
  log_id?: string;
};

type TikTokEnvelope<T> = {
  data?: T;
  error?: TikTokError;
};

type TikTokTokenResponse = {
  access_token?: string;
  expires_in?: number;
  open_id?: string;
  refresh_expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  log_id?: string;
};

export class TikTokApiError extends Error {
  constructor(
    message: string,
    readonly code = "tiktok_api_error",
    readonly logId?: string
  ) {
    super(message);
  }
}

export function getTikTokCredentials() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey || !clientSecret) {
    throw new TikTokApiError(
      "TikTok sandbox credentials are not configured.",
      "credentials_missing"
    );
  }

  return { clientKey, clientSecret };
}

export function getTikTokRedirectUri() {
  return (
    process.env.TIKTOK_REDIRECT_URI ||
    "https://www.symphonyapp.company/api/tiktok/callback"
  );
}

async function parseTikTokResponse<T>(response: Response, context: string) {
  const payload = (await response.json()) as TikTokEnvelope<T> & TikTokTokenResponse;
  const code = payload.error?.code ||
    (typeof payload.error === "string" ? payload.error : undefined);

  if (!response.ok || (code && code !== "ok")) {
    const message = payload.error?.message || payload.error_description || `${context} failed`;
    const logId = payload.error?.log_id || payload.log_id;
    throw new TikTokApiError(message, code || `http_${response.status}`, logId);
  }

  return payload;
}

export async function exchangeTikTokCode(code: string) {
  const { clientKey, clientSecret } = getTikTokCredentials();
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: getTikTokRedirectUri(),
  });

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const payload = await parseTikTokResponse<never>(response, "TikTok token exchange");

  if (!payload.access_token || !payload.refresh_token || !payload.open_id) {
    throw new TikTokApiError("TikTok did not return complete account credentials.");
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in || 86400,
    refreshExpiresIn: payload.refresh_expires_in,
    openId: payload.open_id,
    scope: payload.scope || TIKTOK_SCOPES.join(","),
    tokenType: payload.token_type || "Bearer",
  };
}

export async function fetchTikTokUser(accessToken: string) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );
  const payload = await parseTikTokResponse<{ user: TikTokUser }>(
    response,
    "TikTok user lookup"
  );

  if (!payload.data?.user?.open_id) {
    throw new TikTokApiError("TikTok did not return the connected user profile.");
  }

  return payload.data.user;
}

export async function getTikTokAccountForMember(workspaceId: string, userId: string) {
  const membership = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (membership.length === 0) return { authorized: false as const, account: null };

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.workspaceId, workspaceId),
        eq(socialAccounts.platform, "tiktok"),
        eq(socialAccounts.status, "connected")
      )
    )
    .limit(1);

  return { authorized: true as const, account: account || null };
}

export async function fetchTikTokCreatorInfo(accessToken: string) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      cache: "no-store",
    }
  );
  const payload = await parseTikTokResponse<TikTokCreatorInfo>(
    response,
    "TikTok creator lookup"
  );

  if (!payload.data?.creator_nickname) {
    throw new TikTokApiError("TikTok did not return creator posting settings.");
  }

  return payload.data;
}

export async function initializeTikTokUpload({
  accessToken,
  mode,
  fileSize,
  caption,
  privacyLevel,
  allowComment,
  allowDuet,
  allowStitch,
}: {
  accessToken: string;
  mode: "draft" | "direct";
  fileSize: number;
  caption: string;
  privacyLevel?: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
}) {
  const endpoint = mode === "draft"
    ? "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/"
    : "https://open.tiktokapis.com/v2/post/publish/video/init/";

  const sourceInfo = {
    source: "FILE_UPLOAD",
    video_size: fileSize,
    chunk_size: fileSize,
    total_chunk_count: 1,
  };
  const body = mode === "draft"
    ? { source_info: sourceInfo }
    : {
        post_info: {
          title: caption,
          privacy_level: privacyLevel,
          disable_comment: !allowComment,
          disable_duet: !allowDuet,
          disable_stitch: !allowStitch,
          video_cover_timestamp_ms: 1000,
          brand_content_toggle: false,
          brand_organic_toggle: false,
        },
        source_info: sourceInfo,
      };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await parseTikTokResponse<{ publish_id: string; upload_url: string }>(
    response,
    mode === "draft" ? "TikTok draft upload initialization" : "TikTok direct post initialization"
  );

  if (!payload.data?.publish_id || !payload.data.upload_url) {
    throw new TikTokApiError("TikTok did not return an upload URL.");
  }

  return payload.data;
}

export async function sendVideoToTikTok(
  uploadUrl: string,
  bytes: Uint8Array,
  mimeType: string
) {
  const body = Buffer.from(bytes);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new TikTokApiError(
      `TikTok media transfer failed (${response.status}).`,
      `upload_http_${response.status}`
    );
  }
}

export async function fetchTikTokPublishStatus(accessToken: string, publishId: string) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
      cache: "no-store",
    }
  );

  const payload = await parseTikTokResponse<{
    status: string;
    fail_reason?: string;
    uploaded_bytes?: number;
    publicaly_available_post_id?: string[];
  }>(response, "TikTok status lookup");

  return payload.data || { status: "UNKNOWN" };
}
