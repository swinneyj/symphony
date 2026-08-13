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
| **Primary** | **Sora 2 editing (OpenAI API)** | Already our render provider (`provider: "sora"` in batches, openai SDK in package.json). Sora's editing API accepts a source video + text edit. Zero new vendor, one key. | `OPENAI_API_KEY` (exists) | credit-based per video-second; verify current rate before committing |
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
