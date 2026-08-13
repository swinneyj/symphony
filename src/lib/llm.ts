import OpenAI from "openai";

/**
 * Shared LLM client + model selection for the app layer.
 *
 * Provider priority:
 *  1. Gemini (GEMINI_API_KEY) — OpenAI-compatible endpoint, no SDK change
 *  2. DeepSeek (DEEPSEEK_API_KEY)
 *  3. OpenAI (OPENAI_API_KEY)
 *
 * The Gemini key already exists in BWS (the video-worker uses it for scene
 * images + Veo); adding it to Vercel env promotes Gemini to primary for the
 * LLM call sites below without any other change.
 */

export type LLMTask = "remix" | "agent" | "fill";

export function getClient(): OpenAI | null {
  if (process.env.GEMINI_API_KEY) {
    return new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return null;
}

/**
 * Model per task, honoring the same provider priority as getClient().
 * - remix/agent (creative, quality-sensitive): Gemini 3.1 Pro
 * - fill (high-volume, low-stakes): Gemini 3.6 Flash (cheap tier)
 * Model IDs verified against the live Gemini API (2026-08-13).
 */
export function llmModel(task: LLMTask): string {
  if (process.env.GEMINI_API_KEY) {
    return task === "fill" ? "gemini-3.6-flash" : "gemini-3.1-pro-preview";
  }
  if (process.env.DEEPSEEK_API_KEY) return "deepseek-chat";
  return "gpt-4o-mini";
}
