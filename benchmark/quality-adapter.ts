import { calculateImageQuality } from "../src/lib/tiktok-shop";
import type { BenchmarkPrompt } from "./types";

export const DEFAULT_ACCEPTANCE_THRESHOLD = 60;

/**
 * Adapter over Symphony's only existing image-quality function.
 * Important: calculateImageQuality scores URL/path words, not image pixels. It is
 * retained for fidelity to production, but human/real evaluator reviews should
 * override this value before decisions are made.
 */
export function scoreWithExistingSymphonySystem(outputPath: string, test: BenchmarkPrompt) {
  const score = calculateImageQuality(outputPath);
  const threshold = test.acceptanceThreshold ?? DEFAULT_ACCEPTANCE_THRESHOLD;
  return {
    score,
    threshold,
    accepted: score > threshold,
    source: "src/lib/tiktok-shop.calculateImageQuality (URL heuristic)",
    rejectionReason: score > threshold ? null : `Symphony URL heuristic score ${score} did not exceed ${threshold}`,
  };
}
