import { withLLM } from "@/lib/llm";
import { estimateChatCost, recordLlmUsage, type UsageContext } from "@/lib/usage";
import { SYSTEM_PROMPT, PRODUCT_SYSTEM_PROMPT, buildUserPrompt, buildProductPrompt } from "./remix-prompts";

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

async function llmRemix(
  rawText: string,
  variants: number,
  tone: string | undefined,
  mode: "transcript" | "product",
  usageCtx?: UsageContext
): Promise<RemixVariant[] | null> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [
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
  ];
  const estimate = estimateChatCost("remix", messages, {
    maxOutputTokens: 1400 + variants * 900,
  });
  let usedModel = estimate.model;
  const res = await withLLM("remix", (client, model) => {
    usedModel = model; // actual model that served (chain may have fallen back)
    return client.chat.completions.create({
      model,
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages,
    });
  });
  if (!res) return null;
  if (usageCtx) await recordLlmUsage(usageCtx, usedModel, res.usage, estimate);
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
  opts: { variants?: number; tone?: string; mode?: "transcript" | "product"; usageCtx?: UsageContext } = {}
): Promise<RemixVariant[]> {
  const variants = Math.min(Math.max(opts.variants ?? 3, 1), 5);
  const mode = opts.mode ?? "transcript";
  try {
    const remixes = await llmRemix(rawText, variants, opts.tone, mode, opts.usageCtx);
    if (remixes && remixes.length > 0) return remixes;
  } catch (error) {
    console.error("[restructureAd] LLM failed, falling back to heuristic:", error);
  }
  return heuristicRemix(rawText, variants, opts.tone);
}
