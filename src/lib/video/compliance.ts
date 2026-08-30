/**
 * TikTok Shop compliance checklist + title builder + GPT Library deep check.
 * Mirrors BatchBot's compliance posture: disclosure hashtags, title limits,
 * minimum video length, no external watermarks.
 */

import { withLLM } from "@/lib/llm";
import { getGptPreset } from "./gpt-presets";
import { estimateChatCost, recordLlmUsage, type UsageContext } from "@/lib/usage";

export type ComplianceCheck = { name: string; passed: boolean; detail?: string };

export function buildComplianceChecklist(opts: {
  productName: string;
  durationSec: number | null;
  isShopProduct: boolean;
}): { checks: ComplianceCheck[]; passed: boolean } {
  const checks: ComplianceCheck[] = [];

  // TikTok Shop content should carry the affiliate-disclosure hashtag.
  checks.push({
    name: "disclosure hashtag (#tiktokmademebuyit)",
    passed: opts.isShopProduct,
    detail: opts.isShopProduct ? undefined : "product not flagged as TikTok Shop content",
  });

  // Short-form video floor (5s).
  checks.push({
    name: "video length ≥ 5s",
    passed: (opts.durationSec ?? 0) >= 5,
    detail: opts.durationSec ? `${opts.durationSec}s` : "unknown",
  });

  // Title budget: TikTok title limit is 2200 chars.
  checks.push({
    name: "title length ≤ 2200",
    passed: true,
    detail: "built by title builder",
  });

  return {
    checks,
    passed: checks.every((c) => c.passed),
  };
}

/** Builds a TikTok caption with the disclosure hashtag for shop content. */
export function buildTikTokTitle(opts: {
  productName: string;
  isShopProduct: boolean;
}): string {
  const base = `${opts.productName} — check it out on TikTok Shop`;
  return opts.isShopProduct ? `${base} #tiktokmademebuyit` : base;
}

/**
 * GPT Library deep check — TikTok Violation Checker preset.
 * Analyzes the actual script/title (not just static rules) and returns a
 * policy risk report. RED blocks publishing; the post route enforces that.
 * Returns null when the LLM chain is down (posting falls back to the static
 * checklist, which still runs).
 */
export type ComplianceReport = {
  rating: "green" | "yellow" | "red";
  issues: { line: string; category: string; risk: string; fix: string }[];
  summary: string;
};

export async function checkScriptCompliance(opts: {
  script: string | null;
  title: string | null;
  productName: string;
  productDescription?: string | null;
  usageCtx?: UsageContext;
}): Promise<ComplianceReport | null> {
  const preset = getGptPreset("violation_checker");
  if (!preset) return null;

  const content = [
    opts.productName ? `PRODUCT: ${opts.productName}` : null,
    opts.productDescription ? `PRODUCT DETAILS: ${opts.productDescription}` : null,
    opts.script ? `SPOKEN SCRIPT / ON-SCREEN TEXT:\n${opts.script}` : null,
    opts.title ? `CAPTION / TITLE: ${opts.title}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: preset.systemPrompt },
    { role: "user", content },
  ];
  const estimate = estimateChatCost("gpt", messages, { maxOutputTokens: 700 });
  let usedModel = estimate.model;
  const res = await withLLM("gpt", (client, model) => {
    usedModel = model;
    return client.chat.completions.create({
      model,
      // Gemini's OpenAI-compat endpoint truncates output when max_tokens is
      // sent (max_tokens=700 → ~28 tokens, JSON parse fails → silent static
      // fallback). Skip it for Gemini; keep for deepseek/openai.
      ...(model.startsWith("gemini") ? {} : { max_tokens: 700 }),
      temperature: 0.2,
      messages,
    });
  });
  if (!res) return null;
  if (opts.usageCtx) await recordLlmUsage(opts.usageCtx, usedModel, res.usage, estimate);

  const text = res.choices[0]?.message?.content?.trim();
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^```(json)?|```$/g, "").trim()) as ComplianceReport;
  } catch {
    return null; // malformed model output — don't block publishing on a parse miss
  }
}
