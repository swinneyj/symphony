/**
 * Meta Graph API — Facebook Page posting adapters (spec docs/IG-FB-PUBLISHING-SPEC.md).
 *
 * Mirrors the nokturnal-lifestyle pattern (scripts/post-to-facebook.js):
 * Page access token + `pages_read_engagement` + `pages_manage_posts` scopes.
 * Graph API v21.0 (same as the WhatsApp integration).
 *
 * Video posting accepts BOTH:
 *  - public `videoUrl` (form field `video_url`) — TikTok/IG-style PULL_FROM_URL
 *  - private Blob URLs (fetched server-side with the Blob token, re-uploaded
 *    as multipart) — FB's endpoint accepts direct upload, so the pending
 *    public-Blob store is NOT required for Facebook (only for TikTok/IG).
 */

const GRAPH = "https://graph.facebook.com/v21.0";

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, init);
  const body = (await res.json().catch(() => null)) as T & { error?: { message?: string; code?: number } } | null;
  if (!res.ok || (body as { error?: unknown } | null)?.error) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`meta graph ${path.split("?")[0]} failed: ${msg}`);
  }
  return body as T;
}

export type FacebookPageSummary = {
  id: string;
  name: string;
  accessToken?: string;
};

/** Lists Pages a token can manage — the account-connect flow. GET /me/accounts */
export async function fetchFacebookPages(accessToken: string): Promise<FacebookPageSummary[]> {
  const data = await graph<{ data?: FacebookPageSummary[] }>(
    `/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}`
  );
  return data.data ?? [];
}

/**
 * Posts a video to the Page. `videoUrl` may be public or a private Blob URL —
 * private URLs are downloaded with the Blob token and uploaded as multipart.
 * Returns the FB post id (verifiable / deletable).
 */
export async function facebookPostVideo(opts: {
  pageId: string;
  accessToken: string;
  videoUrl: string;
  title?: string;
  description?: string;
}): Promise<{ postId: string }> {
  const { pageId, accessToken, videoUrl, title, description } = opts;
  const isPrivateBlob = videoUrl.includes(".private.blob.vercel-storage.com");
  const form = new FormData();
  if (isPrivateBlob) {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    const dl = await fetch(videoUrl, {
      headers: blobToken ? { Authorization: `Bearer ${blobToken}` } : undefined,
    });
    if (!dl.ok) throw new Error(`failed to fetch private blob video: ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    form.append("file", new Blob([buf], { type: "video/mp4" }), "video.mp4");
  } else {
    form.append("video_url", videoUrl);
  }
  if (title) form.append("title", title);
  if (description) form.append("description", description);
  form.append("access_token", accessToken);

  const data = await graph<{ id: string }>(`/${pageId}/videos`, {
    method: "POST",
    body: form, // boundary set by FormData; no content-type header
  });
  return { postId: data.id };
}

/** Plain feed post (message + optional link + picture) — mirrors post-to-facebook.js. */
export async function facebookPostFeed(opts: {
  pageId: string;
  accessToken: string;
  message: string;
  link?: string;
  picture?: string;
}): Promise<{ postId: string }> {
  const { pageId, accessToken, message, link, picture } = opts;
  const form = new FormData();
  form.append("message", message);
  if (link) form.append("link", link);
  if (picture) form.append("picture", picture);
  form.append("access_token", accessToken);
  const data = await graph<{ id: string }>(`/${pageId}/feed`, {
    method: "POST",
    body: form,
  });
  return { postId: data.id };
}

/** Deletes a post (test cleanup + the sale-ended takedown flow). */
export async function deleteFacebookPost(opts: {
  postId: string;
  accessToken: string;
}): Promise<void> {
  await graph<{ success: boolean }>(`/${opts.postId}?access_token=${encodeURIComponent(opts.accessToken)}`, {
    method: "DELETE",
  });
}
