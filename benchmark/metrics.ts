import type { AttemptRecord, CriterionScores, ModelId } from "./types";

export interface SummaryRow {
  label: string;
  attempts: number;
  acceptedImages: number;
  avgCostPerAttempt: number | null;
  firstPassAcceptanceRate: number | null;
  averageAttemptsPerAcceptedImage: number | null;
  effectiveCostPerAcceptedImage: number | null;
  averageLatencyMs: number | null;
  averageQualityScore: number | null;
  criterionScores: CriterionScores;
  projectedCosts: Record<"100" | "1000" | "10000", number | null>;
}

const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

function criterionMean(records: AttemptRecord[], key: keyof CriterionScores) {
  return mean(records.map((record) => record.criterionScores[key]).filter((v): v is number => typeof v === "number"));
}

export function summarize(label: string, records: AttemptRecord[]): SummaryRow {
  const successful = records.filter((record) => record.apiSuccess);
  const acceptedTestIds = new Set(successful.filter((record) => record.accepted).map((record) => record.testId));
  const firstAttempts = records.filter((record) => record.retryCount === 0);
  const firstAccepted = firstAttempts.filter((record) => record.accepted).length;
  const costsComplete = successful.every((record) => record.costStatus === "actual" && typeof record.calculatedApiCostUsd === "number");
  const costs = costsComplete
    ? successful.map((record) => record.calculatedApiCostUsd as number)
    : [];
  const totalCost = sum(costs);
  const accepted = acceptedTestIds.size;
  const effective = accepted ? totalCost / accepted : null;
  return {
    label,
    attempts: successful.length,
    acceptedImages: accepted,
    avgCostPerAttempt: costs.length ? totalCost / costs.length : null,
    firstPassAcceptanceRate: firstAttempts.length ? firstAccepted / firstAttempts.length : null,
    averageAttemptsPerAcceptedImage: accepted ? records.length / accepted : null,
    effectiveCostPerAcceptedImage: effective,
    averageLatencyMs: mean(successful.map((record) => record.latencyMs)),
    averageQualityScore: mean(successful.map((record) => record.symphonyQualityScore).filter((v): v is number => typeof v === "number")),
    criterionScores: {
      referencePreservation: criterionMean(successful, "referencePreservation") ?? undefined,
      textRendering: criterionMean(successful, "textRendering") ?? undefined,
      editingAccuracy: criterionMean(successful, "editingAccuracy") ?? undefined,
    },
    projectedCosts: {
      "100": effective === null ? null : effective * 100,
      "1000": effective === null ? null : effective * 1_000,
      "10000": effective === null ? null : effective * 10_000,
    },
  };
}

function bestAttempt(records: AttemptRecord[], testId: string, model: ModelId) {
  return records
    .filter((record) => record.testId === testId && record.model === model && record.apiSuccess)
    .sort((a, b) => a.retryCount - b.retryCount)
    .find((record) => record.accepted) ?? null;
}

export function simulateRoute(
  label: string,
  records: AttemptRecord[],
  stages: Array<{ model: ModelId; onlyCategories?: Set<string> }>,
): SummaryRow {
  const tests = [...new Set(records.map((record) => record.testId))];
  const routed: AttemptRecord[] = [];
  for (const testId of tests) {
    const category = records.find((record) => record.testId === testId)?.testCategory;
    for (const stage of stages) {
      if (stage.onlyCategories && (!category || !stage.onlyCategories.has(category))) continue;
      const attempts = records
        .filter((record) => record.testId === testId && record.model === stage.model)
        .sort((a, b) => a.retryCount - b.retryCount);
      routed.push(...attempts);
      if (bestAttempt(attempts, testId, stage.model)) break;
    }
  }
  const summary = summarize(label, routed);
  const firstStage = stages[0];
  const eligibleTests = tests.filter((testId) => {
    if (!firstStage.onlyCategories) return true;
    const category = records.find((record) => record.testId === testId)?.testCategory;
    return Boolean(category && firstStage.onlyCategories.has(category));
  });
  summary.firstPassAcceptanceRate = eligibleTests.length
    ? eligibleTests.filter((testId) => records.some((record) =>
      record.testId === testId && record.model === firstStage.model && record.retryCount === 0 && record.apiSuccess && record.accepted
    )).length / eligibleTests.length
    : null;
  return summary;
}

export function allSummaries(records: AttemptRecord[]) {
  const editCategories = new Set(["reference_preservation", "image_editing"]);
  return [
    summarize("Nano Banana 2", records.filter((r) => r.model === "fal-ai/nano-banana-2")),
    summarize("GPT-Image-2.5 Flare", records.filter((r) => r.model === "gpt-image-2.5-flare")),
    summarize("GPT-Image-2.5 Sunburst", records.filter((r) => r.model === "gpt-image-2.5-sunburst")),
    simulateRoute("Hybrid: Nano → Flare → Sunburst for edit/reference", records, [
      { model: "fal-ai/nano-banana-2" },
      { model: "gpt-image-2.5-flare" },
      { model: "gpt-image-2.5-sunburst", onlyCategories: editCategories },
    ]),
    simulateRoute("Hybrid: Flare → Sunburst", records, [
      { model: "gpt-image-2.5-flare" },
      { model: "gpt-image-2.5-sunburst" },
    ]),
    simulateRoute("Hybrid: Nano → Flare", records, [
      { model: "fal-ai/nano-banana-2" },
      { model: "gpt-image-2.5-flare" },
    ]),
  ];
}
