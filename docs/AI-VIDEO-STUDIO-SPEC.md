# AI Video Studio — Full Implementation Spec

**Target:** Symphony (Next.js 16, drizzle + Neon, Vercel)
**Goal:** Replicate BatchBot's entire feature set (TikTok Shop + regular content) in-house, with the one thing BatchBot lacks: auto-publishing through Symphony's approved TikTok Content Posting API.
**Decision authority:** Hermes (per Slippaz: "you decide" on providers).

---

## 1. Provider decision (the call)

| Priority | Engine | Why | Access |
|---|---|---|---|
| **Primary** | **Sora 2 (OpenAI API)** | Exact engine BatchBot uses (their site: "✨ AI · Sora 2"). Proven for Shop product footage. First-frame = real product photo → compliance-safe (video matches listing). `openai` SDK **already in package.json** (^6.48.0). Resolution tiers map 1:1 to BatchBot's quality tiers. | `OPENAI_API_KEY` |
| **Secondary** | **Seedance (ByteDance, via fal.ai)** | This is **Higgsfield's underlying engine** — "Higgsfield quality" without Higgsfield's subscription. Often cheaper per video at high res, excellent product motion. | `FAL_KEY` |
| **Evaluated** | **Veo (Gemini API)** | Google's top-tier video model. **Decision rule (Slippaz, goal = highest quality):** side-by-side benchmark at Phase 3 kickoff — one product, one prompt, Sora 2 vs Veo vs Seedance, 6s clips, Slippaz picks the winner by eye. Winner becomes default; provider layer keeps the rest as fallback. Caveat: consumer Gemini subscription ≠ API quota. | `GEMINI_API_KEY` |
| **Fallback** | **Kling 2.x (via fal.ai)** | Best realism-per-dollar for some product categories; fallback when others queue-saturated. | `FAL_KEY` |
| **Do NOT** | Higgsfield subscription | Their moat = consumer UI + preset R&D + community, not raw capability. Paying per-video through them adds a middleman margin. | — |

**What we take from Higgsfield:** the **Viral Presets concept** (ORBIT 360, FLOAT SPIN, EARTH ZOOM, CARD BOARD CUTOUT, SELFIE TWIN, ICE STATUE…). These are camera-move/motion prompt templates — fully replicable as prompt presets in our Formula engine. Their "Supercomputer" LLM layer = prompt/script enhancement, replaceable with our existing cheap LLM provider.

**Provider abstraction** (`src/lib/video/providers/`): one interface (`generateFootage({ imageUrl, prompt, duration, resolution })`), four adapters (veo, seedance, sora, kling). Per-workspace default engine + per-batch override. Fallback chain on 429/queue-full.

---

## 2. Architecture

```
Vercel (UI + API + DB writes)          VPS Docker worker (heavy lifting)
┌──────────────────────────┐           ┌──────────────────────────────┐
│ /video-studio UI         │           │ video-worker (Node, poller)  │
│ /api/products/*          │  jobs     │  - calls Sora/Seedance/Kling │
│ /api/formulas/*          │ ────────► │  - FFmpeg: assemble, overlay │
│ /api/video/batches/*     │  table    │  - rembg: bg removal         │
│ /api/video/webhook       │ ◄──────── │  - uploads → Vercel Blob    │
│ posts + scheduler (existing)         │  - updates job rows          │
└──────────────────────────┘           └──────────────────────────────┘
```

**Why a worker:** Vercel serverless has **no FFmpeg binary** and 10-min function limits. Video assembly (concat, overlay, 9:16 encode, silence-cut) is pure FFmpeg. A small Node container on the existing VPS (`/home/opc/docker/…` pattern) polls the job table, does the work, writes results. Zero new infra cost, matches the "durable, zero-maintenance" preference. Worker needs `DATABASE_URL` (Neon) + provider keys; it can use `neon-http` directly (no transaction dependency).

**Known codebase constraints honored:**
- `neon-http` has **no `db.transaction()`** → batch creation = sequential inserts (pattern from `/api/workspaces/route.ts`).
- Existing `/api/upload` writes to `/tmp` (ephemeral on Vercel) → **product images & outputs must go to Vercel Blob** (`@vercel/blob` already installed); worker uploads results, API stores returned URL.
- Existing `/api/ai/generate` is **template-based, not LLM** → formula engine adds the real LLM layer (script fill from product description).
- New route group `(dashboard)/video-studio` must be added to middleware protection list.

---

## 3. Data model (drizzle additions, `src/db/schema.ts`)

```ts
products: {
  id, workspaceId, name, description, price, currency,
  originalImageUrl,          // imported / uploaded
  processedImageUrl,         // bg-removed, 9:16 (worker output)
  sourceType,                // manual | link | tiktok_showcase
  sourceUrl, tiktokProductId,
  status,                    // raw | processing | ready | failed
  metadata,                  // jsonb: original page data, og tags
  createdAt, updatedAt
}

videoFormulas: {
  id, workspaceId?,          // null = system/global template
  name, category,            // furniture, home, beauty, tech, generic…
  scriptTemplate,            // "I just saw the same {product} at the store…"
  scenePromptTemplate,       // "cinematic {category} scene, warm light…"
  motionPreset,              // orbit360 | floatSpin | earthZoom | none…
  voiceId, durationSec, quality, isSystem
}

voices: { id, workspaceId?, name, provider, providerVoiceId, isCloned, sampleUrl }

videoBatches: {
  id, workspaceId, name, formulaId, voiceId, quality,
  status,                    // queued | running | done | partial | failed
  totalCount, completedCount, failedCount,
  provider,                  // engine used for this batch
  createdAt
}

videoBatchJobs: {
  id, batchId, productId, formulaId,
  status,                    // queued | footage | voiceover | assembling | done | failed | cancelled
  footageUrl, voiceoverUrl, finalUrl, thumbnailUrl,
  script,                    // rendered script text (audit + compliance)
  error, retries, createdAt, updatedAt
}
```

---

## 4. Feature-by-feature (BatchBot parity)

### 4.1 Product Library
- **Import by link** (Amazon / TikTok Shop / any og-tag page): POST `/api/products/import` { url } → fetch page → parse `og:title`, `og:image`, `og:description`, price selector (Amazon: `#corePrice_feature_div` / JSON-LD; TikTok Shop: product JSON in page). US-region caveat per BatchBot.
- **Showcase import** by TikTok username: scrape public shop page (`tiktok.com/@user/shop`), paginate products, upsert. *Fragile — scrape may break; manual + link import are the reliable fallback.*
- **Manual**: upload image + name + price + description.
- **Processing job** (worker): `rembg` background removal → center-crop/pad to 9:16 → `processedImageUrl`. Status per product; retry on failure.
- Media asset: also write a `media_assets` row so outputs appear in existing Media library.

### 4.2 Formulas (the "algorithm")
- Script templates with placeholders: `{product}`, `{price}`, `{category}`, `{features}`, `{store}`.
- Seed with the proven BatchBot structure (from the creator's video):
  > "I just saw the same {product} at the store, but I found mine on TikTok Shop. Let me show you. {2–3 features}. Tap the orange cart to check it out."
  Plus variants: price-drop hook ("This was double the price at the store"), feature-led, comparison, "massive sale" urgency.
- `{features}` filled by LLM from the product description (2–3 short selling points, ≤8 words each — keeps VO under duration budget). LLM = existing provider (DeepSeek/OpenAI key), pennies per script.
- **Scene prompts**: preset library ("Patio scene", "Modern farmhouse kitchen", "Bedroom flat lay", "Tech desk setup"…) + custom prompt field.
- **Motion presets** (Higgsfield ports): `orbit360`, `floatSpin`, `earthZoom`, `cardboardCutout`, `iceStatue`, `elevate`, `blueDepth` → each maps to a camera-move sentence appended to the scene prompt + provider-specific control params where supported (Seedance motion options; Sora camera control if available).
- **Formula builder UI**: name, category, script template editor with live preview (pick a product → see rendered script), scene preset picker, motion preset, voice, duration (4/6/8/12s), quality.

### 4.3 AI Footage (image-to-video)
- Input: `processedImageUrl` as first frame (compliance-safe: the actual product).
- Provider adapter call → video URL. Quality tiers map: `fast` 480p·4s · `standard` 720p·6-8s · `pro` 1080p·8-12s · `max` 2K·10-12s.
- Refund-on-failure semantics: job `failed` + retry ≤3 with alternate provider → if all fail, mark batch job failed (credits concept optional; log cost).

### 4.4 Voiceover
- Providers: **ElevenLabs** (voice clone — the "Reese" play; sample upload → cloned voice) or **OpenAI TTS** (cheap, decent) or **local Kokoro** (free, zero-latency, good for MVP volume).
- **AI editor** (filler/stumble/dead-air removal): two modes —
  1. *Prevent*: render script through LLM as clean VO copy (no fillers exist), TTS reads it straight. Free, always on.
  2. *Cleanup* (for user-recorded clips): Whisper word-level timestamps → drop segments flagged as fillers (`um`, `uh`, `like`) and silences >400ms → FFmpeg concat. Worker job type.
- Pacing: TTS speed + pause insertion between script sentences (SSML) so 2-3 features fit the chosen duration.

### 4.5 Overlay Studio (BatchBot's 50-clips-at-once)
- Upload up to 50 clips → FFmpeg loop: `overlay` product PNG (bottom-left, w/ rounded mask) + `drawtext` price/CTA banner + optional "50% OFF" sticker → same encode profile. No AI, no credits, near-zero cost. This is pure FFmpeg filter graphs — worker job type `overlay`.

### 4.6 Batch Generation
- POST `/api/video/batches` { productIds[], formulaId, voiceId, quality, provider } → create batch row + N job rows (sequential inserts!) → worker picks up.
- Worker concurrency 3–5; per-job pipeline: script render → VO → footage → assemble (footage + VO + overlay + trending audio bed + end-CTA card) → encode 1080×1920 H.264/AAC 30fps → upload to Blob → update job + batch progress.
- Progress polling: GET `/api/video/batches/[id]` (counts + per-job status); UI shows live grid; failed jobs get per-job retry/cancel.

### 4.7 Slideshow Agent ("turn a prompt into a slideshow")
- LLM: prompt → 5–8 slide plan (scene list + per-slide caption). Images: image-gen model via fal (Flux/Seedream, ~$0.02–0.06/img) or stock fallback. Mix in user's own images. Worker: Ken Burns (zoompan) + crossfade (xfade) + VO + music → 9:16 export.

### 4.8 Export & Publish (the moat)
- All outputs: 1080×1920, H.264, AAC, 30fps — ready for TikTok.
- **Auto-publish**: batch job `done` → offers "Send to Composer" (media asset + rendered script as caption draft) or direct **schedule** → existing `posts` + `postPlatformStatus` + TikTok Content Posting API (Direct Post) pipeline. 10 videos/day, hourly slots = the creator's exact playbook, fully automated.
- **Shop tagging caveat (honest):** the TikTok Content Posting API posts the video but product tagging (orange cart) is a Shop-side action — BatchBot doesn't do it either (creator tags in-app). MVP: post via Symphony, tag in app (10s). If we later want auto-tagging, it's Seller Center API territory — separate approval, note for Phase 6.

### 4.9 Compliance playbook (encode as guardrails, not docs)
- Footage must start from the **actual product image** (first frame = truth → appeals win).
- Script must not claim attributes absent from the listing (LLM feature-fill constrained to description content).
- Posting rule: only publish jobs whose product matches the listing exactly — enforced by construction (job links productId; posts carry productId in `platformConfigs` metadata).
- Violation handling: log "inconsistent product promotion" flags in a `compliance_events` table (Phase 6) with appeal-draft generator (LLM fills product-match evidence).

---

## 5. Cost model (self-build vs BatchBot, 300 videos/mo)

| Line | BatchBot Max | Self-build |
|---|---|---|
| Subscription | $99/mo (125 vids incl.) | — |
| Refills @ $0.50/vid (300 vids) | ~$87 | — |
| Sora 2 API, 480–720p, 4–8s | — | ~$12–36 |
| Seedance/Kling alternate engine | — | ~$15–50 |
| TTS (ElevenLabs Creator / OpenAI) | — | $5–22 |
| LLM scripts (DeepSeek) | — | ~$2 |
| rembg + FFmpeg + worker | — | $0 (existing VPS) |
| **Total** | **~$186/mo** | **~$20–60/mo** |

≈ **3–9× cheaper**, owns the pipeline, and adds auto-posting BatchBot fundamentally lacks.

---

## 6. API routes & pages

**New API routes** (all auth-guarded, workspace-scoped, mirror existing patterns):
- `/api/products` GET/POST · `/api/products/[id]` PATCH/DELETE · `/api/products/import` POST (link/showcase) · `/api/products/[id]/process` POST (re-run bg removal)
- `/api/formulas` GET/POST · `/api/formulas/[id]` PATCH/DELETE
- `/api/voices` GET/POST
- `/api/video/batches` POST · `/api/video/batches/[id]` GET · `/api/video/jobs/[id]` GET/POST (retry/cancel)
- `/api/video/overlay` POST · `/api/video/slideshow` POST
- `/api/video/webhook` POST (worker → status sync; or worker writes DB directly — preferred, fewer moving parts)

**New page:** `(dashboard)/video-studio` with tabs: **Products** (grid, import, process status) · **Formulas** (builder + presets) · **Batch Studio** (select products × formula → queue, live progress) · **Overlay** · **Slideshow** · **Jobs/History**. Add to middleware route protection. Nav entry in dashboard sidebar.

---

## 7. Worker spec (`video-worker`, Docker on VPS)

- Node 20 + `fluent-ffmpeg` (static ffmpeg binary in image) + `@rembg` (or rembg python sidecar) + provider SDKs.
- Poll `video_batch_jobs` (`status='queued'`) every 5s, concurrency 3–5, per-job state machine (footage → voiceover → assemble → upload → done).
- Env: `DATABASE_URL`, `OPENAI_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`, `BLOB_READ_WRITE_TOKEN` (Vercel Blob), `WORKER_CONCURRENCY`.
- Idempotency: job `updatedAt` heartbeat; crash recovery = jobs stuck in running >15min reset to queued with retry++.
- Health: `/healthz` + simple log tail (matches existing watchdog patterns).

---

## 8. Phased roadmap

| Phase | Scope | Est. |
|---|---|---|
| **1** | DB schema + products (import/process) + worker skeleton + Blob | 3–4 days |
| **2** | Formulas (templates + LLM fill + presets) + voices (ElevenLabs clone) | 2–3 days |
| **3** | AI footage adapters (Sora 2 → Seedance → Kling) + batch queue + progress UI | 3–4 days |
| **4** | Overlay Studio + assembler/encode + slideshow agent | 2–3 days |
| **5** | Publish wiring (Composer/scheduler + TikTok direct post) + compliance guardrails | 2–3 days |
| **6** | Credits/usage metering, compliance_events + appeal drafts, multi-engine auto-fallback tuning | later |

**Phases 1–5 ≈ 2–3 weeks** at the established pace. Each phase = feature branch → PR → preview → **merge only on Justin's approval** (per workflow).

---

## 9. What I need from you

1. **API keys** (set as Vercel env + worker env — you do Vercel env per your lane): `OPENAI_API_KEY` (exists for Sora?), `FAL_KEY`, `ELEVENLABS_API_KEY` (optional), Blob token exists?
2. **Worker host:** green light to add a `video-worker` container on the VPS docker host.
3. **Voice reference:** want the "Reese"-style clone, or start with stock voices?
4. **Go/no-go on Phase 1** (schema + products + worker skeleton) → feature branch `feature/video-studio`.
