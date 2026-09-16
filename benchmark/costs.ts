import type { UsageRecord } from "./types";

// Official GPT Image 2.5 rates, checked 2026-09-15. Rates are per 1M tokens.
export const OPENAI_IMAGE_25_RATES = {
  textInput: 5,
  cachedTextInput: 1.25,
  imageInput: 8,
  cachedImageInput: 2,
  imageOutput: 30,
} as const;

function numberAt(value: unknown, paths: string[][]): number {
  for (const path of paths) {
    let cursor: unknown = value;
    for (const key of path) {
      if (!cursor || typeof cursor !== "object") { cursor = undefined; break; }
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (typeof cursor === "number" && Number.isFinite(cursor)) return cursor;
  }
  return 0;
}

export function normalizeOpenAIUsage(raw: unknown): UsageRecord {
  const textInput = numberAt(raw, [["input_tokens_details", "text_tokens"]]);
  const imageInput = numberAt(raw, [["input_tokens_details", "image_tokens"]]);
  const cachedText = numberAt(raw, [
    ["input_tokens_details", "cached_text_tokens"],
    ["input_tokens_details", "cached_tokens_details", "text_tokens"],
  ]);
  const cachedImage = numberAt(raw, [
    ["input_tokens_details", "cached_image_tokens"],
    ["input_tokens_details", "cached_tokens_details", "image_tokens"],
  ]);
  const imageOutput = numberAt(raw, [
    ["output_tokens_details", "image_tokens"],
    ["output_tokens"],
  ]);
  return {
    source: "openai_usage",
    raw,
    textInputTokens: textInput,
    cachedTextInputTokens: cachedText,
    imageInputTokens: imageInput,
    cachedImageInputTokens: cachedImage,
    imageOutputTokens: imageOutput,
  };
}

export function openAICost(usage: UsageRecord): number {
  const uncachedText = Math.max(0, (usage.textInputTokens ?? 0) - (usage.cachedTextInputTokens ?? 0));
  const uncachedImage = Math.max(0, (usage.imageInputTokens ?? 0) - (usage.cachedImageInputTokens ?? 0));
  return (
    uncachedText * OPENAI_IMAGE_25_RATES.textInput +
    (usage.cachedTextInputTokens ?? 0) * OPENAI_IMAGE_25_RATES.cachedTextInput +
    uncachedImage * OPENAI_IMAGE_25_RATES.imageInput +
    (usage.cachedImageInputTokens ?? 0) * OPENAI_IMAGE_25_RATES.cachedImageInput +
    (usage.imageOutputTokens ?? 0) * OPENAI_IMAGE_25_RATES.imageOutput
  ) / 1_000_000;
}
