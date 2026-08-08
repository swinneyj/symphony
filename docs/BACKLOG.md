# Symphony — Backlog

Durable work list (mirrors the session to-do). Status: `pending` | `done` | `dropped`.

## Priority queue

| # | Item | Owner | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Add `DEEPSEEK_API_KEY` (or `OPENAI_API_KEY)` to Vercel env for the symphony project | Slippaz | **done** | Unlocked the Formula Studio agent bar + LLM `{features}` in formula Render. |
| 2 | Test Formula Studio agent bar end-to-end (real graph change) | Hermes | **done** | Prompt → deepseek → 6-node graph applied live (boomerang + CTA overlay), saved as "Agent Demo — Boomerang + CTA". |
| 3 | Meta long-lived token expiry default (60d when `expires_in` absent) | Hermes | pending | 1-line fix in `src/app/api/auth/meta/callback/route.ts`. |
| 4 | Preview login bounce to prod (`www.symphonyapp.company`) | Hermes | pending | Auth redirect target hardcoded to prod; session cookie survives on preview domain. |
| 5 | IG media publish (public-Blob media store) | Hermes | pending | IG correctly refuses media-less posts today (honest failure). |
| 6 | Real batch run with boomerang + overlay formula | Hermes | optional | Costs ~$0.10–0.30 credits (scene render + footage). |
| 7 | TikTok app approval → enable direct publish | External | pending | Triple-gated `publish_to_tiktok` / batch `/post` path already built and waiting. |

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

## Dropped

- TikTok session-draft bridge (ToS-gray; manual Post Queue covers the gap; official API after approval)

## Recurring gotchas

- **DB locks**: a stuck worker transaction can block `ALTER TABLE`. Role timeouts set; if a migration hangs, check `pg_locks` for `idle in transaction` and `pg_terminate_backend`.
- **Vercel Hobby**: any `crons` in `vercel.json` fails the build.
- **Preview env**: `META_CLIENT_ID/SECRET` + AI keys must be added in Vercel env (worker keys live on the VPS, not the preview).
- **Git push**: token URL (`https://x-access-token:$GITHUB_PAT@github.com/swinneyj/symphony.git`); plain push fails.
