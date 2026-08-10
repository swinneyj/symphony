/**
 * YouTube (Google OAuth + Data API v3) adapter.
 *
 * Reuses the app's Google OAuth client (same project as sign-in) with the
 * youtube.upload + youtube.readonly scopes. Connect flow mirrors the Meta
 * connect pattern: /api/auth/youtube/connect → consent → callback → token
 * exchange → channel fetch → social_accounts row.
 *
 * Posting: resumable upload via the Data API v3 (videos.insert with
 * uploadType=resumable), private visibility default so test posts never go
 * public. Comments ingestion (Data API v3 commentThreads.list) feeds the
 * unified inbox.
 */

const GOOGLE_OAUTH = "https://oauth2.googleapis.com";
const YT_UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
const YT_API = "https://www.googleapis.com/youtube/v3";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

export function getYouTubeCredentials() {
  const clientId = process.env.YOUTUBE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
  const clientSecret =
    process.env.YOUTUBE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("YouTube/Google OAuth credentials are not configured");
  }
  return { clientId, clientSecret };
}

export function getYouTubeRedirectUri() {
  return process.env.YOUTUBE_REDIRECT_URI ?? "https://www.symphonyapp.company/api/auth/youtube/callback";
}

export async function exchangeYouTubeCode(code: string) {
  const { clientId, clientSecret } = getYouTubeCredentials();
  const res = await fetch(`${GOOGLE_OAUTH}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getYouTubeRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

export async function fetchYouTubeChannel(accessToken: string) {
  const res = await fetch(
    `${YT_API}/channels?part=snippet,statistics&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`YouTube channel lookup failed (${res.status})`);
  const data = await res.json();
  const channel = data.items?.[0];
  if (!channel) throw new Error("No YouTube channel on this account");
  return {
    channelId: channel.id as string,
    title: channel.snippet?.title as string,
    avatarUrl: channel.snippet?.thumbnails?.default?.url as string | undefined,
    subscriberCount: channel.statistics?.subscriberCount as string | undefined,
  };
}

export type YouTubeUploadResult = { videoId: string; status: "published" };

/**
 * Resumable upload of a video (bytes passed in) to the channel.
 * privacyStatus defaults to "private" — flip via opts for public posts.
 */
export async function uploadYouTubeVideo(opts: {
  accessToken: string;
  videoBytes: Uint8Array;
  mimeType: string;
  title: string;
  description?: string;
  privacyStatus?: "private" | "public" | "unlisted";
}): Promise<YouTubeUploadResult> {
  const { accessToken, videoBytes, mimeType, title, description, privacyStatus = "private" } = opts;

  // 1. Initiate resumable session
  const init = await fetch(
    `${YT_UPLOAD}?uploadType=resumable&part=snippet,status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(videoBytes.byteLength),
      },
      body: JSON.stringify({
        snippet: { title, description: description ?? "" },
        status: { privacyStatus },
      }),
    }
  );
  if (!init.ok) throw new Error(`YouTube upload init failed (${init.status})`);
  const uploadUrl = init.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube upload session missing location header");

  // 2. PUT the bytes
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(videoBytes.byteLength),
    },
    body: Buffer.from(videoBytes),
  });
  if (!put.ok) throw new Error(`YouTube upload failed (${put.status})`);
  const result = (await put.json()) as { id?: string };
  if (!result.id) throw new Error("YouTube upload returned no video id");
  return { videoId: result.id, status: "published" };
}

export type YouTubeComment = {
  commentId: string;
  videoId: string;
  author: string;
  authorChannelId?: string;
  text: string;
  publishedAt: string;
  likeCount: number;
};

/** Pull recent comments across the channel's uploads (Data API v3, free quota). */
export async function fetchYouTubeComments(accessToken: string, maxResults = 25) {
  // Find recent uploads first
  const uploads = await fetch(
    `${YT_API}/playlistItems?part=contentDetails&playlistId=UU&maxResults=10&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  ).then((r) => r.json());
  const videoIds = (uploads.items ?? []).map(
    (i: { contentDetails?: { videoId?: string } }) => i.contentDetails?.videoId
  ).filter(Boolean) as string[];

  const comments: YouTubeComment[] = [];
  for (const videoId of videoIds.slice(0, 3)) {
    const res = await fetch(
      `${YT_API}/commentThreads?part=snippet&videoId=${videoId}&maxResults=${maxResults}&textFormat=plainText`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) continue; // comments may be disabled on a video — skip
    const data = await res.json();
    for (const item of data.items ?? []) {
      const s = item.snippet?.topLevelComment?.snippet;
      if (!s) continue;
      comments.push({
        commentId: item.id,
        videoId,
        author: s.authorDisplayName ?? "Unknown",
        authorChannelId: s.authorChannelId?.value,
        text: s.textDisplay ?? "",
        publishedAt: s.publishedAt ?? "",
        likeCount: s.likeCount ?? 0,
      });
    }
  }
  return comments;
}

/** Reply to a comment thread (free quota). */
export async function replyToYouTubeComment(opts: {
  accessToken: string;
  videoId: string;
  parentId: string;
  text: string;
}) {
  const res = await fetch(`${YT_API}/comments?part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      snippet: {
        videoId: opts.videoId,
        parentId: opts.parentId,
        textOriginal: opts.text,
      },
    }),
  });
  if (!res.ok) throw new Error(`YouTube comment reply failed (${res.status})`);
  return (await res.json()) as { id?: string };
}
