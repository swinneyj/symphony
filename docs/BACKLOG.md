# Symphony — Backlog

Durable work list (mirrors the session to-do). Status: `pending` | `done` | `dropped`.

## Priority queue

| # | Item | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Add `DEEPSEEK_API_KEY` (or `OPENAI_API_KEY)` to Vercel env for the symphony project | Slippaz | **done** | Unlocked the Formula Studio agent bar + LLM `{features}` in formula Render. |
| 2 | Test Formula Studio agent bar end-to-end (real graph change) | Hermes | **done** | Prompt → deepseek → 6-node graph applied live (boomerang + CTA overlay), saved as "Agent Demo — Boomerang + CTA". |
| 3 | Meta long-lived token expiry default (60d when `expires_in` absent) | Hermes | **done** | `src/app/api/auth/meta/callback/route.ts` — `expires_in` omitted → 60d. |
| 4 | Preview login/signout bounce to prod (`www.symphonyapp.company`) | Hermes | **done** | login+register: `redirect:false` + relative `redirect()`; sidebar signOut uses `window.location.origin` callbackUrl. Verified live. |
| 5 | IG media publish (public-Blob media store) | Hermes | **done** | Server upload route + UUID-gated public proxy + dispatcher reel/image publish. **Verified live**: upload 201 → proxy 200 → IG container created (nokturnal_lifestyle). NOTE: `thestripclubcrawl` IG account is Meta-restricted (subcode 2207050) — account-level, not code. |
| 6 | Add `BLOB_READ_WRITE_TOKEN` to Vercel env (symphony project) | Slippaz | **done** | Token live (resolver checks both `BLOB_READ_WRITE_TOKEN_READ_WRITE_TOKEN` and `BLOB_READ_WRITE_TOKEN`). |
| 7 | Real batch run with boomerang + overlay formula (credits ~$0.10–0.30) | Slippaz/Hermes | **done** | Aug 9: 2 real Sora 2 runs (Barebells). v1 exposed stale worker build (Aug 7 dist missing `extendMode`/`overlayTemplate` chaining) + `-shortest` truncating boomerang to VO length → rebuilt image, `-shortest` skipped on reverse-extend. v2 verified: 8.4s fwd+rev boomerang, CTA overlay burned, VO. TODO: Sora returns 4.3s for `durationSec=6` (provider duration param semantics). |
| 8 | TikTok approval → enable direct publish path | — | waiting | External. |
| 9 | V2V Video Clone (upload source → bg-change prompt → model picker → cloned video) | Hermes | in progress | Spec: `docs/V2V-CLONE-SPEC.md`. **S2 done 2026-08-13:** worker `v2v_edit` jobType built + verified live (frame-edit → Kling 3.0 Pro, bg + on-screen text change both work); prod worker container rebuilt. **S3/S4 open:** `/api/video-clone` + Clone tab UI, then QA on a real video (incl. Kling `video_url` true-V2V test) + cost check. |
| 10 | Add `GEMINI_API_KEY` to Vercel env (symphony project) | Slippaz | **done** | Added 2026-08-13 + redeployed. LLM layer is Gemini-primary (`src/lib/llm.ts`): remix/agent = `gemini-3.1-pro-preview`, fills = `gemini-3.6-flash` (IDs verified live). Confirm serving via one Formula-agent-bar prompt or a Steal-This-Ad remix. |

## Done (feature/video-studio, Aug 2026)

- TikTok product import: og_info parsing from share-link redirects
- Vercel build unblocked (cron removal — Hobby rejects `vercel.json` crons)
- Meta OAuth connect flow (FB pages + linked IG accounts, CSRF, workspace-correct)
- Facebook publish end-to-end (OAuth token → real post → Graph verify → delete)
- Composer per-platform account picker (`platformConfigs[platform].accountId`)
- BatchBot formula library import (30 scene formulas, `/api/formulas`, no auth)
- Formula Phase 1: boomerang (fwd+rev, 2× length, $0) + text overlay (`drawtext`, `{product}`/`{price}`)
- Formula Studio: node-graph builder (xyflow) — palette, connect, config panels, `nodeGraph` jsonb
- Formula agent bar: LLM rewires the graph (`/api/formulas/agent`, sanitized)
- Post Queue: finished videos + captions, preview/download proxy, posted tracking
- Share links (`/f/[id]`, unlisted) + Remix (copy to workspace → open in Studio)
- DB hardening: Neon role timeouts (idle tx 5min / statement 60s / lock 10s)
- Login/sign-out stay on the current origin (`redirect:false` + `window.location.origin` callbackUrl)
- Meta token expiry defaults to 60d when `expires_in` is omitted
- Composer media upload (server-side Blob put) + IG reel/image publish via public proxy

## Dropped

- TikTok session-draft bridge (ToS-gray; manual Post Queue covers the gap; official API after approval)

## Recurring gotchas

- **DB locks**: a stuck worker transaction can block `ALTER TABLE`. Role timeouts set; if a migration hangs, check `pg_locks` for `idle in transaction` and `pg_terminate_backend`.
- **Vercel Hobby**: any `crons` in `vercel.json` fails the build.
- **Preview env**: `META_CLIENT_ID/SECRET` + AI keys must be added in Vercel env (worker keys live on the VPS, not the preview).
- **Git push**: token URL (`https://x-access-token:$GITHUB_PAT@github.com/swinneyj/symphony.git`); plain push fails.
