import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { aiGenerations } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { withLLM } from "@/lib/llm";

export const runtime = "nodejs";

/**
 * POST /api/personas/generate-description
 * LLM-creates a persona's face description + style prompt from the name
 * (and optional user hint), so the creator never has to write prompts from
 * scratch — the "✨ Generate with AI" button in the persona dialog.
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

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Persona name is required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const system =
      "You are a casting director for TikTok Shop UGC (user-generated content) ads. " +
      "Given a persona name (and optional direction), invent a compelling, diverse, realistic influencer. " +
      "Return STRICT JSON only, no markdown, exactly this shape: " +
      '{"description": "...", "personaPrompt": "..."}. ' +
      'description = a face-description prompt for AI image generation (age, ethnicity, hairstyle, build, wardrobe, expression, setting) — 30-80 words, detailed and photorealistic, must be safe-for-work. ' +
      'personaPrompt = a short style/delivery prompt injected into video scene prompts (energy, tone, lighting, setting vibe) — 10-30 words. ' +
      "Avoid names of real celebrities; make every persona original. Avoid any protected/controversial identity markers.";

    const userMsg = `Persona name: "${name}"${hint ? `\nCreator direction: "${hint}"` : ""}`;

    const res = await withLLM("gpt", (client, model) =>
      client.chat.completions.create({
        model,
        // Gemini's OpenAI-compat endpoint MANGLES both params: response_format
        // truncates to ~40 chars and max_tokens caps output at a tiny fraction
        // (max_tokens=700 → ~28 tokens). Verified 2026-08. For Gemini send
        // neither and rely on its native 8192-token output cap; keep both for
        // providers that honor them (deepseek, openai).
        ...(model.startsWith("gemini")
          ? {}
          : { max_tokens: 700, response_format: { type: "json_object" } }),
        temperature: 0.8,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      })
    );

    const raw = res?.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) {
      return NextResponse.json(
        { error: "AI generation is unavailable right now — no model responded. Check that GEMINI_API_KEY is set on the deployment." },
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
      prompt: userMsg,
      result: { description, personaPrompt },
    });

    return NextResponse.json({ description, personaPrompt: personaPrompt ?? "" });
  } catch (error) {
    console.error("Error generating persona description:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
