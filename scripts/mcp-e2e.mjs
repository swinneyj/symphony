// MCP server E2E — protocol handshake + all Phase 1 tools + auth/scope guards.
// Mints a real key + a scope-limited key directly in the DB, exercises the full
// JSON-RPC surface against a running instance, cleans up after itself.
// Usage: node scripts/mcp-e2e.mjs [baseUrl]   (default http://localhost:3000)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

const BASE = process.argv[2] ?? "http://localhost:3000";
const url = readFileSync("/opt/data/symphony/.env.local", "utf8")
  .match(/DATABASE_URL=(.+)/)?.[1]
  ?.trim();
const sql = neon(url);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Pull the tool's output text, whether it's a normal result or an isError result. */
function toolText(data) {
  const content = data?.result?.content ?? [];
  return content.map((c) => c.text ?? "").join(" ");
}

async function rpc(secret, method, params = {}) {
  const body = { jsonrpc: "2.0", id: Math.floor(Math.random() * 1e9), method };
  if (method !== "notifications/initialized") body.params = params;
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON (e.g. 202 empty) */
  }
  return { status: res.status, data, text };
}

const randomPart = () =>
  randomBytes(12).toString("base64url").slice(0, 14);

const [wsRow] = await sql`SELECT id FROM workspaces ORDER BY created_at LIMIT 1`;
const [userRow] = await sql`SELECT id FROM users ORDER BY created_at LIMIT 1`;
const workspaceId = wsRow.id;
const userId = userRow.id;

// Full-scope key + limited key (no posts:write)
const fullKey = "sym_live_" + randomPart();
const limitedKey = "sym_live_" + randomPart();
const [keyRow] = await sql`
  INSERT INTO api_keys (workspace_id, created_by_id, name, key_hash, key_prefix, scopes)
  VALUES (${workspaceId}, ${userId}, 'mcp-e2e', ${await bcrypt.hash(fullKey, 10)}, ${fullKey.slice(0, 16)},
          ARRAY['accounts:read','posts:read','posts:write','posts:publish','analytics:read','ai:generate'])
  RETURNING id
`;
const keyId = keyRow.id;
await sql`
  INSERT INTO api_keys (workspace_id, created_by_id, name, key_hash, key_prefix, scopes)
  VALUES (${workspaceId}, ${userId}, 'mcp-e2e-limited', ${await bcrypt.hash(limitedKey, 10)}, ${limitedKey.slice(0, 16)},
          ARRAY['posts:read'])
`;

let createdPostId = null;

try {
  // 1. Protocol handshake
  const init = await rpc(fullKey, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-e2e", version: "1.0.0" },
  });
  check(
    "initialize handshake → symphony-mcp + tools capability",
    init.status === 200 &&
      init.data?.result?.serverInfo?.name === "symphony-mcp" &&
      Boolean(init.data?.result?.capabilities?.tools),
    JSON.stringify(init.data?.result?.serverInfo ?? init.data?.error)
  );

  // 2. initialized notification (spec: 202; the SDK's JSON mode may use 200)
  const notif = await rpc(fullKey, "notifications/initialized");
  check("notifications/initialized accepted", notif.status === 202 || notif.status === 200, `status=${notif.status}`);

  // 3. tools/list
  const list = await rpc(fullKey, "tools/list");
  const toolNames = (list.data?.result?.tools ?? []).map((t) => t.name);
  const expected = [
    "list_accounts",
    "list_posts",
    "get_post",
    "create_post",
    "generate_caption",
    "get_analytics",
    "publish_to_tiktok",
  ];
  check(
    "tools/list returns all 7 tools",
    list.status === 200 && expected.every((t) => toolNames.includes(t)),
    toolNames.join(",")
  );

  // 4. list_accounts (tokens never leak)
  const accts = await rpc(fullKey, "tools/call", { name: "list_accounts", arguments: {} });
  const acctText = toolText(accts.data);
  const acctList = parseJson(acctText);
  check(
    "list_accounts",
    accts.status === 200 &&
      Array.isArray(acctList) &&
      !/accessToken|refreshToken/i.test(acctText),
    acctText.slice(0, 90)
  );

  // 5. create_post (draft)
  const cp = await rpc(fullKey, "tools/call", {
    name: "create_post",
    arguments: { content: "MCP E2E — delete me", status: "draft" },
  });
  const post = parseJson(toolText(cp.data)) ?? {};
  createdPostId = post.id;
  check(
    "create_post → draft in this workspace",
    cp.status === 200 && Boolean(post.id) && post.status === "draft" && post.workspaceId === workspaceId,
    `id=${post.id}`
  );

  // 6. get_post roundtrip
  const gp = await rpc(fullKey, "tools/call", { name: "get_post", arguments: { postId: createdPostId } });
  const gpost = parseJson(toolText(gp.data)) ?? {};
  check(
    "get_post roundtrip + platformStatuses",
    gp.status === 200 && gpost.id === createdPostId && Array.isArray(gpost.platformStatuses),
    `platformStatuses=${gpost.platformStatuses?.length}`
  );

  // 7. generate_caption
  const cap = await rpc(fullKey, "tools/call", {
    name: "generate_caption",
    arguments: { type: "caption", prompt: "coffee", platform: "instagram" },
  });
  const capObj = parseJson(toolText(cap.data)) ?? {};
  check(
    "generate_caption returns options",
    cap.status === 200 && Array.isArray(capObj.result?.options) && capObj.result.options.length >= 2,
    capObj.result?.selected?.slice(0, 50)
  );

  // 8. get_analytics
  const an = await rpc(fullKey, "tools/call", { name: "get_analytics", arguments: {} });
  const anObj = parseJson(toolText(an.data)) ?? {};
  check(
    "get_analytics metrics",
    an.status === 200 && typeof anObj.metrics?.totalPosts === "number",
    `totalPosts=${anObj.metrics?.totalPosts}`
  );

  // 9. publish_to_tiktok draft — validates + plans, no external call
  const pt = await rpc(fullKey, "tools/call", {
    name: "publish_to_tiktok",
    arguments: { videoUrl: "https://example.com/v.mp4", title: "E2E draft" },
  });
  const ptObj = parseJson(toolText(pt.data)) ?? {};
  check(
    "publish_to_tiktok draft = dry run",
    pt.status === 200 && ptObj.mode === "draft" && ptObj.dryRun === true,
    `account=${ptObj.wouldPost?.account ?? "none"}`
  );

  // 10. direct publish without confirm → refused before any account lookup
  const pt2 = await rpc(fullKey, "tools/call", {
    name: "publish_to_tiktok",
    arguments: { videoUrl: "https://example.com/v.mp4", title: "E2E", mode: "direct" },
  });
  const pt2Text = toolText(pt2.data) || pt2.data?.error?.message || "";
  check(
    "direct publish refused without confirm",
    pt2.data?.result?.isError === true && pt2Text.includes("confirm"),
    pt2Text.slice(0, 90)
  );

  // 11. invalid params → SDK converts to isError tool result
  const bad = await rpc(fullKey, "tools/call", {
    name: "create_post",
    arguments: { content: "x", status: "bogus" },
  });
  const badText = toolText(bad.data) || bad.data?.error?.message || "";
  check(
    "invalid params rejected",
    bad.data?.result?.isError === true && /bogus|Invalid/i.test(badText),
    badText.slice(0, 90)
  );

  // 12. scope guard — limited key cannot write (isError result expected)
  const scopeCall = await rpc(limitedKey, "tools/call", {
    name: "create_post",
    arguments: { content: "x" },
  });
  const scopeText = toolText(scopeCall.data) || scopeCall.data?.error?.message || "";
  check(
    "scope guard (posts:write required)",
    scopeCall.data?.result?.isError === true && scopeText.includes("posts:write"),
    scopeText.slice(0, 90)
  );

  // 13–15. auth guards
  const noAuth = await rpc(null, "tools/list");
  check("no key → 401", noAuth.status === 401, `status=${noAuth.status}`);
  const badKey = await rpc("sym_live_totallybogus", "tools/list");
  check("garbage key → 401", badKey.status === 401, `status=${badKey.status}`);
  await sql`UPDATE api_keys SET revoked_at = now() WHERE id = ${keyId}`;
  const revoked = await rpc(fullKey, "tools/list");
  check("revoked key → 401", revoked.status === 401, `status=${revoked.status}`);
} finally {
  if (createdPostId) await sql`DELETE FROM posts WHERE id = ${createdPostId}`.catch(() => {});
  await sql`DELETE FROM api_keys WHERE key_prefix = ${fullKey.slice(0, 16)}`.catch(() => {});
  await sql`DELETE FROM api_keys WHERE key_prefix = ${limitedKey.slice(0, 16)}`.catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
