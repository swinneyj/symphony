import OpenAI from "openai";

/**
 * Shared LLM client + model selection for the app layer.
 *
 * Provider priority per model:
 *  - `gemini-*` → GEMINI_API_KEY (OpenAI-compatible endpoint)
 *  - `deepseek-chat` → DEEPSEEK_API_KEY
 *  - `gpt-*` → OPENAI_API_KEY
 *
 * Call sites use `withLLM(task, fn)` which walks a fallback chain so a quota
 * 429 on one model degrades to the next instead of erroring to the user.
 */

export type LLMTask = "remix" | "agent" | "fill";

/**
 * Fallback chains, best-first. Gemini Pro tier is preferred for creative
 * tasks but requires pro-tier quota on the key (preview models 429 on
 * flash-only keys) — hence the chain. Order matters, keep it cheap.
 */
const LLM_CHAIN: Record<LLMTask, string[]> = {
  remix: ["gemini-3.1-pro-preview", "gemini-3.6-flash", "deepseek-chat", "gpt-4o-mini"],
  agent: ["gemini-3.1-pro-preview", "gemini-3.6-flash", "deepseek-chat", "gpt-4o-mini"],
  fill: ["gemini-3.6-flash", "deepseek-chat", "gpt-4o-mini"],
};

function clientForModel(model: string): OpenAI | null {
  if (model.startsWith("gemini")) {
    return process.env.GEMINI_API_KEY
      ? new OpenAI({
          apiKey: process.env.GEMINI_API_KEY,
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        })
      : null;
  }
  if (model === "deepseek-chat") {
    return process.env.DEEPSEEK_API_KEY
      ? new OpenAI({
          apiKey: process.env.DEEPSEEK_API_KEY,
          baseURL: "https://api.deepseek.com",
        })
      : null;
  }
  return process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
}

function isRetryable(err: unknown): boolean {
  // 429 (quota/rate) and 5xx (transient) → try the next model in the chain.
  const status = (err as { status?: number })?.status;
  return status === 429 || (status !== undefined && status >= 500);
}

/**
 * Runs `fn` against each model in the task's chain until one succeeds.
 * Returns the first successful result, or null if every model failed.
 * The client + model are passed so call sites keep their own request shape.
 */
export async function withLLM<T>(
  task: LLMTask,
  fn: (client: OpenAI, model: string) => Promise<T>
): Promise<T | null> {
  for (const model of LLM_CHAIN[task]) {
    const client = clientForModel(model);
    if (!client) continue; // key for this provider not configured
    try {
      return await fn(client, model);
    } catch (err) {
      const status = (err as { status?: number })?.status ?? "?";
      console.warn(`[llm] ${model} failed (${status}) — ${isRetryable(err) ? "next in chain" : "not retryable"}`);
      if (!isRetryable(err)) return null; // auth/validation error won't fix itself down-chain
    }
  }
  return null;
}

/** Best available model for a task (first entry whose key is configured). */
export function llmModel(task: LLMTask): string {
  for (const model of LLM_CHAIN[task]) {
    if (clientForModel(model)) return model;
  }
  return "gpt-4o-mini";
}
