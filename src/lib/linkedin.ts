/**
 * LinkedIn (OAuth 2.0 + Share API v2) adapter.
 *
 * Connect flow mirrors Meta: /api/auth/linkedin/connect → consent →
 * callback → token exchange → profile fetch → social_accounts row.
 * Posting uses the Posts API v2 (POST /rest/posts) with w_member_social
 * scope — text posts supported; image/video requires the media upload
 * flow (registerUpload → upload → finalize) which is a follow-up.
 */

const LINKEDIN_OAUTH = "https://www.linkedin.com/oauth/v2";
const LINKEDIN_API = "https://api.linkedin.com";

export const LINKEDIN_SCOPES = ["w_member_social", "r_liteprofile", "r_emailaddress"].join(" ");

export function getLinkedInCredentials() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("LinkedIn credentials are not configured");
  }
  return { clientId, clientSecret };
}

export function getLinkedInRedirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI ?? "https://www.symphonyapp.company/api/auth/linkedin/callback";
}

export async function exchangeLinkedInCode(code: string) {
  const { clientId, clientSecret } = getLinkedInCredentials();
  const res = await fetch(`${LINKEDIN_OAUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getLinkedInRedirectUri(),
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn token exchange failed (${res.status})`);
  return (await res.json()) as { access_token: string; expires_in?: number };
}

export async function fetchLinkedInProfile(accessToken: string) {
  // r_liteprofile gives basic profile identity (urn:li:person:...)
  const res = await fetch(
    `${LINKEDIN_API}/v2/userinfo`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`LinkedIn profile lookup failed (${res.status})`);
  const data = (await res.json()) as {
    sub?: string;
    name?: string;
    picture?: string;
    email?: string;
  };
  if (!data.sub) throw new Error("LinkedIn did not return a profile");
  return {
    personUrn: `urn:li:person:${data.sub}`,
    name: data.name ?? "LinkedIn account",
    avatarUrl: data.picture ?? undefined,
    email: data.email ?? undefined,
  };
}

export type LinkedInPostResult = { postId: string; status: "published" };

/** Share a text post to the member's feed via Posts API v2. */
export async function linkedInPostShare(opts: {
  accessToken: string;
  personUrn: string;
  text: string;
}): Promise<LinkedInPostResult> {
  const res = await fetch(`${LINKEDIN_API}/rest/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202410",
    },
    body: JSON.stringify({
      author: opts.personUrn,
      commentary: opts.text,
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LinkedIn post failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  // 201 returns Location header with the post URN
  const location = res.headers.get("location") ?? "";
  const postId = location.split("/").pop() ?? "";
  return { postId, status: "published" };
}
