/**
 * Meta Graph API — Instagram Business posting adapters (spec docs/IG-FB-PUBLISHING-SPEC.md).
 *
 * Mirrors the nokturnal-lifestyle flow (scripts/publish-scheduled-blogs.js):
 * POST /{ig-user-id}/media (container) → poll status_code → POST /{ig-user-id}/media_publish.
 * Graph API v21.0 on graph.facebook.com.
 *
 * Image posts accept a PUBLIC image_url (IG requirement — same PULL_FROM_URL
 * constraint as TikTok; pending public-Blob store unblocks this).
 * Reels: media_type=REELS + public video_url (not in the nokturnal script — new).
 */

const GRAPH = "https://graph.facebook.com/v21.0";

type ContainerState = { id: string; status_code?: string; status?: string };

async function graph<T>(path: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`, init);
  const body = (await res.json().catch(() => null)) as T & { error?: { message?: string } } | null;
  if (!res.ok || (body as { error?: unknown } | null)?.error) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`meta instagram ${path.split("?")[0]} failed: ${msg}`);
  }
  return body as T;
}

export type InstagramPostOptions = {
  igUserId: string;
  accessToken: string;
  caption: string;
  /** Public image URL (image posts). */
  imageUrl?: string;
  /** Public video URL (Reels). */
  videoUrl?: string;
};

/** Creates a media container; returns its id (unpublished — harmless if abandoned). */
export async function instagramCreateContainer(opts: InstagramPostOptions): Promise<{ id: string }> {
  const { igUserId, accessToken, caption, imageUrl, videoUrl } = opts;
  if (!imageUrl && !videoUrl) throw new Error("instagramCreateContainer: imageUrl or videoUrl required");
  const params: Record<string, string> = {
    caption,
    access_token: accessToken,
  };
  if (videoUrl) {
    params.media_type = "REELS";
    params.video_url = videoUrl;
  } else {
    params.media_type = "IMAGE";
    params.image_url = imageUrl!;
  }
  return graph<{ id: string }>(`${igUserId}/media`, params, { method: "POST" });
}

/** Polls a container until FINISHED (or ERROR / timeout). Mirrors waitForInstagramContainer. */
export async function waitForInstagramContainer(opts: {
  containerId: string;
  accessToken: string;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<void> {
  const { containerId, accessToken, timeoutMs = 120_000, pollMs = 5_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await graph<ContainerState>(
      `${containerId}`,
      { fields: "status_code,status", access_token: accessToken }
    );
    if (state.status_code === "FINISHED") return;
    if (state.status_code === "ERROR") throw new Error(`instagram container failed: ${state.status ?? "unknown"}`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`instagram container ${containerId} timed out after ${timeoutMs}ms`);
}

/** Publishes a finished container — IRREVERSIBLE (no IG delete API). */
export async function instagramPublish(opts: {
  igUserId: string;
  accessToken: string;
  containerId: string;
}): Promise<{ id: string }> {
  return graph<{ id: string }>(
    `${opts.igUserId}/media_publish`,
    { creation_id: opts.containerId, access_token: opts.accessToken },
    { method: "POST" }
  );
}

/** Full image post: container → wait → publish. */
export async function instagramPostImage(opts: InstagramPostOptions): Promise<{ mediaId: string }> {
  const { id } = await instagramCreateContainer(opts);
  await waitForInstagramContainer({ containerId: id, accessToken: opts.accessToken });
  const { id: mediaId } = await instagramPublish({
    igUserId: opts.igUserId,
    accessToken: opts.accessToken,
    containerId: id,
  });
  return { mediaId };
}

/** Full Reel post: container → wait → publish. */
export async function instagramPostReel(opts: InstagramPostOptions): Promise<{ mediaId: string }> {
  const { id } = await instagramCreateContainer({ ...opts, videoUrl: opts.videoUrl });
  await waitForInstagramContainer({ containerId: id, accessToken: opts.accessToken });
  const { id: mediaId } = await instagramPublish({
    igUserId: opts.igUserId,
    accessToken: opts.accessToken,
    containerId: id,
  });
  return { mediaId };
}
