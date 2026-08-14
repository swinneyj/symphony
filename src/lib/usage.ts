import { llmModel, type LLMTask } from "@/lib/llm";
import { db } from "@/db";
import { llmUsage } from "@/db/schema";
import {
  MODEL_PRICING,
  MEDIA_PRICING,
  CHAIN_FIRST,
  countTokens,
  countMessagesTokens,
  providerForModel,
  costFromUsage,
  qualityToResolution,
  estimateMediaCost,
  actualMediaCost,
  formatUsd,
  formatTokens,
  type ChatMessage,
  type CostEstimate,
  type ApiUsage,
  type MediaCostBreakdown,
  type JobLike,
} from "./usage-core";

// Re-export the pure core so server routes get everything in one import.
export {
  MODEL_PRICING,
  MEDIA_PRICING,
  CHAIN_FIRST,
  countTokens,
  countMessagesTokens,
  providerForModel,
  costFromUsage,
  qualityToResolution,
  estimateMediaCost,
  actualMediaCost,
  formatUsd,
  formatTokens,
  type ChatMessage,
  type CostEstimate,
  type ApiUsage,
  type MediaCostBreakdown,
  type JobLike,
};

/**
 * Estimate BEFORE a call, priced at the model the chain would pick TODAY
 * (server-side: env keys are readable here). The actual call may fall back to
 * a cheaper model, so treat this as an upper-ish projection.
 */
export function estimateChatCost(
  task: LLMTask,
  messages: ChatMessage[],
  opts: { maxOutputTokens?: number; model?: string } = {}
): CostEstimate {
  const model = opts.model ?? llmModel(task);
  const price = MODEL_PRICING[model] ?? { input: 0.3, output: 1.5, cacheRead: 0.03 };
  const inputTokens = countMessagesTokens(messages);
  const outputTokens = opts.maxOutputTokens ?? 200;
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return { model, provider: providerForModel(model), inputTokens, outputTokens, costUsd };
}

export type UsageContext = {
  workspaceId: string;
  createdById: string;
  /** Which product surface made the call: "remix" | "agent" | "fill". */
  surface: "remix" | "agent" | "fill";
  /** Where to attach the actual (for rollups): "ad_source" | "formula" | "batch" | "job". */
  entityType?: "ad_source" | "formula" | "batch" | "job";
  entityId?: string;
};

/**
 * Persist one real LLM call (fires after the API response with `usage`).
 * Never throws — usage tracking must not break the feature that triggered it.
 * Returns the costed actual, or null when the response carried no usage.
 */
export async function recordLlmUsage(
  ctx: UsageContext,
  model: string,
  usage: ApiUsage | undefined | null,
  estimate?: CostEstimate | null
): Promise<{ inputTokens: number; outputTokens: number; costUsd: number } | null> {
  if (!usage?.prompt_tokens && !usage?.completion_tokens) return null;
  const actual = costFromUsage(model, usage);
  try {
    await db.insert(llmUsage).values({
      workspaceId: ctx.workspaceId,
      createdById: ctx.createdById,
      surface: ctx.surface,
      entityType: ctx.entityType ?? null,
      entityId: ctx.entityId ?? null,
      model,
      provider: providerForModel(model),
      inputTokens: actual.inputTokens,
      outputTokens: actual.outputTokens,
      cacheReadTokens: actual.cacheReadTokens,
      costUsd: String(actual.costUsd),
      estimatedInputTokens: estimate?.inputTokens ?? null,
      estimatedOutputTokens: estimate?.outputTokens ?? null,
      estimatedCostUsd: estimate ? String(estimate.costUsd) : null,
    });
  } catch (error) {
    console.error("[usage] failed to record LLM usage:", error);
  }
  return actual;
}
