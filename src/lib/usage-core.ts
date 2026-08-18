/**
 * AI usage & cost tracking — PURE core (no db, no server deps).
 * Safe to import from client components and server routes alike.
 *
 * Two figures, kept honest:
 *  - ESTIMATE (before): tokens counted with a real tokenizer (gpt-tokenizer,
 *    cl100k_base — exact for gpt-4o-mini/deepseek, within a few % for Gemini)
 *    × list prices. Labeled "estimated"; the actual model may differ (fallback
 *    chain) so the $ is a projection, not a quote.
 *  - ACTUAL (after): tokens from the API response's `usage` object, costed at
 *    list prices, persisted to `llm_usage` (see src/lib/usage.ts). That number
 *    is what counts.
 *
 * All prices are PAID-TIER list prices verified against provider pages
 * (2026-08-14). Update this file when the model stack changes — the rest of
 * the app just consumes these maps.
 */

import { encode } from "gpt-tokenizer";

// ── LLM pricing: $ per 1M tokens ─────────────────────────────────────────────
// gemini: ai.google.dev/gemini-api/docs/pricing (Flash $0.30/$2.50, Pro $1.25/$10)
// deepseek: api-docs.deepseek.com/quick_start/pricing (V4-Flash peak rates — app
//   calls the `deepseek-chat` alias; priced at current V4-Flash list)
// gpt-4o-mini: platform.openai.com/docs/pricing ($0.15/$0.60, cached $0.075)
export const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  "gemini-3.6-flash": { input: 0.3, output: 2.5, cacheRead: 0.03 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 10.0, cacheRead: 0.125 },
  "deepseek-chat": { input: 0.14, output: 0.28, cacheRead: 0.0028 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cacheRead: 0.075 },
};

export type LLMTask = "remix" | "agent" | "fill";

/**
 * First model in each fallback chain (see src/lib/llm.ts LLM_CHAIN — keep in
 * sync). Used for client-side pre-flight estimates where we can't read env
 * keys; the actual call may fall back down the chain.
 */
export const CHAIN_FIRST: Record<LLMTask, string> = {
  remix: "gemini-3.1-pro-preview",
  agent: "gemini-3.1-pro-preview",
  fill: "gemini-3.6-flash",
};

// ── Non-token media pricing (used by the batch cost panels) ─────────────────
// scene image: gemini-2.5-flash-image "Nano Banana" 1K ≈ $0.039/image (google
//   pricing page); Imagen 4 Fast $0.02. Use $0.04 as the conservative default.
// footage: fal Seedance 2.5 list prices (480p ≈ $0.22/s, 720p ≈ $0.47/s,
//   1080p ≈ $0.90/s — same map video-worker footage.ts uses).
// veo: Veo 3.1 no-audio list (google pricing page: $0.12/s 1080p, $0.30/s 4K).
// sora: billed in OpenAI credits — NO $ map (shown as "credit-based").
// tts: gpt-4o-mini-tts $0.60/1M text chars; ElevenLabs ≈ $0.20/1K chars;
//   kokoro self-hosted $0.
export const MEDIA_PRICING = {
  sceneImageUsd: 0.04,
  footagePerSec: { "480p": 0.22, "720p": 0.47, "1080p": 0.9 } as Record<string, number>,
  // fal.ai list prices, no audio: Seedance 2.5 ≈ $0.22/$0.47/$0.90 per sec;
  // Kling 1.0 $0.045/sec; Kling 3.0 Standard $0.084/sec; Veo 3.1 $0.20/sec.
  providerFootagePerSec: {
    seedance: { "480p": 0.22, "720p": 0.47, "1080p": 0.9 },
    kling_v1: { "480p": 0.045, "720p": 0.045, "1080p": 0.045 },
    kling_v3: { "480p": 0.084, "720p": 0.084, "1080p": 0.084 },
    kling: { "480p": 0.084, "720p": 0.084, "1080p": 0.084 },
    veo: { "480p": 0.2, "720p": 0.2, "1080p": 0.2 },
  } as Record<string, Record<string, number>>,
  veoPerSec: { "1080p": 0.12, "4k": 0.3 } as Record<string, number>,
  ttsPerChar: { openai_tts: 0.0000006, elevenlabs: 0.0002, kokoro: 0 } as Record<string, number>,
} as const;

export type ChatMessage = { role: string; content: string };

/** Token count via a real tokenizer (cl100k_base). ~exact for OpenAI/DeepSeek. */
export function countTokens(text: string): number {
  try {
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export function countMessagesTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + countTokens(m.content) + 4, 0);
}

export function providerForModel(model: string): string {
  if (model.startsWith("gemini")) return "gemini";
  if (model === "deepseek-chat") return "deepseek";
  return "openai";
}

export type CostEstimate = {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/**
 * Estimate the cost of a chat call BEFORE it happens.
 * Client-safe: prices at the first model in the chain (or an explicit model)
 * since env keys aren't readable in the browser.
 */
export function estimateChatCost(
  task: LLMTask,
  messages: ChatMessage[],
  opts: { maxOutputTokens?: number; model?: string } = {}
): CostEstimate {
  const model = opts.model ?? CHAIN_FIRST[task];
  const price = MODEL_PRICING[model] ?? { input: 0.3, output: 1.5, cacheRead: 0.03 };
  const inputTokens = countMessagesTokens(messages);
  const outputTokens = opts.maxOutputTokens ?? 200;
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return { model, provider: providerForModel(model), inputTokens, outputTokens, costUsd };
}

/** Cost the ACTUAL usage object returned by the API (OpenAI-compat shape). */
export type ApiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  prompt_cache_hit_tokens?: number; // DeepSeek
};

export function costFromUsage(model: string, usage: ApiUsage | undefined | null) {
  const price = MODEL_PRICING[model] ?? { input: 0.3, output: 1.5, cacheRead: 0.03 };
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const cacheRead =
    usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens ?? 0;
  const billedInput = Math.max(inputTokens - cacheRead, 0);
  const costUsd =
    (billedInput * price.input + cacheRead * price.cacheRead + outputTokens * price.output) /
    1_000_000;
  return { inputTokens, outputTokens, cacheReadTokens: cacheRead, costUsd };
}

// ── Media (non-token) cost helpers for the video pipeline ───────────────────

export function qualityToResolution(quality: string): string {
  // Mirrors video-worker footage.ts: fast → 480p, standard → 720p, pro → 1080p.
  if (quality === "fast") return "480p";
  if (quality === "pro") return "1080p";
  return "720p";
}

export type MediaCostBreakdown = {
  sceneImagesUsd: number;
  footageUsd: number;
  footageCreditBased: boolean;
  ttsUsd: number;
  totalUsd: number;
};

/**
 * Estimate the non-token AI spend for a batch: 1 scene render per product +
 * footage at the selected quality for the duration + TTS if a voice is set.
 */
export function estimateMediaCost(opts: {
  productCount: number;
  quality: string;
  durationSec: number;
  engine: string;
  voiceProvider?: string | null;
  scriptChars?: number;
}): MediaCostBreakdown {
  const res = qualityToResolution(opts.quality);
  const engine = (opts.engine ?? "sora").toLowerCase();

  const sceneImagesUsd = opts.productCount * MEDIA_PRICING.sceneImageUsd;

  let footageUsd = 0;
  let footageCreditBased = false;
  if (engine === "veo") {
    footageUsd = opts.productCount * opts.durationSec * 0.2;
  } else if (engine === "sora") {
    footageCreditBased = true; // billed in OpenAI credits, no public $/s map
  } else {
    const rates = MEDIA_PRICING.providerFootagePerSec[engine] ?? MEDIA_PRICING.footagePerSec;
    footageUsd = opts.productCount * opts.durationSec * (rates[res] ?? rates["720p"] ?? 0.47);
  }

  const ttsPerChar = opts.voiceProvider ? (MEDIA_PRICING.ttsPerChar[opts.voiceProvider] ?? 0) : 0;
  const ttsUsd = opts.voiceProvider
    ? opts.productCount * ((opts.scriptChars ?? 200) * ttsPerChar)
    : 0;

  return {
    sceneImagesUsd,
    footageUsd,
    footageCreditBased,
    ttsUsd,
    totalUsd: sceneImagesUsd + footageUsd + ttsUsd,
  };
}

export type JobLike = {
  jobType: string | null;
  status: string | null;
  sceneImageUrl: string | null;
  footageUrl: string | null;
  voiceoverUrl: string | null;
  script: string | null;
  /** Footage duration in seconds (from job metadata when set). */
  durationSec?: number | null;
};

/**
 * Actual non-token media spend for a batch, computed from what the worker
 * already wrote: done jobs with a scene image = 1 render, done jobs with a
 * footage URL = the footage at the batch's quality/duration, done jobs with a
 * voiceover = TTS of the rendered script.
 */
export function actualMediaCost(opts: {
  jobs: JobLike[];
  quality: string;
  durationSec: number;
  engine: string;
  voiceProvider?: string | null;
}): MediaCostBreakdown {
  const res = qualityToResolution(opts.quality);
  const engine = (opts.engine ?? "sora").toLowerCase();

  const doneJobs = opts.jobs.filter((j) => j.status === "done");
  const sceneImagesUsd = doneJobs.filter((j) => j.sceneImageUrl).length * MEDIA_PRICING.sceneImageUsd;

  const footageJobs = doneJobs.filter((j) => j.footageUrl);
  let footageUsd = 0;
  let footageCreditBased = false;
  if (engine === "veo") {
    footageUsd = footageJobs.reduce(
      (sum, j) =>
        sum +
        (j.durationSec ?? opts.durationSec) *
          (MEDIA_PRICING.veoPerSec[res] ?? MEDIA_PRICING.veoPerSec["1080p"]),
      0
    );
  } else if (engine === "sora") {
    footageCreditBased = true;
  } else {
    footageUsd = footageJobs.reduce(
      (sum, j) => sum + (j.durationSec ?? opts.durationSec) * (MEDIA_PRICING.footagePerSec[res] ?? 0.47),
      0
    );
  }

  const ttsPerChar = opts.voiceProvider ? (MEDIA_PRICING.ttsPerChar[opts.voiceProvider] ?? 0) : 0;
  const ttsUsd = opts.voiceProvider
    ? doneJobs
        .filter((j) => j.voiceoverUrl && j.script)
        .reduce((sum, j) => sum + (j.script?.length ?? 0) * ttsPerChar, 0)
    : 0;

  return {
    sceneImagesUsd,
    footageUsd,
    footageCreditBased,
    ttsUsd,
    totalUsd: sceneImagesUsd + footageUsd + ttsUsd,
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatUsd(usd: number): string {
  if (!usd || usd < 0.0001) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
