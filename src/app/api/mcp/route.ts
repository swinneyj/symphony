import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/lib/mcp/server";
import { verifyApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Symphony MCP endpoint — Streamable HTTP (stateless, JSON responses).
 *
 * Auth: `Authorization: Bearer sym_live_...` (workspace API key, created in
 * Settings → API Keys). Validated on every request; the key's workspace and
 * scopes bind all tool calls.
 *
 * Clients: Claude Code / Claude Desktop / Codex / Cursor / n8n (HTTP).
 * See docs/MCP-CLIENTS.md for setup one-liners.
 */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const secret = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  const ctx = secret ? await verifyApiKey(secret) : null;

  if (!ctx) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message:
            "Unauthorized: pass a valid Symphony API key (Authorization: Bearer sym_live_...). Create one in Settings → API Keys.",
        },
      },
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no in-memory sessions on serverless
    enableJsonResponse: true, // JSON responses; SSE only if we ever push notifications
  });
  const server = buildMcpServer(ctx);
  await server.connect(transport);
  return transport.handleRequest(request);
}
