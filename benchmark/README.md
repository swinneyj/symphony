# Symphony image-generation benchmark

This directory benchmarks the existing fal.ai Nano Banana 2 path beside the
official OpenAI Images API implementations for GPT-Image-2.5 Flare and
Sunburst. It does not change Symphony's production pipeline.

## What is included

- 30 neutral prompts across six categories in `prompts.json`
- generation and image-edit adapters for all three model configurations
- identical prompts and source fixtures by default; any provider-specific prompt
  is retained in both `prompt` and `providerPrompt`
- one JSONL record per attempt, a flattened CSV, saved output images, and a
  generated Markdown report
- actual OpenAI token-usage costing and request-level fal billing-event costing
- simulations for Nano → Flare, Nano → Flare → Sunburst (Sunburst restricted
  to edit/reference failures), and Flare → Sunburst

## Important quality-system finding

The repository does not contain the generated-image scoring/regeneration system
described in the brief. The only checked-in reusable function is
`src/lib/tiktok-shop.ts:calculateImageQuality`, which scores words in an image
URL and uses a strict `> 60` threshold in `src/services/image-regeneration.ts`.
It does not inspect image pixels and is not a valid standalone benchmark judge.

The harness calls that function and records its threshold for fidelity to current
code, but meaningful acceptance and the three specialist criteria must be added
to `reviews.jsonl` and applied with `--apply-reviews`. This avoids inventing a
new metric and makes the limitation visible in every record.

Review lines use this schema:

```json
{"attemptId":"UUID_FROM_RESULTS","symphonyQualityScore":84,"accepted":true,"criterionScores":{"referencePreservation":9,"textRendering":8,"editingAccuracy":9},"reviewer":"initials","reviewedAt":"2026-09-15T12:00:00Z"}
```

Use a consistent 0–100 overall score and 0–10 specialist scores. Record a
`rejectionReason` whenever `accepted` is false. Ideally, review blind to model
name and randomize image order outside the harness.

## Setup

1. Add the licensed fixtures described in `fixtures/README.md`.
2. Export `FAL_KEY` and `OPENAI_API_KEY`. Never place keys in this directory.
3. Run preflight:

```bash
npx tsx benchmark/run_benchmark.ts --validate
```

The default target is 2K: `2048x2048`, `2048x1152`, or `1152x2048`. fal uses
its 2K resolution with the closest matching supported aspect ratio. OpenAI uses
the exact requested dimensions with `high` quality. Override OpenAI quality only
when deliberately running a separately labeled experiment:

```bash
BENCHMARK_OPENAI_QUALITY=max npx tsx benchmark/run_benchmark.ts --test social-01-live-poster
```

### Bitwarden Secrets Manager deployment

The repository's worker deployment injects secrets with Bitwarden Secrets
Manager (`bws run`) rather than committing them to an env file. On the Oracle
worker, the binary is repo-local rather than globally installed. From the
deployed checkout (normally `/home/opc/symphony`), run:

```bash
cd /home/opc/symphony
./video-worker/.build-assets/bws run --project-id 74f0a638-b3d9-4878-989d-b491001819bb -- \
  npx tsx benchmark/run_benchmark.ts --validate
./video-worker/.build-assets/bws run --project-id 74f0a638-b3d9-4878-989d-b491001819bb -- \
  npx tsx benchmark/run_benchmark.ts
```

The Bitwarden secret names must be `OPENAI_API_KEY` and `FAL_KEY` for the
benchmark process. This is the same injection convention used by the existing
video, image, and ads workers. The current Docker images do contain `bws`, but
only copy production runtime files and do not include this benchmark directory;
run from the deployed checkout after these benchmark files have been pulled.
Do not put API keys in a shell profile or plaintext env file.

## Run

Full suite, one attempt per model/test (90 paid requests):

```bash
npx tsx benchmark/run_benchmark.ts
```

The repository also includes a manually triggered GitHub Actions workflow,
**Run image-generation benchmark**. Its default `generation-only` mode needs no
reference fixtures and reuses the existing Bitwarden GitHub secret. Select
`full` only after adding the licensed fixtures; each run is paid and uploads the
JSONL, CSV, report, and generated images as artifacts.

For local filtering without fixtures, use:

```bash
npx tsx benchmark/run_benchmark.ts --generation-only
```

Targeted smoke test:

```bash
npx tsx benchmark/run_benchmark.ts --test people-01-natural-creator
```

One model or category:

```bash
npx tsx benchmark/run_benchmark.ts --model gpt-image-2.5-flare
npx tsx benchmark/run_benchmark.ts --category social_graphics
```

Controlled regeneration (stops early only if the current scorer/review state
accepts an attempt):

```bash
npx tsx benchmark/run_benchmark.ts --max-attempts 2
```

Because the current URL heuristic normally scores generated local paths at 50,
do not run paid automatic retries until the real Symphony pixel evaluator is
available or reviews have been applied. A fair initial collection uses one
attempt per model, then reviews those outputs.

Apply reviews and regenerate CSV/report:

```bash
npx tsx benchmark/run_benchmark.ts --apply-reviews
npx tsx benchmark/run_benchmark.ts --report-only
```

## Cost accounting

OpenAI cost is computed exclusively from the `usage` object returned by each
GPT-Image-2.5 request:

- text input: $5.00 / 1M tokens; cached: $1.25 / 1M
- image input: $8.00 / 1M tokens; cached: $2.00 / 1M
- image output: $30.00 / 1M tokens

No GPT-Image-2 calculator estimate is used. A missing usage object fails the
attempt rather than substituting an estimate.

fal cost is fetched from `GET /v1/models/billing-events` by exact request ID.
The event's `cost_estimate_nano_usd` is treated as the request-level actual cost.
If billing propagation has not completed, the attempt is retained with
`costStatus: "pending"` and a null cost; do not make a final recommendation until
those records have been reconciled.

## Metric definitions

- first-pass acceptance = accepted retry-0 images / retry-0 successful tests
- average attempts per accepted image = successful attempts / distinct accepted tests
- effective cost per accepted image = total recorded generation cost / distinct accepted tests
- projections = effective cost per accepted image × 100, 1,000, or 10,000

API failures remain in JSONL/CSV but are excluded from generation-cost and
acceptance denominators. They remain visible for reliability analysis.

## Fairness and interpretation

- Prompts are neutral and sent unchanged unless `providerPrompts` explicitly
  records a transformation.
- The same fixtures are sent to every edit-capable model.
- The output dimensions are parsed from returned bytes, never assumed.
- Transparent-background support is requested for asset tests and should be
  checked during review.
- Hybrid figures are counterfactual simulations over matching test/model results;
  they do not make additional API calls.
- The three-tier strategy invokes Sunburst only for reference-preservation and
  image-editing failures, matching the requested routing policy. Flare-first →
  Sunburst falls back for any failed category.

## Current official references

- [OpenAI GPT-Image-2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
- [OpenAI GPT-Image-2.5 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
- [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [fal Nano Banana 2 API](https://fal.ai/models/fal-ai/nano-banana-2/api)
- [fal billing events API](https://fal.ai/docs/platform-apis/v1/models/billing-events)
