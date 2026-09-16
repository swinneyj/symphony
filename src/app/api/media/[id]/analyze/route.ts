import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";

function probe(bytes: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", "-i", "pipe:0"]);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(Buffer.concat(chunks).toString("utf8")) : reject(new Error(`ffprobe exited ${code}`)));
    child.stdin.end(bytes);
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  if (!(await hasWorkspaceAccess(asset.workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (asset.mediaType !== "video") return NextResponse.json({ error: "Audio analysis is only available for video files" }, { status: 400 });
  const token = blobToken();
  if (!token) return NextResponse.json({ error: "Blob token missing" }, { status: 500 });
  try {
    const upstream = await fetch(asset.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!upstream.ok) return NextResponse.json({ error: `Could not read media (${upstream.status})` }, { status: 502 });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    const metadata = JSON.parse(await probe(bytes));
    const audio = Array.isArray(metadata.streams) && metadata.streams.some((stream: { codec_type?: string }) => stream.codec_type === "audio");
    const status = audio ? "present" : "absent";
    const [updated] = await db.update(mediaAssets).set({ audioTrackStatus: status, analyzedAt: new Date() }).where(eq(mediaAssets.id, id)).returning({ id: mediaAssets.id, audioTrackStatus: mediaAssets.audioTrackStatus, audioClassification: mediaAssets.audioClassification, analyzedAt: mediaAssets.analyzedAt });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Audio analysis is unavailable on this deployment; process this file locally with FFmpeg." }, { status: 503 });
  }
}
