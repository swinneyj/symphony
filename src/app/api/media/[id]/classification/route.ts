import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { mediaAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "Media not found" }, { status: 404 });
  if (!(await hasWorkspaceAccess(asset.workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const classification = (await request.json()).classification;
  if (!["speech", "music", "mixed", "silent", null].includes(classification)) return NextResponse.json({ error: "Invalid classification" }, { status: 400 });
  const [updated] = await db.update(mediaAssets).set({ audioClassification: classification }).where(eq(mediaAssets.id, id)).returning({ id: mediaAssets.id, audioTrackStatus: mediaAssets.audioTrackStatus, audioClassification: mediaAssets.audioClassification, analyzedAt: mediaAssets.analyzedAt });
  return NextResponse.json(updated);
}
