import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { listR2Objects, r2Config } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId || !(await hasWorkspaceAccess(workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!r2Config()) return NextResponse.json({ configured: false, objects: [] });
  try {
    const result = await listR2Objects();
    return NextResponse.json({ configured: true, ...result, totalBytes: result?.objects.reduce((sum, object) => sum + object.size, 0) ?? 0, totalObjects: result?.objects.length ?? 0 });
  } catch (error) {
    console.error("Error listing R2 source archive:", error);
    return NextResponse.json({ error: "Could not list R2 source archive" }, { status: 502 });
  }
}
