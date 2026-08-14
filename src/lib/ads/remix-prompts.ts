/**
 * Steal This Ad prompt builders — PURE (no imports).
 * Shared by the server remix engine (src/lib/ads/restructure.ts) and the
 * client-side cost estimate (steal-this-ad page) so the pre-flight estimate
 * counts the EXACT messages the LLM will see.
 */

export const SYSTEM_PROMPT = `You are a TikTok Shop affiliate ad scriptwriter. You reverse-engineer what makes a viral ad work and write NEW original scripts for the same product.

RULES (hard constraints):
- Write ORIGINAL copy. Never reproduce the source transcript verbatim — reword, reorder, and restructure it. Do not quote it.
- Each script: a 1-2 sentence scroll-stopping HOOK, a short body (2-4 sentences) that sells the benefit, and a clear CTA ("link in bio", "grab it before it sells out", etc.).
- Keep scripts 20-40 seconds of spoken VO (~50-110 words).
- Match TikTok Shop affiliate norms: casual, benefit-first, no fake medical claims.
- Output ONLY a JSON array — no markdown, no commentary.`;

export const PRODUCT_SYSTEM_PROMPT = `You are a TikTok Shop affiliate ad scriptwriter for the e-commerce product described below. Write ORIGINAL scripts that make the product irresistible to TikTok shoppers.

RULES (hard constraints):
- Write ORIGINAL copy about the product. Only claim what the product info supports — no fake medical claims, no invented specs, no false scarcity.
- Each script: a 1-2 sentence scroll-stopping HOOK, a short body (2-4 sentences) that sells the benefit, and a clear CTA ("link in bio", "grab it before it sells out", etc.).
- Keep scripts 20-40 seconds of spoken VO (~50-110 words).
- Match TikTok Shop affiliate norms: casual, benefit-first.
- Output ONLY a JSON array — no markdown, no commentary.`;

export function buildUserPrompt(rawText: string, variants: number, tone?: string): string {
  const toneLine = tone ? ` All variants must use the tone: "${tone}".` : "";
  return `Source ad transcript:
"""${rawText.slice(0, 4000)}"""

Write ${variants} distinct remix scripts with different angles (e.g. problem/solution, demo, social proof, urgency, before/after).${toneLine}

JSON array of objects, each: {"hook": string, "angle": string, "tone": string, "script": string} where script is the FULL VO script INCLUDING the hook as its first sentence.`;
}

export function buildProductPrompt(rawText: string, variants: number, tone?: string): string {
  const toneLine = tone ? ` All variants must use the tone: "${tone}".` : "";
  return `Product info:
"""${rawText.slice(0, 4000)}"""

Write ${variants} distinct ad scripts with different angles (e.g. problem/solution, demo, social proof, urgency, before/after).${toneLine}

JSON array of objects, each: {"hook": string, "angle": string, "tone": string, "script": string} where script is the FULL VO script INCLUDING the hook as its first sentence.`;
}
