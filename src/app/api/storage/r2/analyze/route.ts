import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { getR2Object } from "@/lib/r2";

export const runtime = "nodejs";
function probe(bytes: Uint8Array): Promise<string> { return new Promise((resolve, reject) => { const child = spawn("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-i", "pipe:0"]); const chunks: Buffer[] = []; child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk))); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(Buffer.concat(chunks).toString("utf8")) : reject(new Error(`ffprobe exited ${code}`))); child.stdin.end(bytes); }); }

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url); const workspaceId = url.searchParams.get("workspaceId"); const key = url.searchParams.get("key");
  if (!workspaceId || !key || !(await hasWorkspaceAccess(workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { const result = await getR2Object(key); if (!result?.response.Body) return NextResponse.json({ error: "Object not found" }, { status: 404 }); const metadata = JSON.parse(await probe(await result.response.Body.transformToByteArray())); const audio = Array.isArray(metadata.streams) && metadata.streams.some((stream: { codec_type?: string }) => stream.codec_type === "audio"); return NextResponse.json({ audioTrackStatus: audio ? "present" : "absent", audioClassification: audio ? "needs_review" : "silent" }); } catch { return NextResponse.json({ error: "FFmpeg analysis is unavailable on this deployment" }, { status: 503 }); }
}
