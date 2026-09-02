# Text Overlay Editor (CapCut-style) — Feature Spec

**Target:** Symphony (Next.js 16, drizzle + Neon, Vercel + video-worker)
**Status:** spec (approved for spec — not yet started)
**Origin:** Justin: "our text overlay looks REALLY bad and is hard to use. CapCut makes it so easy to make a video, timeline, add text." Evaluated `github.com/ashreo/CapCutAPI` — **rejected** (see §5: it drives the CapCut *desktop app* via UI automation, requires a local CapCut install, no license on the fork, dormant since Aug 2025, ToS-risky in a paid SaaS — and it solves a render problem we don't have). We already burn text natively with ffmpeg drawtext; the gap is the **editor UX**.
**Decision authority:** Justin (merge approver). Build phases below are proposal, not commitment.

---

## 1. What we're building

A **CapCut-like text overlay composer** inside Symphony: users see their *actual video* in a 9:16 canvas, click to add text, drag it into place, style it, and set *when* it appears on a simple timeline. What the canvas shows is exactly what ffmpeg burns into the final video.

Two edits happen today via a clunky form + checkerboard canvas (screenshots Justin flagged):
- **Formula editor** (`video-studio/formulas/[id]`): a WYSIWYG drag canvas exists, but the underlay is a **gray checkerboard placeholder** — not the video. Hook presets + emoji + text lines are edited as a disconnected form list.
- **Products tab** ("add text to the videos"): only a plain `Text overlay (CTA)` input with `{product}` substitution — no preview, no position, no styling, no timing.

The composer replaces both surfaces with one shared component.

### Target UX (one screen)

```
┌─────────────────────────────┐
│  Video canvas (9:16)        │  ← actual product video playing
│                             │
│        🔥 BIG TEXT          │  ← drag to move
│      (selectable box)       │     pinch/edge = resize
│                             │
│        smaller line         │
└─────────────────────────────┘
  ┌──── timeline ──────────┐
  │ ▮▮ [Text 1 ▬▬] [T2 ▬] ▮│  ← clip duration; each text = a bar
  └────────────────────────┘     with start/end handles + playhead
  [+ Add text]  [font ▾][size ▾][color][outline/box][align]
```

Key behaviors (CapCut parity, nothing more):
1. **Click "+ Add text"** → new block centered, inline-edit mode, type to replace.
2. **Drag** any block on the video; **edge handle** resizes (reuse formula-editor math).
3. **Timeline bar** under the canvas: full clip duration; each text block is a horizontal segment with draggable start/end handles; **playhead** scrubs + plays the video; text blocks highlight on canvas only during their window. Default = full-clip.
4. **Style rail**: font family (existing 6), size, color, bg box + opacity, outline/plain/inverse treatment, align — all already modeled in `OverlayBox`.
5. **Hook presets stay**: the POV-Relief-Hook-style chips remain as one-click text fillers (differentiator; users still get a text line + treatment + emoji).
6. **Live proof**: when preview renders, the burned frames match the canvas (same math the worker already uses).

### Non-goals (parked)
- Multi-track audio/video timeline, keyframes, transitions (CapCut full editor) — overkill for CTA text.
- Exporting/importing CapCut drafts.
- Per-segment styling (font change mid-block) — v2 if asked.

---

## 2. What already exists (audit — reuse, don't rebuild)

| Piece | Where | State |
|---|---|---|
| `OverlayBox` model (x/y/fontColor/bgColor/bgOpacity/fontSize/fontFamily/treatment/textAlign/width/height) | `video-worker/src/processors/assemble.ts` §interface, mirrored in formula editor + Image Studio | Full WYSIWYG parity already |
| Drag + snap + resize canvas math | `formulas/[id]/page.tsx` (~833–963) | Solid, reuse as-is |
| **Video-underlay canvas** (`<video>` + draggable text) | `components/image-studio-tab.tsx` `OverlayEditor` (~930–1211) | Proves the pattern — extract to shared component |
| Style treatments + font stacks | formula editor state + `assemble.ts` `FONT_FILES` (6 TTFs in video-worker `/app/fonts`) | Worker already burns them |
| Burn path (multi-block, word-wrap, 1080×1920, drawtext, crf19) | `assemble.ts` ~136–266 | Production, verified |
| Layout sanitization (hex clamp, whitelist, never trust raw) | `api/batches/route.ts` `sanitizeOverlayBox` ~56–86 | Keep; extend for timing |
| Metadata plumbing formula→job→worker | `api/batches/route.ts` ~207–376 (overlayTemplate/blocks/fontSize/layout) | Works |
| Fonts / presets / emoji rows | formula editor | Keep |

**The one real gap in the render path:** the worker burns every text block for the **whole clip** — there is no start/end time per block, so a timeline editor has nothing to write to yet. That's a small, well-contained worker + sanitizer extension (§4).

---

## 3. Where the composer lives

**Primary: Formula editor** (`formulas/[id]`) — replace the checkerboard canvas underlay with the product video preview when one exists; keep checkerboard only when editing a brand-new formula with no footage attached yet (formula-level defaults).

**Secondary: Products tab run flow** — when a user picks products + formula and hits generate, the per-run overlay step uses the composer with the **actual first product's footage** as underlay. Per-run overrides already flow through `runOverlay*` in `/api/batches` — the composer writes into that channel.

**Shared component:** extract `OverlayComposer` (canvas + timeline + style rail) into `src/components/video/` used by both. Formula-editor canvas math moves in verbatim; Image Studio's `OverlayEditor` is refactored onto it (no behavior change there — regression-check Image Studio in the same E2E).

---

## 4. Data model + worker changes (the timing gap)

1. **`OverlayBox` gains optional timing:** `startSec?: number; endSec?: number` (default = full clip). DB column is already `jsonb` (`overlay_layout`) → **no migration**. Formula/run metadata passes through untouched keys.
2. **Sanitizer** (`batches/route.ts`): clamp `startSec/endSec` to `[0, clipDuration]`, drop blocks where `end <= start`.
3. **Worker** (`assemble.ts`): per block, if timing present, wrap the drawtext in `enable='between(t,{start},{end})'` (ffmpeg-native — one-line change per block). Clip duration comes from the same source the canvas timeline uses (`durationSec` on formula/run; the worker's existing duration detection as the real source of truth at burn time).
4. **Preview endpoint** (render/preview path): return `{durationSec, videoUrl}` so the composer can size its timeline and play real footage. Reuse whatever the current run-view preview uses for footage; if no video exists yet for a formula-level edit, canvas falls back to cover image / checkerboard with duration from `formula.durationSec`.

---

## 5. Why not CapCutAPI (the evaluated alternative)

| | CapCutAPI (ashreo fork) | In-house ffmpeg path |
|---|---|---|
| What it is | UI-automation driver for **CapCut desktop app** (`jianying_controller.py`, `jianying_ui_inspector.py`) | Native drawtext burn already in prod |
| Runtime | Needs CapCut installed (Win/macOS GUI, ~2GB) — **can't run in Linux video-worker** | Runs in existing worker |
| Health | 92★, **no license on fork**, last push **2025-08**, 0 issues | First-party |
| ToS | Reverse-engineering CapCut in a paid SaaS = ban + breakage risk on every CapCut update | Clean |
| Solves | Draft-file editing + desktop export — *not* our problem | — |
| Timeline UX | None (backend only — users never get CapCut's editor) | We build the editor |

It also doesn't touch the actual complaint: the **editor**, which CapCut's app provides and CapCutAPI doesn't.

---

## 6. Build phases (proposal — each independently shippable)

1. **P1 — Extract + wire the composer UI (no backend change):** shared `OverlayComposer` in formula editor with video underlay; timeline bar with per-block start/end handles + playhead; drag/resize/style all reused. Block timing stored in the editor state but worker ignores it yet (defaults full-clip → zero risk).
2. **P2 — Timing end-to-end:** sanitizer + worker `enable=between` + duration plumbing + preview endpoint returns duration. Render a test clip with two text blocks at different windows; verify burned frames at t0 / mid / end.
3. **P3 — Products tab run flow:** per-run composer step feeding `runOverlay*`, real product footage underlay, live canvas→burn parity check on a real product video.
4. **P4 — Image Studio refactor onto the shared component** (regression: existing Image Studio flows unchanged).

**Verification (E2E, staging first, per house rule):** formula with 2 timed text blocks → batch run → inspect output frames at t0/t2/t5 (text present only in its window), positions match canvas screenshot, colors/fonts match; then Products run flow same checks; then Image Studio regression.

**Cost floor:** $0 runtime (ffmpeg drawtext already paid for; no new keys, no external service). Effort: P1–P2 are the core (canvas reuse makes this mostly assembly + the timing extension); P3–P4 are integration passes. No migration, no new infra.
