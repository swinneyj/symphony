/**
 * Meta Graph API — analytics sync adapters.
 *
 * Fetches real platform-native metrics for connected Facebook pages and
 * Instagram business accounts, shaped for analytics_snapshots.
 *
 * Verified against live tokens (2026-08-10):
 *   ✅ FB page fields: fan_count, followers_count          (real)
 *   ✅ FB insights: page_follows, page_views_total          (real, may be empty)
 *   ✅ IG fields: followers_count, media_count, follows_count (real)
 *   ✅ IG media: like_count, comments_count (recent posts)   (real)
 *   ❌ IG insights (reach/impressions): needs instagram_business_manage_insights
 *      scope (app review) — metrics stay 0, honest.
 *   ❌ FB page_fans/page_impressions insights: restricted — page fields used instead.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (!res.ok || (body as { error?: unknown } | null)?.error) {
    const msg =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `HTTP ${res.status}`;
    throw new Error(`meta analytics ${path.split("?")[0]} failed: ${msg}`);
  }
  return body as T;
}

export type FacebookAnalytics = {
  followers: number;
  likes: number;
  pageViews: number;
};

export type InstagramAnalytics = {
  followers: number;
  following: number;
  mediaCount: number;
  recentLikes: number;
  recentComments: number;
  recentPosts: number;
};

/** FB page lifetime stats: fan_count + followers_count (page fields, always available). */
export async function fetchFacebookAnalytics(
  accessToken: string,
  pageId: string
): Promise<FacebookAnalytics> {
  const page = await graph<{
    fan_count?: number;
    followers_count?: number;
    id: string;
  }>(pageId, {
    fields: "fan_count,followers_count",
    access_token: accessToken,
  });

  let pageViews = 0;
  try {
    const views = await graph<{ data?: Array<{ values?: Array<{ value: number }> }> }>(
      `${pageId}/insights`,
      { metric: "page_views_total", period: "day", access_token: accessToken }
    );
    const last = views.data?.[0]?.values?.at(-1)?.value;
    if (typeof last === "number") pageViews = last;
  } catch {
    // page_views_total may be empty/restricted — non-fatal, keep 0
  }

  return {
    followers: page.followers_count ?? page.fan_count ?? 0,
    likes: page.fan_count ?? 0,
    pageViews,
  };
}

/** IG business lifetime stats + recent engagement (media endpoint, always available). */
export async function fetchInstagramAnalytics(
  accessToken: string,
  igUserId: string
): Promise<InstagramAnalytics> {
  const [profile, media] = await Promise.all([
    graph<{ followers_count?: number; follows_count?: number; media_count?: number; id: string }>(
      igUserId,
      { fields: "followers_count,follows_count,media_count", access_token: accessToken }
    ),
    graph<{ data?: Array<{ like_count?: number; comments_count?: number }> }>(
      `${igUserId}/media`,
      { fields: "like_count,comments_count", limit: "25", access_token: accessToken }
    ),
  ]);

  const posts = media.data ?? [];
  return {
    followers: profile.followers_count ?? 0,
    following: profile.follows_count ?? 0,
    mediaCount: profile.media_count ?? 0,
    recentLikes: posts.reduce((sum, m) => sum + (m.like_count ?? 0), 0),
    recentComments: posts.reduce((sum, m) => sum + (m.comments_count ?? 0), 0),
    recentPosts: posts.length,
  };
}
