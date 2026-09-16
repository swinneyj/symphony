# Symphony image-generation benchmark report

Status: **not yet run**

Generated from `results.jsonl`. Scores and acceptance must be reviewed in `reviews.jsonl` because Symphony's checked-in production scorer is only a URL-name heuristic. Cost metrics remain `n/a` if any successful attempt lacks actual request-level cost.

| Metric | Nano Banana 2 | GPT-Image-2.5 Flare | GPT-Image-2.5 Sunburst | Hybrid |
|---|---:|---:|---:|---:|
| Avg cost/attempt | n/a | n/a | n/a | n/a |
| First-pass acceptance | n/a | n/a | n/a | n/a |
| Avg attempts/accepted image | n/a | n/a | n/a | n/a |
| Effective cost/accepted image | n/a | n/a | n/a | n/a |
| Avg latency | n/a | n/a | n/a | n/a |
| Avg Symphony quality score | n/a | n/a | n/a | n/a |
| Reference preservation | n/a | n/a | n/a | n/a |
| Text rendering | n/a | n/a | n/a | n/a |
| Editing accuracy | n/a | n/a | n/a | n/a |

Hybrid above means Nano Banana → Flare → Sunburst for edit/reference failures. Flare → Sunburst fallback: n/a first-pass acceptance and n/a effective cost per accepted image. Nano Banana → Flare fallback: n/a first-pass acceptance and n/a effective cost per accepted image.

## Projected generation cost

| Strategy | 100 accepted | 1,000 accepted | 10,000 accepted |
|---|---:|---:|---:|
| Nano Banana 2 | n/a | n/a | n/a |
| GPT-Image-2.5 Flare | n/a | n/a | n/a |
| GPT-Image-2.5 Sunburst | n/a | n/a | n/a |
| Hybrid: Nano → Flare → Sunburst for edit/reference | n/a | n/a | n/a |
| Hybrid: Flare → Sunburst | n/a | n/a | n/a |
| Hybrid: Nano → Flare | n/a | n/a | n/a |

## Recommendation

No recommendation yet. API keys and licensed reference fixtures are required for a measured run.
