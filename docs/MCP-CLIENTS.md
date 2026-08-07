# Connecting AI agents to Symphony (MCP)

Symphony exposes its content stack as tools over the **Model Context Protocol**
at `/api/mcp` (Streamable HTTP, stateless, JSON responses). Any agent or tool
that supports MCP clients — Claude Code, Claude Desktop, Codex, Cursor, n8n —
can create posts, generate captions, read analytics, and publish to TikTok
through your workspace.

## 1. Get an API key

1. Open **Settings → API Keys** in Symphony.
2. Name it (e.g. `claude-code`) and pick scopes. Defaults = everything read +
   write; **Publish to TikTok (`posts:publish`) is opt-in**.
3. Copy the `sym_live_...` secret — **shown once only**.

Every key is scoped to one workspace and can be revoked any time.

## 2. Point your client at the server

**Endpoint (production):** `https://www.symphonyapp.company/api/mcp`
**Endpoint (Vercel preview):** the `...vercel.app` URL from the latest PR preview

All requests need the header `Authorization: Bearer sym_live_...`.

### Claude Code (remote MCP)

```bash
claude mcp add symphony \
  --transport http \
  --url https://www.symphonyapp.company/api/mcp \
  --header "Authorization: Bearer sym_live_YOUR_KEY"
```

Verify with `claude mcp list`, then try: *"Draft a TikTok post about the
weekend sale, then show me a caption option."*

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "symphony": {
      "type": "http",
      "url": "https://www.symphonyapp.company/api/mcp",
      "headers": { "Authorization": "Bearer sym_live_YOUR_KEY" }
    }
  }
}
```

### Codex CLI

In `~/.codex/config.toml`:

```toml
[mcp_servers.symphony]
type = "http"
url = "https://www.symphonyapp.company/api/mcp"
headers = { Authorization = "Bearer sym_live_YOUR_KEY" }
```

### Cursor

Settings → MCP → **Add new MCP server** → type `http`, URL
`https://www.symphonyapp.company/api/mcp`, header `Authorization: Bearer ...`.

### n8n / scripts (raw HTTP)

MCP is JSON-RPC over POST — n8n or any script can call it directly:

```bash
curl -s -X POST https://www.symphonyapp.company/api/mcp \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -H "authorization: Bearer sym_live_YOUR_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Send `initialize` → `notifications/initialized` → `tools/call` with
`{"name":"<tool>","arguments":{...}}`. See `scripts/mcp-e2e.mjs` for a full
working client.

## 3. Tools

| Tool | Scopes required | What it does |
|---|---|---|
| `list_accounts` | `accounts:read` | Connected social accounts (no tokens) |
| `list_posts` | `posts:read` | Posts, filter by status + pagination |
| `get_post` | `posts:read` | One post + per-platform publish statuses |
| `create_post` | `posts:write` | Draft / scheduled / approved post |
| `generate_caption` | `ai:generate` | Caption, hashtag, image prompt, idea |
| `get_analytics` | `analytics:read` | Overview metrics + platform breakdown |
| `publish_to_tiktok` | `posts:publish` | TikTok Direct Post (PULL_FROM_URL) |

## 4. Safety rails (by design)

- **`publish_to_tiktok` defaults to `mode: "draft"`** — it validates and returns
  the exact payload it *would* send. No external call, ever.
- **Direct publish** requires `mode: "direct"` **plus** `confirm: true`,
  `consent: true`, and a `privacyLevel` (`SELF_ONLY` default). This mirrors the
  web UI's explicit consent flow.
- `videoUrl` must be a **public** URL (TikTok's Direct Post pulls the file; it
  cannot read private Blob storage).
- Revoked keys fail with HTTP 401 immediately. Tool-level failures come back as
  MCP `isError` results with a readable message.

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401` on every call | Key invalid, revoked, or missing `sym_live_` prefix — recreate in Settings |
| `-32602` / "Invalid arguments" | Bad tool args — check the tool's schema via `tools/list` |
| `isError: "Forbidden: ... scope"` | Key lacks the required scope — recreate with more scopes |
| "No connected TikTok account" | Connect TikTok in Settings → Connected Accounts first |
| Publish fails on the URL | `videoUrl` isn't publicly fetchable (private Blob / signed URL) |

Phase 2 (inbox replies, media, video-studio batch tools) will extend this
surface — `tools/list` will show new tools automatically.
