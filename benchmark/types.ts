export type BenchmarkCategory =
  | "photorealistic_people"
  | "reference_preservation"
  | "social_graphics"
  | "emotes_assets"
  | "complex_composition"
  | "image_editing";

export type Operation = "generation" | "edit";
export type ModelId =
  | "fal-ai/nano-banana-2"
  | "gpt-image-2.5-flare"
  | "gpt-image-2.5-sunburst";

export interface BenchmarkPrompt {
  id: string;
  category: BenchmarkCategory;
  operation: Operation;
  prompt: string;
  requestedResolution: string;
  aspectRatio: string;
  referenceImages?: string[];
  maskImage?: string;
  transparentBackground?: boolean;
  acceptanceThreshold?: number;
  notes?: string;
  providerPrompts?: Partial<Record<ModelId, string>>;
}

export interface UsageRecord {
  source: "openai_usage" | "fal_billing_event" | "unavailable";
  raw: unknown;
  textInputTokens?: number;
  cachedTextInputTokens?: number;
  imageInputTokens?: number;
  cachedImageInputTokens?: number;
  imageOutputTokens?: number;
  falOutputUnits?: number;
  falUnitPriceUsd?: number;
}

export interface CriterionScores {
  referencePreservation?: number;
  textRendering?: number;
  editingAccuracy?: number;
}

export interface AttemptRecord {
  schemaVersion: 1;
  runId: string;
  attemptId: string;
  model: ModelId;
  provider: "fal.ai" | "openai";
  testId: string;
  testCategory: BenchmarkCategory;
  prompt: string;
  providerPrompt: string;
  promptTransformed: boolean;
  operation: Operation;
  requestedResolution: string;
  actualOutputDimensions: string | null;
  startTime: string;
  endTime: string;
  latencyMs: number;
  apiSuccess: boolean;
  retryCount: number;
  requestId: string | null;
  usage: UsageRecord;
  calculatedApiCostUsd: number | null;
  costStatus: "actual" | "pending" | "unavailable";
  symphonyQualityScore: number | null;
  qualityScoreSource: string;
  acceptanceThreshold: number;
  accepted: boolean | null;
  rejectionReason: string | null;
  criterionScores: CriterionScores;
  outputPath: string | null;
  error: string | null;
}

export interface ProviderOutput {
  bytes: Buffer;
  extension: "png" | "webp" | "jpeg";
  requestId: string | null;
  usage: UsageRecord;
  costUsd: number | null;
  costStatus: AttemptRecord["costStatus"];
}

export interface ReviewRecord {
  attemptId: string;
  symphonyQualityScore?: number;
  accepted: boolean;
  rejectionReason?: string;
  criterionScores?: CriterionScores;
  reviewer?: string;
  reviewedAt?: string;
}
