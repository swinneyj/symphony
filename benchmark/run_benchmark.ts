#!/usr/bin/env tsx
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runFal } from "./adapters/fal";
import { runOpenAI } from "./adapters/openai";
import { dimensions } from "./image-utils";
import { allSummaries } from "./metrics";
import { scoreWithExistingSymphonySystem, DEFAULT_ACCEPTANCE_THRESHOLD } from "./quality-adapter";
import type { AttemptRecord, BenchmarkPrompt, ModelId, ReviewRecord } from "./types";

const benchmarkDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(benchmarkDir, "..");
const promptsPath = resolve(benchmarkDir, "prompts.json");
const resultsPath = resolve(benchmarkDir, "results.jsonl");
const csvPath = resolve(benchmarkDir, "results.csv");
const reportPath = resolve(benchmarkDir, "report.md");
const reviewsPath = resolve(benchmarkDir, "reviews.jsonl");
const outputDir = resolve(benchmarkDir, "results");
const models: ModelId[] = ["fal-ai/nano-banana-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"];

function args() {
  const values = process.argv.slice(2);
  const get = (name: string) => {
    const index = values.indexOf(name);
    return index >= 0 ? values[index + 1] : undefined;
  };
  return {
    validate: values.includes("--validate"),
    dryRun: values.includes("--dry-run"),
    reportOnly: values.includes("--report-only"),
    applyReviews: values.includes("--apply-reviews"),
    generationOnly: values.includes("--generation-only"),
    model: get("--model") as ModelId | undefined,
    category: get("--category"),
    testId: get("--test"),
    maxAttempts: Math.max(1, Number(get("--max-attempts") ?? "1")),
  };
}

async function readJsonl<T>(path: string): Promise<T[]> {
  try {
    return (await readFile(path, "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function validate(prompts: BenchmarkPrompt[], selectedModels: ModelId[]) {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const prompt of prompts) {
    if (ids.has(prompt.id)) errors.push(`Duplicate prompt id: ${prompt.id}`);
    ids.add(prompt.id);
    if (prompt.operation === "edit" && !prompt.referenceImages?.length) errors.push(`${prompt.id}: edit has no referenceImages`);
    for (const path of [...(prompt.referenceImages ?? []), ...(prompt.maskImage ? [prompt.maskImage] : [])]) {
      try { await stat(resolve(repoRoot, path)); } catch { errors.push(`${prompt.id}: missing fixture ${path}`); }
    }
  }
  if (selectedModels.includes("fal-ai/nano-banana-2") && !process.env.FAL_KEY) errors.push("FAL_KEY is not set");
  if (selectedModels.some((m) => m.startsWith("gpt-image")) && !process.env.OPENAI_API_KEY) errors.push("OPENAI_API_KEY is not set");
  return errors;
}

const escapeCsv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

async function writeOutputs(records: AttemptRecord[]) {
  const headers: Array<keyof AttemptRecord> = [
    "runId", "attemptId", "model", "provider", "testId", "testCategory", "prompt", "providerPrompt",
    "promptTransformed", "operation", "requestedResolution", "actualOutputDimensions", "startTime", "endTime",
    "latencyMs", "apiSuccess", "retryCount", "requestId", "calculatedApiCostUsd", "costStatus",
    "symphonyQualityScore", "qualityScoreSource", "acceptanceThreshold", "accepted", "rejectionReason", "outputPath", "error",
  ];
  const csv = [headers.join(","), ...records.map((r) => headers.map((h) => escapeCsv(r[h])).join(","))].join("\n") + "\n";
  await writeFile(csvPath, csv);
  const summaries = allSummaries(records);
  const f = (n: number | null, kind: "money" | "percent" | "number" = "number") => {
    if (n === null || !Number.isFinite(n)) return "n/a";
    if (kind === "money") return `$${n.toFixed(4)}`;
    if (kind === "percent") return `${(n * 100).toFixed(1)}%`;
    return n.toFixed(2);
  };
  const primary = summaries.slice(0, 4);
  const cell = (index: number, value: (s: (typeof summaries)[number]) => string) => value(primary[index]);
  const metricRows = [
    ["Avg cost/attempt", (s: (typeof summaries)[number]) => f(s.avgCostPerAttempt, "money")],
    ["First-pass acceptance", (s: (typeof summaries)[number]) => f(s.firstPassAcceptanceRate, "percent")],
    ["Avg attempts/accepted image", (s: (typeof summaries)[number]) => f(s.averageAttemptsPerAcceptedImage)],
    ["Effective cost/accepted image", (s: (typeof summaries)[number]) => f(s.effectiveCostPerAcceptedImage, "money")],
    ["Avg latency", (s: (typeof summaries)[number]) => s.averageLatencyMs === null ? "n/a" : `${f(s.averageLatencyMs / 1000)}s`],
    ["Avg Symphony quality score", (s: (typeof summaries)[number]) => f(s.averageQualityScore)],
    ["Reference preservation", (s: (typeof summaries)[number]) => f(s.criterionScores.referencePreservation ?? null)],
    ["Text rendering", (s: (typeof summaries)[number]) => f(s.criterionScores.textRendering ?? null)],
    ["Editing accuracy", (s: (typeof summaries)[number]) => f(s.criterionScores.editingAccuracy ?? null)],
  ] as const;
  const rows = metricRows.map(([name, value]) => `| ${name} | ${cell(0, value)} | ${cell(1, value)} | ${cell(2, value)} | ${cell(3, value)} |`).join("\n");
  const projections = summaries.map((s) => `| ${s.label} | ${f(s.projectedCosts["100"], "money")} | ${f(s.projectedCosts["1000"], "money")} | ${f(s.projectedCosts["10000"], "money")} |`).join("\n");
  const measured = records.length > 0;
  const flareFirst = summaries[4];
  const nanoFlare = summaries[5];
  const recommendationMap: Record<string, string> = {
    "Nano Banana 2": "Keep Nano Banana 2",
    "GPT-Image-2.5 Flare": "Switch default generation to Flare",
    "GPT-Image-2.5 Sunburst": "Switch to OpenAI entirely",
    "Hybrid: Nano → Flare → Sunburst for edit/reference": "Use three-tier Nano Banana → Flare → Sunburst routing",
    "Hybrid: Flare → Sunburst": "Use Flare → Sunburst fallback",
    "Hybrid: Nano → Flare": "Use Nano Banana → Flare fallback",
  };
  const candidates = summaries
    .filter((summary) => summary.effectiveCostPerAcceptedImage !== null)
    .sort((a, b) => (a.effectiveCostPerAcceptedImage as number) - (b.effectiveCostPerAcceptedImage as number));
  const recommendation = candidates[0]
    ? `${recommendationMap[candidates[0].label]}. It has the lowest measured effective cost per accepted image (${f(candidates[0].effectiveCostPerAcceptedImage, "money")}). Confirm the specialist criterion scores are acceptable before changing production routing.`
    : measured
      ? "No recommendation yet. Apply reviews, obtain at least one accepted image per candidate, and reconcile all pending costs."
      : "No recommendation yet. API keys and licensed reference fixtures are required for a measured run.";
  await writeFile(reportPath, `# Symphony image-generation benchmark report\n\nStatus: **${measured ? "results available" : "not yet run"}**\n\nGenerated from \`results.jsonl\`. Scores and acceptance must be reviewed in \`reviews.jsonl\` because Symphony's checked-in production scorer is only a URL-name heuristic. Cost metrics remain \`n/a\` if any successful attempt lacks actual request-level cost.\n\n| Metric | Nano Banana 2 | GPT-Image-2.5 Flare | GPT-Image-2.5 Sunburst | Hybrid |\n|---|---:|---:|---:|---:|\n${rows}\n\nHybrid above means Nano Banana → Flare → Sunburst for edit/reference failures. Flare → Sunburst fallback: ${f(flareFirst.firstPassAcceptanceRate, "percent")} first-pass acceptance and ${f(flareFirst.effectiveCostPerAcceptedImage, "money")} effective cost per accepted image. Nano Banana → Flare fallback: ${f(nanoFlare.firstPassAcceptanceRate, "percent")} first-pass acceptance and ${f(nanoFlare.effectiveCostPerAcceptedImage, "money")} effective cost per accepted image.\n\n## Projected generation cost\n\n| Strategy | 100 accepted | 1,000 accepted | 10,000 accepted |\n|---|---:|---:|---:|\n${projections}\n\n## Recommendation\n\n${recommendation}\n`);
}

async function applyReviews() {
  const records = await readJsonl<AttemptRecord>(resultsPath);
  const reviews = await readJsonl<ReviewRecord>(reviewsPath);
  const byId = new Map(reviews.map((review) => [review.attemptId, review]));
  for (const record of records) {
    const review = byId.get(record.attemptId);
    if (!review) continue;
    record.symphonyQualityScore = review.symphonyQualityScore ?? record.symphonyQualityScore;
    record.accepted = review.accepted;
    record.rejectionReason = review.accepted ? null : review.rejectionReason ?? "Rejected by reviewer";
    record.criterionScores = { ...record.criterionScores, ...review.criterionScores };
    record.qualityScoreSource = review.symphonyQualityScore === undefined ? "review acceptance override" : "review override";
  }
  await writeFile(resultsPath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""));
  await writeOutputs(records);
  console.log(`Applied ${reviews.length} reviews to ${records.length} records.`);
}

async function main() {
  const options = args();
  await mkdir(outputDir, { recursive: true });
  const prompts = JSON.parse(await readFile(promptsPath, "utf8")) as BenchmarkPrompt[];
  const selectedModels = options.model ? [options.model] : models;
  const selectedPrompts = prompts.filter((p) => (!options.category || p.category === options.category) && (!options.testId || p.id === options.testId) && (!options.generationOnly || p.operation === "generation"));
  if (options.applyReviews) return applyReviews();
  if (options.reportOnly) return writeOutputs(await readJsonl<AttemptRecord>(resultsPath));
  const errors = await validate(selectedPrompts, selectedModels);
  if (prompts.length < 25 || prompts.length > 50) errors.unshift(`Expected 25–50 prompts in the suite; found ${prompts.length}`);
  if (options.validate || options.dryRun) {
    console.log(`Prompts: ${selectedPrompts.length}; models: ${selectedModels.join(", ")}`);
    if (errors.length) console.log(errors.map((e) => `- ${e}`).join("\n"));
    else console.log("Validation passed.");
    if (options.validate || options.dryRun) return;
  }
  if (errors.length) throw new Error(`Preflight failed:\n${errors.map((e) => `- ${e}`).join("\n")}`);
  const runId = `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
  for (const test of selectedPrompts) {
    for (const model of selectedModels) {
      for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
        const attemptId = randomUUID();
        const provider = model === "fal-ai/nano-banana-2" ? "fal.ai" : "openai";
        const providerPrompt = test.providerPrompts?.[model] ?? test.prompt;
        const start = new Date();
        let record: AttemptRecord;
        try {
          const output = model === "fal-ai/nano-banana-2"
            ? await runFal(test, providerPrompt, repoRoot)
            : await runOpenAI(model, test, providerPrompt, repoRoot);
          const end = new Date();
          const file = resolve(outputDir, `${test.id}__${model.replaceAll("/", "_")}__${attempt}.${output.extension}`);
          await writeFile(file, output.bytes);
          const size = dimensions(output.bytes);
          const quality = scoreWithExistingSymphonySystem(file, test);
          record = {
            schemaVersion: 1, runId, attemptId, model, provider, testId: test.id, testCategory: test.category,
            prompt: test.prompt, providerPrompt, promptTransformed: providerPrompt !== test.prompt, operation: test.operation,
            requestedResolution: test.requestedResolution, actualOutputDimensions: size ? `${size.width}x${size.height}` : null,
            startTime: start.toISOString(), endTime: end.toISOString(), latencyMs: end.getTime() - start.getTime(), apiSuccess: true,
            retryCount: attempt, requestId: output.requestId, usage: output.usage, calculatedApiCostUsd: output.costUsd,
            costStatus: output.costStatus, symphonyQualityScore: quality.score, qualityScoreSource: quality.source,
            acceptanceThreshold: quality.threshold, accepted: quality.accepted, rejectionReason: quality.rejectionReason,
            criterionScores: {}, outputPath: relative(repoRoot, file), error: null,
          };
        } catch (error) {
          const end = new Date();
          record = {
            schemaVersion: 1, runId, attemptId, model, provider, testId: test.id, testCategory: test.category,
            prompt: test.prompt, providerPrompt, promptTransformed: providerPrompt !== test.prompt, operation: test.operation,
            requestedResolution: test.requestedResolution, actualOutputDimensions: null, startTime: start.toISOString(), endTime: end.toISOString(),
            latencyMs: end.getTime() - start.getTime(), apiSuccess: false, retryCount: attempt, requestId: null,
            usage: { source: "unavailable", raw: null }, calculatedApiCostUsd: null, costStatus: "unavailable",
            symphonyQualityScore: null, qualityScoreSource: "not scored", acceptanceThreshold: test.acceptanceThreshold ?? DEFAULT_ACCEPTANCE_THRESHOLD,
            accepted: false, rejectionReason: "API failure", criterionScores: {}, outputPath: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        await appendFile(resultsPath, `${JSON.stringify(record)}\n`);
        console.log(`${record.apiSuccess ? "done" : "failed"} ${test.id} ${model} attempt=${attempt + 1}`);
        if (record.accepted) break;
      }
    }
  }
  await writeOutputs(await readJsonl<AttemptRecord>(resultsPath));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
