# V2V Video Clone — Feature Spec

**Target:** Symphony (Next.js 16, drizzle + Neon, Vercel)
**Status:** backlog (parked — not started)
**Origin:** Justin flagged a competitor demo (nych.ai promo video, ~10:06): upload a source video → prompt a background change → pick a model → get a cloned video (same subject, new scene). Question asked: is this in Symphony? Answer: no — Steal This Ad remixes scripts, not pixels. This spec is the gap-closer.
**Decision authority:** Hermes (per Slippaz), verify prices at build time.

---

## 1. What we're building

A **video-to-video (V2V) edit** feature in Video Studio:

- **Input:** a source video (upload or pasted URL, same intake as Steal This Ad) + an edit prompt (see prompt scope below) + a **model/avatar picker** (which provider + tier to run the edit).
- **Output:** a transformed video preserving the subject/motion of the source with the requested scene change, rendered into the existing **Post Queue** (preview, download, schedule, publish — all already built).

**Prompt scope (parity with the nych.ai demo, per Justin):** the edit prompt must be able to:
1. **Change the background** (e.g. "move them to a neon nightclub", "rooftop at sunset")
2. **Change the text on screen** — burned-in captions/watermarks/price tags from the original replaced (this is the harder ask: text regions must be detected + inpainted + re-rendered; some V2V APIs handle it in one pass, others need a region pass — verification item at kickoff)
3. Anything else the reference tool does with a single prompt (scene, style, lighting, clothing)

Deliberately NOT: script remixing (that's Steal This Ad), text-to-video from scratch (that's the formula/Sora pipeline). This is the third leg: **edit the pixels of an existing video**.

## 2. Provider options (honest cost floors — verify at build)

| Priority | Engine | Why | Access | Est. cost |
|---|---|---|---|---|
| **Primary** | **Sora 2 (OpenAI API)** | Already our render provider (`provider: "sora"` in batches, openai SDK in package.json). **Surface verified live 2026-08-13** (see below). | `OPENAI_API_KEY` (exists) | credit-based per video-second; verify current rate before committing |
| **Secondary** | **Kling video editing (via fal.ai)** | The strongest V2V bg-swap/character-edit capability on the market (likely what the demo tool wraps). fal adapter pattern already exists for image workers. | `FAL_KEY` (new) | ~$0.10–0.60 per 5s by tier; verify |
| **Evaluated** | **Veo 2 edits (Gemini API)** | Video-to-video editing via `veo` edit endpoint. Only if Sora/Kling under-deliver; adds third key. | `GEMINI_API_KEY` | similar per-second class; verify |
| **Do NOT** | Runway/Act-Two | High quality but premium pricing + no existing integration. Revisit only if quality gap matters to Slippaz. | — | $0.50+/5s class |

**Model picker semantics:** the picker selects (a) provider and (b) edit "strength"/tier (standard vs pro) — NOT a face/character library. Character-preservation is a property of the edit model, not a picker setting; if the demo tool offers avatar presets, that's a follow-up (see open questions).

## 3. Architecture (reuse, don't build)

```
Vercel (UI + API)                        VPS video-worker (existing container)
┌────────────────────────────┐           ┌──────────────────────────────────┐
│ /video-studio → "Clone" tab│           │ new jobType: "v2v-edit"          │
│ /api/video-clone (POST)    │  jobs     │  - fetch source (existing intake)│
│  - upload/URL → Blob       │ ────────► │  - call provider edit endpoint   │
│  - insert batch+job row    │  table    │  - FFmpeg: 9:16 reframe, overlay │
│  - same rows as batches    │ ◄──────── │  - upload result → Blob          │
│ Post Queue (existing)      │           │  - update job row                │
└────────────────────────────┘           └──────────────────────────────────┘
```

- **New route:** `POST /api/video-clone` — mirrors `steal/[id]/remix/[remixId]/render`: creates a `videoBatches` row (jobType `v2v-edit`) with `metadata: { sourceUrl, editPrompt, provider, tier }`. Reuses workspace access + product-less path (clone doesn't need a product).
- **Worker:** extend the existing video-worker poller with a `v2v-edit` job handler (same pattern as `footage`). Provider adapters added to `src/lib/video/providers/` (sora-edit, kling-edit).
- **UI:** "Clone" tab in Video Studio — source drop/URL, prompt textarea, model picker (provider × tier), Generate → job row → Post Queue.
- **Storage:** source + output on Vercel Blob (existing pattern). No new infra, no new container.

## 4. Acceptance criteria

1. Upload/paste a source video → clone job renders a transformed video that preserves the subject and applies the prompted background change (Slippaz QA by eye, same as formula benchmarks).
2. **On-screen text:** when the source has burned-in captions/watermarks and the prompt requests a change, the output must show the NEW text cleanly (no ghosted old text) — QA one real example with text before kickoff marks this done.
3. Result lands in Post Queue with preview/download/share (`/f/[id]`) like every other render.
4. Model picker switches provider/tier per job; failed jobs surface the provider error, not a silent stall.
5. Cost per job logged on the batch row (provider, seconds, est. $) — no surprise spend.

## 4b. Sora editing surface — VERIFIED live 2026-08-13

Probed against the live API with the production key. The SDK (`openai@6.48`) is **stale on video editing** — the master OpenAPI spec + live endpoints disagree with it. Ground truth:

| Endpoint | Method | Body | Status |
|---|---|---|---|
| `/v1/videos/characters` | POST | multipart `{ name, video: <mp4, must be `video/mp4` mimetype> }` → character id (async ingest, minutes) | ✅ live (mimetype-validated; `application/octet-stream` rejected) |
| `/v1/videos/edits` | POST | JSON `{ video: { id }, prompt }` — id = completed video | ✅ live (JSON form); multipart `video` field **rejected** (`Unknown parameter: 'video'`) |
| `/v1/videos/{id}/remix` | POST | JSON `{ prompt }` — remix a completed video | ✅ live |
| `/v1/videos` | POST | JSON/multipart `{ prompt, input_reference: { image_url | file_id }, seconds, size }` | ⚠️ `input_reference` **rejects raw file uploads** (expects object); image refs only |
| `/v1/files` | POST | upload mp4 | ❌ rejected — mp4 not in accepted formats for vision/assistants purposes |

**Implications for the build:**
- **Uploaded source videos enter Sora via `createCharacter`** (the only mp4 upload path) → returned id feeds `/videos/edits` (or remix). The character is ALSO the "model picker" asset: upload once, reuse across jobs. Name it from the source (e.g. `steal-<adSourceId>`).
- **Fast path for our own renders:** Steal-This-Ad/Sora outputs already have video ids → `edits`/`remix` directly, no upload round-trip.
- Files API is a dead end for video; do NOT design around it.
- SDK mismatch: the worker already calls raw `fetch` for Sora — keep that pattern (do not use `client.videos.edit`, it sends the wrong field).

## 4c. Kling/fal surface — VERIFIED live 2026-08-13 (and a landmine)

fal.ai queue accepts **any** `fal-ai/<path>` submission and fails at run time with `Path ... not found` — so "submitted OK" means nothing. Real ids were harvested from fal's explore page ("Copy" buttons) + validation-error probing:

| fal model id | Status | Notes |
|---|---|---|
| `fal-ai/kling-video/v3/pro/image-to-video` | ✅ REAL | schema: `start_image_url` (required) + `prompt` + ... — validated via pydantic error |
| `fal-ai/kling-video/v3/standard/image-to-video` | ✅ REAL | |
| `fal-ai/kling-video/v3/pro/text-to-video`, `/standard/text-to-video` | ✅ REAL | |
| `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` | ✅ REAL | |
| `fal-ai/kling-video/v2.5/image-to-video` (worker's configured path) | ❌ **FAKE** | `Path not found` — **the worker's Kling engine has never actually run** |
| `fal-ai/byte-dance/seedance/v1.5-alpha/image-to-video` (worker's path) | ❌ **FAKE** | `Application "byte-dance" not found` — same |
| `fal-ai/kling-video/v3/*/video-edit|editing|v2v` | ❌ FAKE | **No Kling video-edit model on fal** |

**Landmine:** the video-worker's `seedance`/`kling` engines are dead config — every non-Sora batch must have silently failed or been routed elsewhere. Audit + fix (or remove) in a separate pass; do NOT rely on them.

## 4d. PIPELINE DECISION (Hermes, per delegated provider authority)

**Pipeline A — Frame-Edit → Re-Animate (PRIMARY, zero new vendor).** This is what the nych.ai demo actually does under the hood, and it's fully buildable on current keys:
1. ffmpeg → extract key frame from source video
2. Image edit on the frame — `fal-ai/nano-banana-pro/edit` (typography-capable) or `openai/gpt-image-2/edit`: "change background to X, replace on-screen text with Y, keep the subject"
3. Animate the edited frame — `fal-ai/kling-video/v3/pro/image-to-video` (`start_image_url` + motion prompt)
- Cost floor: ~$0.02–0.05 image edit + ~$0.10–0.40 Kling 5s (verify at first run) ≈ **$0.15–0.50/clone** — vs nych.ai's $39/mo credit packs. No new keys.
- **VERIFIED LIVE 2026-08-13** end-to-end in the worker (`v2v_edit` jobType): testsrc source → neon-nightclub scene with "BUY NOW" on-screen text change, 5s clip, ~$0.30-ish, job landed on Blob. Production worker rebuilt + claims v2v_edit.
- **QA PASSED on a REAL video 2026-08-13:** a Sora product render (Barebells can in a kitchen) → "neon-lit nightclub counter, purple/pink lighting" — product label preserved, scene swapped cleanly, ~$0.30. The Clone tab + `/api/video-clone` are live in the repo (needs Vercel redeploy to surface).
- **MODEL PICKER:** Clone tab has a model select — Kling 3.0 Pro/Standard, Sora 2, and Veo 3.1 via fal.ai. Veo uses the shared `FAL_KEY` path.
- **FAL CREDITS:** fal.ai billing is active again. Seedance 2.5 is enabled in the worker; Kling Pro/Standard and nano-banana edit use the same fal.ai account. Sora remains independent on OpenAI billing.
- **Robustness:** all worker fal/sora/veo fetches now carry `AbortSignal.timeout` (30s submit/poll, 60s result) — a stalled connection previously hung a job forever (that's what froze the first Sora verification run).

**Pipeline B — Sora edit/remix (BONUS, for our own renders).** Store the Sora `video_` id on batch/job rows at render time → `POST /videos/edits {video:{id},prompt}` or `/videos/{id}/remix` for bg/angle changes on Steal-This-Ad outputs. Zero upload cost.

**Pipeline C — Kling native editing API (EVALUATED).** True V2V (temporal consistency) via api.klingai.com `/v1/videos/edits`. Needs `KLING_API_KEY` (new vendor). Revisit ONLY if Slippaz finds A's motion fidelity lacking.

## 5. Open questions (parked until kickoff)

- **Rights/ToS:** cloning a *third-party* creator's video and re-posting is ToS-gray (same bucket as the dropped session-draft bridge). Default stance: allow **own uploads** + Steal-This-Ad sources (already-downloaded ads), warn UI-side on pasted third-party URLs. Confirm with Slippaz.
- **Avatar presets:** if the demo's "model picker" turns out to be face/avatar selection (not provider/tier), that's a separate face-consent feature — do NOT build until clarified.
- **Duration cap:** source length limit (e.g. ≤15s) to bound cost per job.

## 6. Sequencing

- [ ] Verify Sora editing API surface + pricing (openai SDK `videos.edit` or equivalent) — 1 session
- [ ] Worker `v2v-edit` jobType + sora-edit adapter — 1 session
- [ ] `/api/video-clone` + Clone tab UI — 1 session
- [ ] Kling fallback adapter (fal.ai) only if Sora quality flops
- [ ] Slippaz QA + cost check → then flip out of backlog
