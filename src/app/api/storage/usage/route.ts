import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const assets = await db.select({ id: mediaAssets.id, fileName: mediaAssets.fileName, fileSize: mediaAssets.fileSize, mediaType: mediaAssets.mediaType, mimeType: mediaAssets.mimeType, duration: mediaAssets.duration, audioTrackStatus: mediaAssets.audioTrackStatus, audioClassification: mediaAssets.audioClassification, createdAt: mediaAssets.createdAt }).from(mediaAssets).where(eq(mediaAssets.workspaceId, workspaceId));
  const byType = assets.reduce<Record<string, { bytes: number; count: number }>>((result, asset) => { const key = asset.mediaType; result[key] ??= { bytes: 0, count: 0 }; result[key].bytes += asset.fileSize ?? 0; result[key].count += 1; return result; }, {});
  return NextResponse.json({ assets, totalBytes: assets.reduce((sum, asset) => sum + (asset.fileSize ?? 0), 0), byType, limits: { hobbyStorageBytes: 1_000_000_000, hobbyTransferBytes: 10_000_000_000, maxUploadBytes: 500 * 1024 * 1024 } });
}
