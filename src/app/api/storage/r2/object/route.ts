import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { getR2Object } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const key = url.searchParams.get("key");
  if (!workspaceId || !key || !(await hasWorkspaceAccess(workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await getR2Object(key);
    if (!result?.response.Body) return NextResponse.json({ error: "Object not found" }, { status: 404 });
    const body = await result.response.Body.transformToByteArray();
    return new NextResponse(body as unknown as BodyInit, { headers: { "Content-Type": result.response.ContentType ?? "application/octet-stream", "Content-Length": String(body.byteLength), "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error("Error reading R2 object:", error);
    return NextResponse.json({ error: "Could not read R2 object" }, { status: 502 });
  }
}
