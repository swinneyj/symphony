# IG + Facebook Publishing — Implementation Spec (added 2026-08-07)

**Goal:** cross-post composed content (videos, images, text) from Symphony to the
**Nokturnal Lifestyle Concierge Facebook Page** and its linked **Instagram Business
account**, mirroring what Justin already does today — Facebook feed posts via
`scripts/post-to-facebook.js` / `publish-scheduled-blogs.js` in the nokturnal-lifestyle
repo (`FACEBOOK_PAGE_ID` + Page access token, `pages_read_engagement` + `pages_manage_posts`).
Instagram is not automated anywhere yet — this closes it.

## Why it's cheap (reuse, don't re-buy)

Justin's Meta infrastructure is already **business-verified and Live** (the WhatsApp Cloud
API integration, Aug 2026):
- Meta developer app (WhatsApp product) — add **Instagram Graph API** + **Facebook Login** products to the SAME app
- Business portfolio "Nokturnal Lifestyle" owns the FB Page + (once linked) the IG Business account
- **System User with a Never-expiry token** — extend its scopes, no token-refresh treadmill
- Graph API = **$0** (no per-post fees, no subscription) — consistent with build-don't-buy

## Access model (the 3 things Justin does, ~10 min, his lane)

1. Link the **Instagram Business account** to the FB Page (Instagram → Settings → "Linked accounts" — 2 min)
2. Extend the existing **System User** token scopes: `pages_show_list, pages_manage_posts,
   pages_read_engagement, instagram_basic, instagram_content_publish` (Business settings → System users → Add assets; token expiry **Never** — same pattern as the WhatsApp token)
3. Add IG/FB products to the existing Meta app (app settings — no review needed: he owns the assets; Standard Access + Live mode, already satisfied)

Existing `FACEBOOK_PAGE_ID` / page token can seed the FB side immediately (P1).

## Adapters (`src/lib/meta/` — new, mirrors `src/lib/tiktok/posting.ts`)

| Function | Call | Notes |
|---|---|---|
| `facebookPostVideo(pageId, token, {videoUrl, title, description})` | `POST /{page-id}/videos` | **video_url must be PUBLIC** |
| `facebookPostFeed(pageId, token, {message, link, picture})` | `POST /{page-id}/feed` | mirrors post-to-facebook.js (blog-style) |
| `instagramPostVideo(igUserId, token, {videoUrl, caption})` | `POST /{ig-user-id}/media` {media_type: VIDEO, video_url, caption} → poll `GET /{container-id}?fields=status_code` until FINISHED → `POST /{ig-user-id}/media_publish` {creation_id} | **video_url must be PUBLIC**; publish only after container FINISHED (else error 9007) |
| `instagramPostImage(igUserId, token, {imageUrl, caption})` | same container flow, media_type IMAGE | image_url PUBLIC |
| `refreshMetaToken` | `GET /oauth/access_token?grant_type=fb_exchange_token` | only needed for non-System-User tokens; updates `social_accounts.token_expires_at` |

**⚠️ The public-Blob dependency is now unavoidable:** TikTok direct-post (PULL_FROM_URL),
IG containers (video_url) and FB videos (video_url) ALL require public URLs; Symphony
videos live in the private Blob store. The pending **`symphony-blob-public`** Vercel store
(~2-min click) is the single unlock for all three platforms — promote it to a must-do.

## Data model (ZERO schema changes — already built)

- `social_accounts`: `platform='facebook'` (platform_account_id = page id, metadata {pageName}) / `platform='instagram'` (platform_account_id = ig user id, metadata {username, isBusiness}) — existing table, `token_expires_at` + `status` handle expiry
- `posts.platformConfigs.facebook = {pageId, title}` · `platformConfigs.instagram = {caption}`
- Per-platform outcome recorded in `platformConfigs.<platform>.status` (draft→published/failed + failureReason) — the TikTok pattern, reused

## Composer + scheduler

- Platform picker already lists IG/FB (`platformEnum`) — enabling them is a UI gate on "account connected"
- Publish dispatch: existing `publish` path gets a platform switch → meta adapters (TikTok stays as-is)
- **Draft-first default** (same guardrail as TikTok): composer sends to the platform's draft/inbox where supported, or holds as scheduled draft with one-click send; "direct" = triple-gated (confirm + consent + privacy) — Phase 2
- Scheduler: `scheduled_for` + cron fan-out — cross-post at the same time to TikTok + IG + FB (the "post everywhere" flow)

## MCP tools (Phase 2 of docs/MCP-SERVER-SPEC.md)

- `publish_to_facebook` · `publish_to_instagram` — same scopes pattern (`posts:publish`), same draft-first/triple-gate semantics as `publish_to_tiktok`

## Phases

| Phase | Scope | Depends on |
|---|---|---|
| **P1** | FB Page video + feed posts via existing page token (mirror post-to-facebook.js) | nothing new (token exists) |
| **P2** | IG Reel + image posts (container/publish) | IG Business linked to Page + System User scopes |
| **P3** | Composer multi-select + scheduler cross-post + draft-first UI | P1+P2 |
| **P4** | MCP tools + IG insights analytics + IG DM/comment webhooks (Blotato gap) | P3 + public Blob store |

**All phases:** feature/video-studio branch → preview → Justin approval. Nothing near main
(TikTok approval in progress — see §Workflow in AI-VIDEO-STUDIO-SPEC.md).

## What I need from Justin (his lane, no secrets in chat)

1. Add IG/FB products to the Meta app (or confirm the app name/ID so I can map the endpoints)
2. Link the IG Business account to the FB Page
3. Extend the System User token scopes (or paste the extended token value into a file under /opt/data/ — his established secret pattern)
4. The `symphony-blob-public` store click — now required by TikTok + IG + FB video posting
