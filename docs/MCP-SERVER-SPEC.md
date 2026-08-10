# Symphony MCP Server — Spec

**Date:** 2026-08-07 · **Branch:** `feature/video-studio` (existing temp branch — Slippaz: MCP work lives there, NOT main) · **PR:** rides PR #3's branch (MCP commits update its head)
**Status:** APPROVED (decisions §11) — **IMPLEMENTED 2026-08-07** (Phase 1 on `feature/video-studio`, E2E 15/15 green, `npm run build` clean). See `docs/MCP-CLIENTS.md` for client setup.

---

## 1. Why

Blotato's headline differentiator is *"Agent infrastructure for social media marketing — one API and MCP server, 9 platforms."* AI assistants (Claude Code, ChatGPT, Codex, Cowork) connect to it and drive content end-to-end. It's the one Blotato feature Symphony doesn't already beat. The "Automated My Entire Content System With Claude Code" video (the one Slippaz linked) is exactly this pattern: an agent that plans → drafts → publishes.

Symphony already owns the full content stack (accounts, posts, TikTok auto-publish, inbox, analytics, video studio). An MCP server turns that stack into a **brain that any agent can drive** — with **zero new infra and zero new cost** (~$0/mo; Blotato charges $29–499/mo for this).

Positioning: Symphony = the content OS. MCP = the steering wheel we hand to Claude Code / Codex / ChatGPT.

## 2. What we're building

A Model Context Protocol server at `POST /api/mcp` on the existing Vercel deployment (canonical `https://www.symphonyapp.company/api/mcp`) that exposes Symphony's existing capabilities as typed, scopable tools.

**Transports:**
- **Streamable HTTP (primary, remote):** `POST /api/mcp` — plain JSON-RPC request/response. No SSE needed for v1 (all tools are request/response; server-initiated notifications come in Phase 2 for batch-completion pings). Spec version `2025-06-18`.
- **stdio (dev/optional):** thin wrapper script so `claude mcp add symphony --transport stdio -- node scripts/mcp-local.mjs` works locally.
- **Plain REST (`/api/v1/*`)**: Phase 3 — aliases for n8n/Make/webhooks that don't speak MCP (Blotato ships n8n/Make nodes; we document the HTTP surface instead — cheaper and equivalent).

**What an agent session looks like (target use case, from the video):**
```
Claude Code: "Publish this week's TikTok content — product 3's batch video, formula 'Problem-Solution',
caption from generate_caption, schedule draft Mon 9am, direct-post the approved one."
  → tools/call list_accounts → list_products → create_batch → generate_caption → create_post → publish_to_tiktok(draft)
```

## 3. Architecture

```
┌──────────────┐   MCP streamable HTTP (Bearer key)   ┌────────────────────────────┐
│ Claude Code  │ ───────────────────────────────────▶ │ POST /api/mcp (Next route)  │
│ ChatGPT      │                                      │  auth → api_keys lookup     │
│ Codex        │                                      │  JSON-RPC dispatcher        │
│ Cursor       │                                      │  tools/list · tools/call   │
└──────────────┘                                      │  zod-validated inputs       │
                                                      └────────────┬───────────────┘
                                                                   │ scoped by key →
                        ┌──────────────┬──────────────┬────────────┼──────────────┬─────────────┐
                        ▼              ▼              ▼            ▼              ▼             ▼
                   /api/posts    /api/accounts   /api/ai/     /api/analytics  lib/tiktok   /api/inbox
                   (create/      (list)          generate    (overview)      (publish,    (Phase 2)
                    list)                          (captions)                  draft|direct)
```

**Auth model — workspace API keys (not OAuth, not sessions):**
- MCP clients send `Authorization: Bearer sym_live_<nanoid>` on every request (all major MCP clients support headers on remote transports).
- New `api_keys` table (migration `0006_api_keys.sql` — next number after 0005):

```sql
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),   -- posts.createdById requires a user
  name text NOT NULL,
  key_hash text NOT NULL,          -- bcrypt (bcryptjs already a dep — same as passwords)
  key_prefix text NOT NULL,        -- "sym_live_ab12..." first 10 chars for display
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp             -- NULL = active
);
```

- Raw key shown **once** at creation; only the hash is stored (bcrypt, like `users.passwordHash`). `sym_live_` prefix + 22-char nanoid.
- **Scopes:** `posts:read`, `posts:write`, `posts:publish`, `accounts:read`, `inbox:read`, `inbox:write`, `analytics:read`, `media:write`, `ai:generate`, `studio:read`, `studio:write`. `posts:publish` is the dangerous one — always paired with the explicit-confirm guardrail (§7).
- Key resolution per request: hash lookup → `workspace_id` + `scopes` + `created_by_id` → every tool call runs in that workspace context. Same membership semantics as the web routes, identity = key owner.
- **Rate limit:** per-key sliding window (60 req/min) in a module-level Map. Best-effort on serverless (cold starts reset it) — fine for v1 single-user; note as known limitation if we ever open it to customers (Upstash then).
- **Revocation:** `revoked_at` set → 401 on next use. Immediate, no cache.
- **UI:** Settings → new "API Keys" tab (list w/ prefix + last used, create w/ scope checkboxes, copy-once dialog, revoke). Reuses existing Settings page + Radix primitives. Settings route already exists at `/settings`.

## 4. Tool catalog

Every tool maps to **existing code** — no new features, no new tables beyond `api_keys`.

### Phase 1 (everything works on `main` today)

| Tool | What it does | Inputs (zod) | Backing code |
|---|---|---|---|
| `list_accounts` | Connected social accounts (tokens stripped) | — | `/api/accounts` GET (reuse sanitized shape) |
| `list_posts` | Posts w/ filters | `status?`, `campaignId?`, `page?`, `limit?` | `/api/posts` GET |
| `create_post` | Create draft / scheduled post | `content?`, `mediaIds?`, `platformConfigs?`, `status?`, `scheduledFor?` | `/api/posts` POST (createdById = key owner) |
| `get_post` | Single post + platform statuses | `postId` | `/api/posts/[id]` + `postPlatformStatus` |
| `generate_caption` | Caption / hashtag / idea options | `type`, `prompt`, `platform?` | `/api/ai/generate` (template engine on main; LLM fill arrives with video-studio merge) |
| `get_analytics` | Workspace analytics overview | `range?` | `/api/analytics/overview` |
| `publish_to_tiktok` | **DRAFT by default.** Video → TikTok inbox (no public post) | `videoUrl` (public Blob URL), `caption?`, `mode?=draft\|direct`, `privacyLevel?`, `consent?`, `confirm?` | `lib/tiktok.ts` — `getTikTokAccountForMember` + `initializeTikTokUpload` + `sendVideoToTikTok`. Direct requires `confirm:true` + `consent:true` + privacyLevel (mirrors the web UI's triple-gate) |
| `ping` | Liveness | — | protocol builtin |

### Phase 2 (depends on `feature/video-studio` merge for the last four)

| Tool | What it does | Backing code |
|---|---|---|
| `list_inbox` / `get_message` | Inbox messages w/ filters | `/api/inbox` |
| `reply_to_message` | Send reply | `/api/inbox/messages/[id]` |
| `list_media` / `upload_media_from_url` | Media assets; stage external URL into Blob | `/api/media`, `/api/upload` + `@vercel/blob` |
| `list_products` / `get_product` | Product library | `/api/products` (video-studio branch) |
| `list_formulas` | Script templates | `/api/formulas` (video-studio branch) |
| `create_batch` / `get_batch` | Kick off batch generation, poll progress | batches API (video-studio branch) |
| **SSE notifications** | `batch_completed` ping to subscribed agents | MCP `notifications` over SSE — the reason to use the SDK (§11 Q1) |

### Phase 3 (Blotato-matching extras)

- **REST `/api/v1/*` aliases** for n8n/Make/plain webhooks (Blotato's official nodes ≈ docs + curl examples).
- **Claude Skills pack** — Blotato's "$500-value Top 100 Viral Hooks + Repurpose Engine" promo is literally 2 Claude Skills. We ship our own: `symphony-publisher` (draft → review → publish loop) + `symphony-repurposer` (one long-form → 6 platform posts). Cheap, high perceived value, direct counter.
- **Client onboarding docs** (`docs/MCP-CLIENTS.md`): one-liners for Claude Code, Claude Desktop, ChatGPT, Codex, Cursor — Blotato documents "10+ clients"; we document the 5 that matter.

## 5. Protocol notes (implementation contract)

- Route: `src/app/api/mcp/route.ts`, `export const runtime = "nodejs"` (bcrypt + DB), `export const dynamic = "force-dynamic"`. Uses **`@modelcontextprotocol/sdk`** (DECIDED §11) — `McpServer` + a thin streamable-HTTP adapter for the route handler; SSE notifications for Phase 2 come free via the SDK.
- Accepts `POST` with JSON-RPC 2.0 bodies. Responses are `application/json` (no SSE in v1 — spec-compliant when the server sends no notifications).
- Methods handled: `initialize` (echo `protocolVersion: "2025-06-18"`, `capabilities: { tools: {} }`, `serverInfo: { name: "symphony-mcp", version }`), `notifications/initialized` (no-op 202), `tools/list` (catalog from a single registry), `tools/call` (dispatch → zod-validate → execute → `{ content: [{ type: "text", text: JSON.stringify(payload) }] }`), `ping`, `shutdown`.
- Errors: invalid/revoked key → 401; unknown tool / bad input → `-32602`; runtime failure → `-32603` with the underlying message in `data`.
- Tool definitions + zod schemas in one registry file so `tools/list` and `tools/call` can never drift.

## 6. Files

```
new   src/db/schema.ts            + apiKeys table + drizzle export
new   migrations/0006_api_keys.sql
new   src/lib/api-keys.ts         create (bcrypt hash), verify (lookup, scope check, touch last_used_at), revoke
new   src/lib/mcp/registry.ts     tool definitions + zod input schemas (single source of truth)
new   src/lib/mcp/dispatch.ts     JSON-RPC dispatch: initialize/tools/list/tools/call/ping + error mapping
new   src/app/api/mcp/route.ts    POST handler: auth → dispatch
new   src/app/(dashboard)/settings/api-keys-client.tsx + tab wiring in settings/page.tsx
new   scripts/mcp-local.mts       stdio transport wrapper (dev)   [keep .mts out of git if it breaks tsc — see gotchas]
new   docs/MCP-CLIENTS.md         client setup one-liners (Phase 1: Claude Code + Codex; Phase 3: rest)
edit  src/middleware.ts           nothing — /api/* is already public; auth happens in-route
```

Deps added: **`@modelcontextprotocol/sdk`** (MIT, free — DECIDED §11) plus existing bcryptjs/zod/nanoid. No other new deps.

## 7. Guardrails (Slippaz rules, encoded)

1. **Publish = triple-gate, always.** `publish_to_tiktok` defaults to `mode: "draft"`. `mode: "direct"` additionally requires `confirm: true` + `consent: true` + `privacyLevel`. Same gates as the web UI — an agent can't bypass what a human can't.
2. **Side-effect rule.** Any real publish/upload test (even throwaway accounts) happens only with Slippaz's go-ahead. Agent sessions are expected to run draft-mode until told otherwise.
3. **No token leakage.** Accounts/media tool responses reuse the existing sanitized shapes (accessToken/refreshToken never leave the DB).
4. **Scopes on by default.** New keys get read + draft-write scopes; `posts:publish` is opt-in per key.
5. **Audit trail.** Every `create_post`/`publish` records `createdById` = key owner — the composer's "created by" shows who (or what) made the post. `last_used_at` on the key shows agent activity.

## 8. Testing plan (merge-safety proof)

1. `npx tsc --noEmit` **and** `npm run build` — bare, unpiped commands (pipe-exit-code gotcha).
2. **Protocol handshake script** (`scripts/mcp-e2e.mjs`, .mjs not .mts): against `npm run dev` + real DB — initialize → tools/list (assert 8 tools + schemas) → create_post (draft) → get_post → delete post → revoked-key test (401) → wrong-scope test (error).
3. **Staging preview E2E:** same script against the Vercel preview URL with a key minted in the preview UI. Verify key rotation + revocation on the deployed build.
4. **Live agent test (Slippaz's machine):** `claude mcp add symphony --transport http --url <preview>/api/mcp --header "Authorization: Bearer <key>"` → one conversational round-trip (draft post, caption, dry-run publish).
5. **Publishing:** draft mode only in staging. Direct-post smoke test only after Slippaz's explicit go (sandbox target @jayswin143 is still private-account-blocked for direct anyway).
6. Verify with `git show --name-only --format="" HEAD` — no `node_modules|dist/|.env` sneaking in.

## 9. Branch & deploy

- **Work lives on `feature/video-studio`** (the temp branch with the recent video-studio edits; Slippaz 2026-08-07: *"we aren't pushing these to main, find that temp branch and put them there"*). Commits push to `origin/feature/video-studio`, updating PR #3's head. No new branch, no main.
- Merge to main happens ONLY when Slippaz lifts the temp-branch policy (covers video-studio + MCP together).
- Push via the PAT extraheader pattern (no gh CLI on VPS).
- Auto-deploy on push to main; verify via `/api/mcp` returning JSON-RPC errors (401 shape) on production.

## 10. Cost

| Item | Cost |
|---|---|
| Infra (Vercel route, Neon table) | $0 |
| Deps (bcryptjs, zod, nanoid — already present; SDK if chosen: MIT free) | $0 |
| Blotato equivalent | $29–499/mo |
| **Net** | **$0/mo** |

## 11. Decisions (resolved 2026-08-07 — Slippaz)

1. **Dispatcher: `@modelcontextprotocol/sdk` — DECIDED (SDK).** `McpServer` + thin streamable-HTTP adapter in the route handler. SSE notifications for Phase 2 batch pings come free.
2. **Scopes: granular (as §3) — DECIDED.** New keys default to read + draft-write; `posts:publish` opt-in.
3. **`publish_to_tiktok`: Phase 1 — DECIDED** (Slippaz asked what P1-vs-P2 meant; it's the moat — no competitor auto-posts. Draft default; `direct` requires `confirm:true` + `consent:true` + `privacyLevel`).
4. **Public Blob store `symphony-blob-public`: YES — DECIDED** (Slippaz unsure, Hermes decides). Hard dependency for direct post (TikTok PULL_FROM_URL needs a public URL) and shareable video links. ~2 min in the Vercel dashboard (user's lane) when we wire direct post; this spec assumes it exists by then.
5. **Claude Skills pack: IN — DECIDED** (Phase 3 scope confirmed).
