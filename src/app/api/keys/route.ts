import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workspaceMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  API_KEY_SCOPES,
  createApiKey,
  listApiKeys,
  sanitizeApiKey,
} from "@/lib/api-keys";
import type { ApiKeyScope } from "@/lib/api-keys";

async function resolveWorkspaceMembership(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return { error: null, session: null };
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return { error: { error: "workspaceId query parameter is required", status: 400 }, session: null };
  }
  const membership = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1);
  if (membership.length === 0) {
    return { error: { error: "Not found", status: 404 }, session: null };
  }
  return { error: null, session, workspaceId };
}

// GET /api/keys?workspaceId=... — list API keys (sanitized, no hash)
export async function GET(request: Request) {
  const { error, workspaceId } = await resolveWorkspaceMembership(request);
  if (error) return NextResponse.json(error, { status: error.status });
  const rows = await listApiKeys(workspaceId!);
  return NextResponse.json(rows.map(sanitizeApiKey));
}

// POST /api/keys — create a key; the raw secret is returned exactly once
export async function POST(request: Request) {
  const { error, session, workspaceId } = await resolveWorkspaceMembership(request);
  if (error) return NextResponse.json(error, { status: error.status });

  const body = await request.json().catch(() => null);
  const { name, scopes } = body ?? {};

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.trim().length > 60) {
    return NextResponse.json(
      { error: "Name must be 60 characters or fewer" },
      { status: 400 }
    );
  }
  const validScopes = Array.isArray(scopes)
    ? (scopes as string[]).filter((s): s is ApiKeyScope =>
        (API_KEY_SCOPES as readonly string[]).includes(s)
      )
    : [];
  if (Array.isArray(scopes) && validScopes.length !== scopes.length) {
    return NextResponse.json(
      {
        error: `Invalid scope(s). Valid scopes: ${API_KEY_SCOPES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const userId = session!.user!.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { secret, row } = await createApiKey({
    workspaceId: workspaceId!,
    createdById: userId,
    name: name.trim(),
    scopes: validScopes,
  });

  return NextResponse.json(
    { ...sanitizeApiKey(row), secret },
    { status: 201 }
  );
}
