import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { aiGenerations } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { clientForModel } from "@/lib/llm";
import { presignBlobGet } from "@/lib/blob-presign";
import type OpenAI from "openai";

export const runtime = "nodejs";

const VISION_CHAIN = ["gemini-3.6-flash", "gpt-4o-mini"];
const TEXT_CHAIN = ["gemini-3.6-flash", "deepseek-chat", "gpt-4o-mini"];

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * POST /api/personas/generate-description
 * LLM-creates a persona's face description + style prompt, so the creator
 * never has to write prompts from scratch — the "✨ Generate with AI" button
 * in the persona dialog.
 *
 * Two modes:
 *  - No photos: invents an influencer from the name (+ optional hint).
 *  - photoUrls[] present (user uploaded their own photos): PRESIGNS each and
 *    sends them to a vision-capable model, which describes the ACTUAL person
 *    in the photos (real age/ethnicity/hair/build/wardrobe). This is the
 *    "clone me" path — the description must match the uploaded person, not
 *    a hallucinated one from the name.
 * Returns { description, personaPrompt } — both stay editable client-side.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const workspaceId = body.workspaceId;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const hint = typeof body.hint === "string" ? body.hint.trim() : "";
    const photoUrls = Array.isArray(body.photoUrls)
      ? (body.photoUrls as unknown[]).filter((u): u is string => typeof u === "string" && u.startsWith("https://")).slice(0, 5)
      : [];
    const hasPhotos = photoUrls.length > 0;
    // Model picker: "auto" (default) walks a chain (gemini flash free first);
    // a specific id calls just that model, falling back to auto.
    // DeepSeek is TEXT-ONLY — when photos are present only vision models apply.
    const PICKER_MODELS = hasPhotos ? VISION_CHAIN : TEXT_CHAIN;
    const pickedModel = typeof body.model === "string" && PICKER_MODELS.includes(body.model) ? body.model : null;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Persona name is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Presign uploaded (raw private Blob) photo URLs so the model provider can
    // fetch them — same presign path the dialog previews use.
    let presignedPhotoUrls: string[] = [];
    if (hasPhotos) {
      try {
        presignedPhotoUrls = await Promise.all(photoUrls.map((u) => presignBlobGet(u)));
      } catch (e) {
        console.warn(`[personas] presign photoUrls failed: ${(e as Error).message}`);
      }
      if (presignedPhotoUrls.length === 0) {
        return NextResponse.json(
          { error: "Could not prepare the uploaded photos — try uploading again." },
          { status: 500 }
        );
      }
    }

    const system = hasPhotos
      ? "You are a casting director for TikTok Shop UGC (user-generated content) ads. " +
        "You are given 1-5 PHOTOS of a real person. Describe THAT EXACT PERSON as seen in the photos — " +
        "their real age range, ethnicity/appearance, hairstyle and color, facial features, build, wardrobe, and expression. " +
        "Never invent or guess details that are not visible in the photos, and never substitute a stereotype or a " +
        "different ethnicity/appearance because of the person's name. If a trait is unclear, describe only what is visible. " +
        "Return STRICT JSON only, no markdown, exactly this shape: " +
        '{"description": "...", "personaPrompt": "..."}. ' +
        'description = a face-description prompt for AI image generation (age, ethnicity, hairstyle, build, wardrobe, expression, setting) — 30-80 words, detailed and photorealistic, must be safe-for-work. ' +
        'personaPrompt = a short style/delivery prompt injected into video scene prompts (energy, tone, lighting, setting vibe) — 10-30 words. ' +
        "Avoid names of real celebrities; avoid any protected/controversial identity markers."
      : "You are a casting director for TikTok Shop UGC (user-generated content) ads. " +
        "Given a persona name (and optional direction), invent a compelling, diverse, realistic influencer. " +
        "Return STRICT JSON only, no markdown, exactly this shape: " +
        '{"description": "...", "personaPrompt": "..."}. ' +
        'description = a face-description prompt for AI image generation (age, ethnicity, hairstyle, build, wardrobe, expression, setting) — 30-80 words, detailed and photorealistic, must be safe-for-work. ' +
        'personaPrompt = a short style/delivery prompt injected into video scene prompts (energy, tone, lighting, setting vibe) — 10-30 words. ' +
        "Avoid names of real celebrities; make every persona original. Avoid any protected/controversial identity markers.";

    const userMsg = hasPhotos
      ? `Persona name: "${name}"${hint ? `\nCreator direction: "${hint}"` : ""}\nDescribe the real person shown in the ${presignedPhotoUrls.length} attached photo(s). The photos are of the person this persona represents — your description must match them.`
      : `Persona name: "${name}"${hint ? `\nCreator direction: "${hint}"` : ""}`;

    const buildMessages = (): ChatMessage[] =>
      hasPhotos
        ? [
            { role: "system", content: system },
            {
              role: "user",
              content: [
                { type: "text", text: userMsg },
                ...presignedPhotoUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
              ],
            },
          ]
        : [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ];

    const attempt = (client: OpenAI, model: string) =>
      client.chat.completions.create({
        model,
        // Gemini's OpenAI-compat endpoint MANGLES both params: response_format
        // truncates to ~40 chars and max_tokens caps output at a tiny fraction
        // (max_tokens=700 → ~28 tokens). Verified 2026-08. For Gemini send
        // neither and rely on its native 8192-token output cap; keep both for
        // providers that honor them (deepseek, openai).
        ...(model.startsWith("gemini")
          ? {}
          : { max_tokens: 700, response_format: { type: "json_object" as const } }),
        temperature: 0.8,
        messages: buildMessages(),
      });

    // Picked model first, then the rest of the auto chain as fallback so a bad
    // pick / quota blip never dead-ends the user. Every model gets a shot —
    // a 4xx on one provider (e.g. Gemini rejecting an image part shape) must
    // fall through to the next, not abort the chain.
    const defaultChain = hasPhotos ? VISION_CHAIN : TEXT_CHAIN;
    const chain = pickedModel
      ? [pickedModel, ...defaultChain.filter((m) => m !== pickedModel)]
      : defaultChain;
    let res: Awaited<ReturnType<typeof attempt>> | null = null;
    let lastErr = "";
    for (const model of chain) {
      const client = clientForModel(model);
      if (!client) {
        lastErr = `${model}: API key not configured`;
        continue; // key for this provider not configured
      }
      try {
        res = await attempt(client, model);
        if (res) break;
      } catch (err) {
        const status = (err as { status?: number })?.status;
        const msg = (err as Error).message?.slice(0, 300) ?? String(err);
        lastErr = `${model} (${status ?? "?"}): ${msg}`;
        console.warn(`[personas] generate-description ${model} failed: ${lastErr}`);
      }
    }

    const raw = res?.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) {
      return NextResponse.json(
        { error: `AI generation is unavailable right now — every model failed. Last error: ${lastErr || "no model configured"}` },
        { status: 502 }
      );
    }
    // Strip markdown fences some models wrap JSON in (```json ... ```).
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const parsed = (() => {
      try {
        return JSON.parse(cleaned);
      } catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : null;
      }
    })();

    const description = typeof parsed?.description === "string" ? parsed.description.trim() : null;
    const personaPrompt = typeof parsed?.personaPrompt === "string" ? parsed.personaPrompt.trim() : null;
    if (!description) {
      return NextResponse.json(
        { error: `Model returned an unusable response — try again. (raw: ${raw.slice(0, 160)})` },
        { status: 502 }
      );
    }

    await db.insert(aiGenerations).values({
      workspaceId,
      userId: session.user.id,
      type: "persona_description",
      prompt: `${userMsg}\n[photos: ${hasPhotos ? presignedPhotoUrls.length : 0}]`,
      result: { description, personaPrompt, hasPhotos },
    });

    return NextResponse.json({ description, personaPrompt: personaPrompt ?? "" });
  } catch (error) {
    console.error("Error generating persona description:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
