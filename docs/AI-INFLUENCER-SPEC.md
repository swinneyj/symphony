# AI Influencer Studio (Personas) — Feature Spec

**Target:** Symphony (Next.js 16, drizzle + Neon, Vercel app + VPS video-worker)
**Status:** spec (not started)
**Origin:** Slippaz flagged Osher's video "How I Recreate Viral TikTok Shop Videos With AI in Minutes" (youtube GPLWmbzS4zo): the workflow is a persistent **AI model influencer** presenting products UGC-style for TikTok Shop. Asked: where does this land in Symphony? Answer: the render machinery already exists (Image Studio product→scene→video, Clone tab V2V, Steal This Ad URL→remix, voices with cloning, Post Queue → TT Shop publish). What does NOT exist is the **reusable identity layer** — a saved persona (face refs + voice + style) that persists across videos. This spec closes that gap (Phase 1). Talking-head/lip-sync rendering is Phase 2 (parked — provider probe required).
**Decision authority:** Hermes (per Slippaz), verify prices at build time.

---

## 1. What we're building (Phase 1 — the Persona Bank)

A **Personas** feature in Video Studio:

- **Create an AI influencer**: upload 3–5 face photos OR generate a consistent face with Nano Banana from a text description ("female UGC creator, early 30s, warm smile, bright kitchen"). Attach a voice (reuse the existing `voices` table — incl. cloned voices), plus a style/persona prompt.
- **Reuse it across videos**: formulas gain a `personaId`; `{persona}` becomes a fill variable in scripts/scene prompts; scene renders can reference the persona's face as a second input image so the "model" appears *in* the frame holding/presenting the product.
- **One-click content**: product + persona + UGC formula → batch → Post Queue → publish with TT Shop product link (existing paths).

Deliberately NOT in Phase 1: talking-head lip-sync renders (Phase 2, needs provider probe), face-swap onto existing footage (that's Clone tab territory; persona refs make it possible later).

## 2. Schema (no enum change needed — key decision)

New table `personas` (mirror `voices`/`videoFormulas` conventions — `workspaceId` null = system persona):

| column | type | notes |
|---|---|---|
| id | uuid pk | defaultRandom |
| workspaceId | uuid FK→workspaces (cascade) | null = system persona |
| createdById | text FK→users | notNull |
| name | text | notNull |
| description | text | who they are / vibe |
| faceImageUrl | text | primary ref (Blob) |
| faceRefUrls | jsonb | 3–5 refs for consistency |
| voiceId | uuid FK→voices (set null) | reuses cloned voice infra |
| personaPrompt | text | appearance/style, injected into scene prompts |
| isSystem | boolean default false | seed personas visible to all workspaces |
| createdAt / updatedAt | timestamp | defaultNow |

Plus **two FK columns** on existing tables (drizzle migrations, same pattern as `voiceId`):
- `video_formulas.personaId` uuid FK→personas (set null) — formula-level default persona
- `video_batches.personaId` uuid FK→personas (set null) — batch-level override

No `video_job_type` enum change in Phase 1: persona threading flows through the **existing** `scene_render` / `footage` / voiceover jobs — persona refs ride in `video_batch_jobs.metadata`, the scene image persists the identity into footage, and voiceover already resolves `voiceId`.

## 3. API routes (mirror the products pattern)

- `POST /api/personas` — multipart: name, description, personaPrompt, voiceId, faceImage (upload) | `generate:true` (Nano Banana), faceRefs[]
- `GET /api/personas` — workspace + system personas (auth + membership)
- `PATCH /api/personas/[id]` / `DELETE /api/personas/[id]` — workspace ownership check
- `POST /api/personas/generate-face` — text description → 3–5 Nano Banana images → Blob → returns URLs (costs ~$0.04–0.08/img, billed to `media` cost tracking)

Blob storage + asset serving: reuse the **Image Studio proxy pattern** (`/api/image-studio/jobs/[jobId]/asset` — private Blob needs the authenticated proxy + Range/206 for video; images just need the proxy). Face refs are images only in Phase 1.

## 4. Formula / batch threading (the integration)

The Clone tab's 4-layer pitfall applies: any new option must thread **UI → API → worker → provider** or it silently no-ops.

1. **Fill variables** — extend `script-fill.ts` + `video-worker/src/prompt.ts fillPlaceholders()`: add `{persona}` → persona name ("Hi, I'm Alex…"), `{personaStyle}` → personaPrompt. Script/scene templates already templated; this is one more key in the fill map. `overlayTemplate` gains `{persona}` too.
2. **Scene render** — `providers.ts generateSceneImage(SceneRenderRequest)` gains optional `personaRefs?: string[]`. Prompt assembly: `buildScenePrompt()` appends personaPrompt; the Nano Banana edit call takes product image + persona face ref(s) as multi-image input (same call shape as `generateCloneFrameEdit`). Processor `scene-render.ts` reads `job.metadata.personaRefs` + `personaPrompt`.
3. **Voice** — batch executor resolves `voiceId = batch.personaId ? persona.voiceId ?? formula.voiceId : formula.voiceId` (persona voice wins if set).
4. **Footage/assembly** — unchanged: i2v uses the scene image (identity baked in), overlay burns CTA.
5. **Batch creation route** — `POST /api/batches` accepts `personaId`; per-job metadata carries `{ personaId, personaRefs, personaPrompt }`.

## 5. UI — Personas tab

- New `TabsTrigger value="personas"` in `video-studio/page.tsx` (next to voices/batches), component `PersonasTab` (pattern: `ImageStudioTab`, `CloneTab`).
- **Grid** of persona cards: face image, name, voice badge, formula count. **Create dialog**: name/describe → [Upload photos] or [✨ Generate face with AI] (preview refs, regenerate button) → voice picker (reuse voices tab data, incl. cloned) → style prompt.
- **Formula editor**: persona picker beside the voice picker; batch run view shows persona chip.
- **Quick action** on persona card: "Create video" → product picker → default UGC formula → batch → Post Queue (the 3-click "make content" path).

## 6. Seed content

- 2 system personas ("everyday UGC creator — woman, 30s, kitchen", "fitness influencer — man, 40s, gym") with AI-generated faces — demonstrates the feature on first open.
- 2 system UGC formulas with `{persona}` in script + scene templates: "Persona testimonial", "Persona + product demo" (`sourceFrame: render`, overlay with `{product}`/`{price}`).

## 7. Cost floors (honest — verify at build)

| item | est. | notes |
|---|---|---|
| Face generation | ~$0.25–0.50 / persona | 3–5 × Nano Banana $0.04–0.08 |
| Voice clone | $0–1 | existing voices feature (ElevenLabs ~$1 one-time, kokoro $0 path) |
| Per-video with persona | **unchanged** | scene img $0.04 + footage $/s (Kling $0.07–0.112/s, Sora credits) + TTS per char — persona is $0 marginal |
| New subscriptions | **none** | reuses FAL/GEMINI/OPENAI keys in place |

## 8. Acceptance criteria / QA

- Create persona via AI face generation → formula with persona → batch → final video where the scene includes the persona and the VO uses the persona's voice.
- Identity consistency: 2+ videos from the same persona are recognizably the same model.
- System personas visible across workspaces; workspace personas isolated.
- Cost rollup: persona face generation appears in the run's est/actual panel (existing `llm_usage` + media cost pattern).
- QA on staging with a real render, then visual QA on **all** affected views (per Slippaz's defect rule: batches view, formula run view, personas tab, queue).

## 9. Sequencing

| M | scope | effort |
|---|---|---|
| M1 | schema + migration + personas CRUD routes | S (products pattern) |
| M2 | generate-face route + Blob proxy for refs | S–M |
| M3 | fill vars + scene-render persona refs (worker + providers) | M (4-layer threading) |
| M4 | Personas tab + formula picker + quick action | M |
| M5 | seed personas/formulas + staging QA | S |

Phase 1 is shippable in **M1–M5, no new provider spend**. Phase 2 (talking head) is a separate spec gated on a free fal/Veo probe.

## 10. Open questions

- **AI disclosure**: TikTok requires labeling AI-generated content — confirm where the label lands in the publish flow (prevention at source, per Slippaz's preference).
- **Face likeness rights**: personas are generated (not real people) in Phase 1 — no consent surface needed; document it.
- **Phase 2 probe**: fal Kling avatar/lip-sync + Veo 3.1 talking head — free queue-probe pattern already in the skill.
