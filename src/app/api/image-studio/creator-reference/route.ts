import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adSources } from "@/db/schema";
import { blobToken } from "@/lib/blob-token";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";
export const maxDuration = 60;

type CreativeReference = {
  creativeAnalysis: string;
  imagePrompt: string;
  videoPrompt: string;
  overlayLines: string[];
};

/** Analyze a privately-ingested creator video into an original production plan. */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
    const productName = typeof body.productName === "string" ? body.productName.trim() : "the linked product";
    const productDescription = typeof body.productDescription === "string" ? body.productDescription.trim() : "";
    const category = typeof body.category === "string" ? body.category : "auto";
    if (!sourceId) {
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    }

    const [source] = await db.select().from(adSources).where(eq(adSources.id, sourceId)).limit(1);
    if (!source) return NextResponse.json({ error: "Creator reference not found" }, { status: 404 });
    if (!(await hasWorkspaceAccess(source.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (source.status !== "transcribed" || !source.videoUrl) {
      return NextResponse.json({ error: "Creator video is still being prepared" }, { status: 409 });
    }

    const privateBlob = source.videoUrl.includes(".blob.vercel-storage.com");
    const videoRes = await fetch(source.videoUrl, {
      headers: privateBlob && blobToken() ? { Authorization: `Bearer ${blobToken()}` } : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!videoRes.ok) throw new Error(`Could not load creator video (${videoRes.status})`);
    const declaredBytes = Number(videoRes.headers.get("content-length") ?? 0);
    if (declaredBytes > 50 * 1024 * 1024) throw new Error("Creator video exceeds 50MB analysis limit");
    const video = Buffer.from(await videoRes.arrayBuffer());
    if (video.byteLength > 50 * 1024 * 1024) throw new Error("Creator video exceeds 50MB analysis limit");

    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Missing GEMINI_API_KEY");
    const model = process.env.GEMINI_ANALYSIS_MODEL || "gemini-3.7-flash";
    const analysisPrompt = `Analyze the attached TikTok creator video as a creative director. Build an ORIGINAL adaptation for this product:
Product: ${productName}
Description: ${productDescription || "Not provided"}
Category: ${category}
Transcript: ${(source.rawText ?? "No spoken transcript").slice(0, 5000)}

Match the reference's high-level winning mechanics: hook type, shot sequence, pacing, framing, camera movement, hand/product interaction, energy, and caption rhythm. Do not copy the creator's face, voice, exact wording, copyrighted footage, or distinctive identity. The product references—not the creator video—control packaging and product appearance.

Return one JSON object with exactly these keys:
- creativeAnalysis: concise description of hook, shots, pacing, and why it works.
- imagePrompt: production-ready prompt for a photorealistic first-frame still. Preserve exact product packaging/text and use the clean product reference. No motion language.
- videoPrompt: production-ready image-to-video motion prompt for Kling 3.0. Focus on movements, timing, camera, hands, and physical realism without redescribing the product.
- overlayLines: array of 1 to 3 short, original on-screen captions inspired by the strategy, never copied verbatim.`;

    const gen = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: analysisPrompt },
              { inline_data: { mime_type: videoRes.headers.get("content-type")?.split(";")[0] || "video/mp4", data: video.toString("base64") } },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
          },
        }),
        signal: AbortSignal.timeout(55_000),
      }
    );
    if (!gen.ok) throw new Error(`Creator analysis failed: ${gen.status} ${(await gen.text()).slice(0, 300)}`);
    const payload = (await gen.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) throw new Error("Creator analysis returned no plan");
    const parsed = JSON.parse(text) as CreativeReference;
    if (!parsed.imagePrompt || !parsed.videoPrompt || !Array.isArray(parsed.overlayLines)) {
      throw new Error("Creator analysis returned an incomplete plan");
    }

    return NextResponse.json({ ...parsed, model, sourceId });
  } catch (error) {
    console.error("[image-studio/creator-reference]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Creator analysis failed" },
      { status: 500 }
    );
  }
}
