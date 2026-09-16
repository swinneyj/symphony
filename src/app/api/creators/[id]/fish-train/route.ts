import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { personas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";

/** Create a private Fish Audio voice model from consented creator audio. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const [creator] = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    if (!creator.workspaceId || !(await hasWorkspaceAccess(creator.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (creator.consentStatus !== "authorized") {
      return NextResponse.json({ error: "Creator consent must be authorized before training" }, { status: 400 });
    }
    const apiKey = process.env.FISH_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "FISH_API_KEY is not configured" }, { status: 503 });

    const form = await request.formData();
    const files = form.getAll("voices").filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return NextResponse.json({ error: "Upload at least one audio sample" }, { status: 400 });
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > 200 * 1024 * 1024) return NextResponse.json({ error: "Audio selection is too large (maximum 200 MB per training job)" }, { status: 413 });

    const fishForm = new FormData();
    fishForm.append("type", "tts");
    fishForm.append("title", String(form.get("title") || `${creator.name} voice`));
    fishForm.append("train_mode", "fast");
    fishForm.append("visibility", "private");
    fishForm.append("enhance_audio_quality", "true");
    fishForm.append("generate_sample", "false");
    for (const file of files) fishForm.append("voices", file, file.name || "voice-sample.wav");

    const response = await fetch("https://api.fish.audio/model", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fishForm,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof payload?.message === "string" ? payload.message : `Fish Audio training failed (${response.status})`;
      return NextResponse.json({ error: detail }, { status: response.status === 402 ? 402 : 502 });
    }
    const modelId = typeof payload?._id === "string" ? payload._id : null;
    if (!modelId) return NextResponse.json({ error: "Fish Audio returned no model ID" }, { status: 502 });
    const [updated] = await db.update(personas).set({ voiceProvider: "fish_audio", voiceModelId: modelId, updatedAt: new Date() }).where(eq(personas.id, id)).returning();
    return NextResponse.json({ modelId, state: payload.state ?? "created", creator: updated });
  } catch (error) {
    console.error("Error training Fish Audio voice:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
