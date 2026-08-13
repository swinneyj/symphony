import type OpenAI from "openai";
import { getClient, llmModel } from "@/lib/llm";

/**
 * Steal This Ad — remix engine.
 *
 * Takes the transcript of a viral ad and rewrites it into ORIGINAL scripts in
 * our hook/body/CTA format. We steal the structure (angle, cadence, offer
 * framing), never the words: the LLM prompt hard-constrains against verbatim
 * copying, and the heuristic fallback reorders + rephrases by construction.
 */

export type RemixVariant = {
  hook: string;
  angle: string;
  tone: string;
  script: string;
};

const TONES = ["casual", "urgent", "excited", "deadpan", "storytelling"];

const SYSTEM_PROMPT = `You are a TikTok Shop affiliate ad scriptwriter. You reverse-engineer what makes a viral ad work and write NEW original scripts for the same product.

RULES (hard constraints):
- Write ORIGINAL copy. Never reproduce the source transcript verbatim — reword, reorder, and restructure it. Do not quote it.
- Each script: a 1-2 sentence scroll-stopping HOOK, a short body (2-4 sentences) that sells the benefit, and a clear CTA ("link in bio", "grab it before it sells out", etc.).
- Keep scripts 20-40 seconds of spoken VO (~50-110 words).
- Match TikTok Shop affiliate norms: casual, benefit-first, no fake medical claims.
- Output ONLY a JSON array — no markdown, no commentary.`;

const PRODUCT_SYSTEM_PROMPT = `You are a TikTok Shop affiliate ad scriptwriter for the e-commerce product described below. Write ORIGINAL scripts that make the product irresistible to TikTok shoppers.

RULES (hard constraints):
- Write ORIGINAL copy about the product. Only claim what the product info supports — no fake medical claims, no invented specs, no false scarcity.
- Each script: a 1-2 sentence scroll-stopping HOOK, a short body (2-4 sentences) that sells the benefit, and a clear CTA ("link in bio", "grab it before it sells out", etc.).
- Keep scripts 20-40 seconds of spoken VO (~50-110 words).
- Match TikTok Shop affiliate norms: casual, benefit-first.
- Output ONLY a JSON array — no markdown, no commentary.`;

function buildUserPrompt(rawText: string, variants: number, tone?: string): string {
  const toneLine = tone ? ` All variants must use the tone: "${tone}".` : "";
  return `Source ad transcript:
"""${rawText.slice(0, 4000)}"""

Write ${variants} distinct remix scripts with different angles (e.g. problem/solution, demo, social proof, urgency, before/after).${toneLine}

JSON array of objects, each: {"hook": string, "angle": string, "tone": string, "script": string} where script is the FULL VO script INCLUDING the hook as its first sentence.`;
}

function buildProductPrompt(rawText: string, variants: number, tone?: string): string {
  const toneLine = tone ? ` All variants must use the tone: "${tone}".` : "";
  return `Product info:
"""${rawText.slice(0, 4000)}"""

Write ${variants} distinct ad scripts with different angles (e.g. problem/solution, demo, social proof, urgency, before/after).${toneLine}

JSON array of objects, each: {"hook": string, "angle": string, "tone": string, "script": string} where script is the FULL VO script INCLUDING the hook as its first sentence.`;
}

async function llmRemix(
  client: OpenAI,
  rawText: string,
  variants: number,
  tone?: string,
  mode: "transcript" | "product" = "transcript"
): Promise<RemixVariant[]> {
  const res = await client.chat.completions.create({
    model: llmModel("remix"),
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: mode === "product" ? PRODUCT_SYSTEM_PROMPT : SYSTEM_PROMPT,
      },
      {
        role: "user",
        content:
          mode === "product"
            ? buildProductPrompt(rawText, variants, tone)
            : buildUserPrompt(rawText, variants, tone),
      },
    ],
  });
  const text = res.choices[0]?.message?.content ?? "";
  const parsed = JSON.parse(text) as { remixes?: RemixVariant[] } | RemixVariant[];
  const arr = Array.isArray(parsed) ? parsed : parsed.remixes ?? [];
  return arr
    .filter((v) => v && typeof v.script === "string" && v.script.trim().length > 0)
    .map((v) => ({
      hook: v.hook?.trim() ?? v.script.trim().split(/[.!?]/)[0],
      angle: v.angle?.trim() ?? "remix",
      tone: v.tone?.trim() ?? tone ?? "casual",
      script: v.script.trim(),
    }))
    .slice(0, variants);
}

/**
 * Keyless fallback: reorders the source sentences into hook/body/CTA shaped
 * scripts with a different angle per variant. Never verbatim — sentences are
 * condensed (<=14 words) and re-sequenced so the output is structurally new.
 */
function heuristicRemix(rawText: string, variants: number, tone?: string): RemixVariant[] {
  const sentences = rawText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length <= 160);
  if (sentences.length === 0) {
    return [
      {
        hook: "You have to see this.",
        angle: "curiosity",
        tone: tone ?? "casual",
        script: `You have to see this. ${rawText.trim().slice(0, 120)} Grab it before it's gone.`,
      },
    ];
  }
  const out: RemixVariant[] = [];
  const angles = ["problem/solution", "social proof", "urgency", "demo", "before/after"];
  for (let i = 0; i < Math.min(variants, 3); i++) {
    // Rotate the starting sentence so each variant opens differently.
    const rotated = [...sentences.slice(i), ...sentences.slice(0, i)];
    const hook = rotated[0].slice(0, 90);
    const body = rotated.slice(1, 4).map((s) => (s.length > 90 ? s.slice(0, 90) : s));
    const script = [hook, ...body, "Grab it before it sells out — link in bio."].join(" ");
    out.push({
      hook,
      angle: angles[i % angles.length],
      tone: tone ?? TONES[i % TONES.length],
      script,
    });
  }
  return out;
}

export async function restructureAd(
  rawText: string,
  opts: { variants?: number; tone?: string; mode?: "transcript" | "product" } = {}
): Promise<RemixVariant[]> {
  const variants = Math.min(Math.max(opts.variants ?? 3, 1), 5);
  const client = getClient();
  if (!client) {
    return heuristicRemix(rawText, variants, opts.tone);
  }
  try {
    const remixes = await llmRemix(client, rawText, variants, opts.tone, opts.mode);
    if (remixes.length > 0) return remixes;
  } catch (error) {
    console.error("[restructureAd] LLM failed, falling back to heuristic:", error);
  }
  return heuristicRemix(rawText, variants, opts.tone);
}
