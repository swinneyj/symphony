import { createReadStream } from "node:fs";
import { blobToken } from "./env.js";

/**
 * Video generation providers. One interface, four engines.
 *
 * Dry-run mode (VIDEO_DRY_RUN=1) synthesizes a placeholder clip locally with
 * ffmpeg, so the ENTIRE pipeline is testable without any API keys.
 *
 * Real adapters are implemented as minimal REST clients. Endpoint/model
 * constants are marked TODO_VERIFY — they get confirmed against live keys at
 * Phase 3 kickoff (the one thing that needs a real call to pin down).
 */

export type Engine = "veo" | "seedance" | "sora" | "kling" | "kling_v1" | "kling_v3";

export interface FootageRequest {
  engine: Engine;
  imageUrl: string; // first-frame / product image
  prompt: string; // scene prompt
  durationSec: number;
  resolution: "480p" | "720p" | "1080p";
}

export interface FootageResult {
  url: string;
  engine: Engine;
  dryRun: boolean;
}

export class MissingKeyError extends Error {
  engine: Engine;
  keyName: string;
  constructor(engine: Engine, keyName: string) {
    super(`${engine} adapter: ${keyName} is not set in the worker env`);
    this.engine = engine;
    this.keyName = keyName;
  }
}

const DRY_RUN = ["1", "true"].includes((process.env.VIDEO_DRY_RUN ?? "").toLowerCase());

const KEY_BY_ENGINE: Record<Engine, string> = {
  veo: "FAL_KEY",
  seedance: "FAL_KEY",
  kling: "FAL_KEY",
  kling_v1: "FAL_KEY",
  kling_v3: "FAL_KEY",
  sora: "OPENAI_API_KEY",
};

const SIZE_BY_RESOLUTION: Record<FootageRequest["resolution"], string> = {
  "480p": "540x960",
  "720p": "720x1280",
  "1080p": "1080x1920",
};

function requireKey(engine: Engine): string {
  const name = KEY_BY_ENGINE[engine];
  const value = process.env[name];
  if (!value) throw new MissingKeyError(engine, name);
  return value;
}

/** Synthesizes a 9:16 placeholder clip with ffmpeg (testsrc pattern). */
export async function renderPlaceholder(
  durationSec: number,
  resolution: FootageRequest["resolution"],
  outPath: string
): Promise<void> {
  const size = SIZE_BY_RESOLUTION[resolution];
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "ffmpeg",
    [
      "-y", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=30`,
      "-f", "lavfi", "-i", "sine=frequency=440:duration=" + durationSec,
      "-t", String(durationSec), "-pix_fmt", "yuv420p", "-shortest", outPath,
    ],
    { stdio: "ignore", timeout: 60_000 }
  );
}

// ─── Engines ─────────────────────────────────────────────────────────────────

async function generateSora(req: FootageRequest): Promise<string> {
  const key = requireKey("sora");
  // Sora 2 API (verified against OpenAI docs Aug 2026):
  //   POST /v1/videos { prompt, input_reference: { image_url }, seconds: 4|8|12, size: "WxH" }
  //   poll GET /v1/videos/{id} until status completed → .url
  const submit = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "sora-2",
      prompt: req.prompt,
      ...(req.imageUrl
        ? { input_reference: { image_url: req.imageUrl } }
        : {}),
      seconds: String(
        [4, 8, 12].reduce((a, b) =>
          Math.abs(b - req.durationSec) < Math.abs(a - req.durationSec) ? b : a
        )
      ),
      size: req.resolution === "1080p" ? "1024x1792" : "720x1280",
    }),
  });
  if (!submit.ok) throw new Error(`sora submit failed: ${submit.status} ${await submit.text()}`);
  const { id } = (await submit.json()) as { id: string };
  // Poll until the clip is ready (Sora jobs are async). The completed video
  // object has NO url field — content is downloaded via /videos/{id}/content.
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`https://api.openai.com/v1/videos/${id}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    // 5xx = transient API trouble → keep polling, don't kill the job.
    if (poll.status >= 500) {
      console.log(`[video-worker] sora poll transient ${poll.status} attempt ${i + 1}, retrying`);
      continue;
    }
    if (!poll.ok) throw new Error(`sora poll failed: ${poll.status}`);
    const state = (await poll.json()) as { status?: string; error?: { message?: string } };
    if (state.status === "completed") {
      const dl = await fetch(`https://api.openai.com/v1/videos/${id}/content`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (!dl.ok) throw new Error(`sora content download failed: ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      const { put } = await import("@vercel/blob");
      if (!blobToken()) throw new Error("BLOB_READ_WRITE_TOKEN required to store Sora clip");
      const { url } = await put(`footage/sora-${id}.mp4`, buf, {
        access: "private",
        contentType: "video/mp4",
        token: blobToken(),
      });
      return url;
    }
    if (state.status === "failed" || state.error) {
      throw new Error(`sora generation failed: ${state.error?.message ?? state.status}`);
    }
  }
  throw new Error("sora generation timed out");
}

async function generateVeo(req: FootageRequest): Promise<string> {
  const key = requireKey("veo");
  // fal.ai Veo 3.1 image-to-video. This keeps Veo on the same FAL_KEY and
  // queue/poll path as Kling and Seedance.
  return falSubmit("/fal-ai/veo3.1/image-to-video", key, {
    prompt: req.prompt,
    image_url: req.imageUrl,
    aspect_ratio: "9:16",
    duration: `${Math.min(Math.max(req.durationSec, 4), 8)}s`,
    resolution: req.resolution === "480p" ? "720p" : req.resolution,
    generate_audio: false,
  });
}

async function falSubmit(queueId: string, key: string, body: unknown): Promise<string> {
  // fal.ai queue API: submit → poll status_url → result (media url).
  const submit = await fetch(`https://queue.fal.run${queueId}`, {
    method: "POST",
    headers: { authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!submit.ok) throw new Error(`fal submit failed: ${submit.status} ${await submit.text()}`);
  const { status_url, request_id } = (await submit.json()) as { status_url?: string; request_id?: string };
  const pollUrl = status_url ?? `https://queue.fal.run/fal-ai/requests/${request_id}/status`;
  console.log(`[video-worker] fal ${queueId} submitted → ${request_id}`);
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(pollUrl, { headers: { authorization: `Key ${key}` }, signal: AbortSignal.timeout(30_000) });
    if (!poll.ok) throw new Error(`fal poll failed: ${poll.status}`);
    const state = (await poll.json()) as { status?: string; response_url?: string; error?: unknown };
    if (state.status === "COMPLETED" && state.response_url) {
      const res = await fetch(state.response_url, { headers: { authorization: `Key ${key}` }, signal: AbortSignal.timeout(60_000) });
      const data = (await res.json()) as { video?: { url?: string } | string; detail?: unknown };
      // Fast-fail on validation/not-found bodies (e.g. {"detail": [...]}) — a
      // completed job with an error body will never produce a video.
      if (data.detail) {
        throw new Error(`fal generation failed: ${JSON.stringify(data.detail).slice(0, 400)}`);
      }
      const url = typeof data.video === "string" ? data.video : data.video?.url;
      if (url) return url;
    }
    if (state.status === "FAILED" || state.error) {
      throw new Error(`fal generation failed: ${JSON.stringify(state.error ?? state.status)}`);
    }
  }
  throw new Error("fal generation timed out");
}

async function generateSeedance(req: FootageRequest): Promise<string> {
  const key = requireKey("seedance");
  // Verified live 2026-08-14: fal moved Seedance off the old
  // /fal-ai/byte-dance/seedance/v1.5-alpha path (404 "Application not
  // found") to provider-owned /bytedance/seedance-2.5/image-to-video
  // (queue root, no fal-ai prefix — same convention as openai/*).
  // Seedance 2.5 caps resolution at 720p (480p/720p enum) — clamp "pro"
  // formulas down so they don't 422.
  const resolution = req.resolution === "1080p" ? "720p" : req.resolution;
  return falSubmit("/bytedance/seedance-2.5/image-to-video", key, {
    image_url: req.imageUrl,
    prompt: req.prompt,
    duration: req.durationSec,
    resolution,
  });
}

async function generateKling(req: FootageRequest): Promise<string> {
  const key = requireKey("kling");
  // Verified fal.ai model id. The former v2.5 path was accepted by the queue
  // endpoint but failed at runtime with `Path ... not found` because it is not
  // a real application. Kling v3 expects start_image_url.
  return falSubmit("/fal-ai/kling-video/v3/pro/image-to-video", key, {
    start_image_url: req.imageUrl,
    prompt: req.prompt,
    duration: String(Math.min(Math.max(req.durationSec, 5), 10)),
  });
}

async function generateKlingV1(req: FootageRequest): Promise<string> {
  const key = requireKey("kling_v1");
  return falSubmit("/fal-ai/kling-video/v1/standard/image-to-video", key, {
    image_url: req.imageUrl,
    prompt: req.prompt,
    duration: String(Math.min(Math.max(req.durationSec, 5), 10)),
    aspect_ratio: "9:16",
  });
}

// ─── Video Clone (v2v_edit) — Pipeline A: frame edit → re-animate ──────────
// Verified live 2026-08-13: fal has NO Kling video-edit model; the clone flow
// is keyframe extraction → image edit (nano-banana-pro/edit) → Kling 3.0 Pro
// image-to-video (start_image_url). See docs/V2V-CLONE-SPEC.md §4c/4d.

/** Image edit on a keyframe: background swap + on-screen text change. */
export async function generateCloneFrameEdit(
  imageUrl: string,
  prompt: string
): Promise<string> {
  const key = process.env.FAL_KEY;
  if (!key) throw new MissingKeyError("kling", "FAL_KEY");
  // Both fal edit models want image_urls (array) — verified via pydantic error.
  const body = { image_urls: [imageUrl], prompt };
  try {
    return await falImageSubmit("/fal-ai/nano-banana-pro/edit", key, body);
  } catch (primaryError) {
    console.warn(
      `[video-worker] nano-banana-pro edit failed, falling back to OpenAI-direct gpt-image-1: ${(primaryError as Error).message}`
    );
    // FAL-FREE FALLBACK (added 2026-08-14): api.openai.com/v1/images/edits runs
    // on OpenAI billing — clones survive a fal lockout (Sora animation + this
    // edit = zero fal). gpt-image-1 caps at 2:3; openaiImageEdit pads to 9:16.
    try {
      return await openaiImageEdit(imageUrl, prompt);
    } catch (openaiError) {
      console.warn(
        `[video-worker] openai-direct edit failed, falling back to fal gpt-image-2: ${(openaiError as Error).message}`
      );
      // Provider-owned models (openai/...) sit at the queue ROOT, no fal-ai prefix.
      return falImageSubmit("/openai/gpt-image-2/edit", key, body);
    }
  }
}

/** Models selectable for the clone's re-animate step. */
export type CloneModel = "kling-pro" | "kling-standard" | "sora" | "veo";

export async function generateCloneVideo(
  startImageUrl: string,
  prompt: string,
  durationSec: number,
  model: CloneModel = "kling-pro"
): Promise<string> {
  const key = process.env.FAL_KEY;
  if (!key) throw new MissingKeyError("kling", "FAL_KEY");

  if (model === "sora") {
    const r = await generateFootage({
      engine: "sora",
      imageUrl: startImageUrl,
      prompt,
      durationSec,
      resolution: "720p",
    });
    return r.url;
  }
  if (model === "veo") {
    const r = await generateFootage({
      engine: "veo",
      imageUrl: startImageUrl,
      prompt,
      durationSec,
      resolution: "720p",
    });
    return r.url;
  }
  const queueId =
    model === "kling-standard"
      ? "/fal-ai/kling-video/v3/standard/image-to-video"
      : "/fal-ai/kling-video/v3/pro/image-to-video";
  return falSubmit(queueId, key, {
    start_image_url: startImageUrl,
    prompt,
    duration: String(Math.min(Math.max(durationSec, 5), 10)),
  });
}

// ─── Scene image (AI re-render) ──────────────────────────────────────────────

export interface SceneRenderRequest {
  /** Product image (listing photo or processed cutout) used as reference only. */
  imageUrl: string;
  /** Scene description, e.g. "dark brown wood vanity table, natural lighting". */
  prompt: string;
  quality: "standard" | "pro";
}

export interface SceneRenderResult {
  url: string;
  dryRun: boolean;
}

/**
 * Re-renders the product into an ORIGINAL scene (spec §10): the input image is
 * used only as a reference for scale/dimension, never copied — brand-owned
 * listing photos must not appear as the video's first frame (TikTok Shop
 * copyright compliance).
 *
 * Primary: fal Gemini 2.5 Flash Image ("Nano Banana Pro" consumer name) — best
 * at preserving product text/logos. Fallback: flux-pro (cheaper, weaker text).
 * Queue ids marked TODO_VERIFY — confirmed at first real call.
 */
async function falImageSubmit(queueId: string, key: string, body: unknown): Promise<string> {
  const submit = await fetch(`https://queue.fal.run${queueId}`, {
    method: "POST",
    headers: { authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!submit.ok) throw new Error(`fal image submit failed: ${submit.status} ${await submit.text()}`);
  const { status_url, request_id } = (await submit.json()) as { status_url?: string; request_id?: string };
  const pollUrl = status_url ?? `https://queue.fal.run/fal-ai/requests/${request_id}/status`;
  console.log(`[video-worker] fal-image ${queueId} submitted → ${request_id}`);
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(pollUrl, { headers: { authorization: `Key ${key}` }, signal: AbortSignal.timeout(30_000) });
    if (!poll.ok) throw new Error(`fal image poll failed: ${poll.status}`);
    const state = (await poll.json()) as { status?: string; response_url?: string; error?: unknown };
    if (state.status === "COMPLETED" && state.response_url) {
      const res = await fetch(state.response_url, { headers: { authorization: `Key ${key}` }, signal: AbortSignal.timeout(60_000) });
      const data = (await res.json()) as { images?: Array<{ url?: string } | string>; image?: { url?: string } | string; detail?: unknown };
      // Fast-fail on error bodies — a completed job with {"detail": [...]} is dead.
      if (data.detail) {
        throw new Error(`fal image generation failed: ${JSON.stringify(data.detail).slice(0, 400)}`);
      }
      const images = data.images ?? [];
      const first = typeof images[0] === "string" ? images[0] : images[0]?.url;
      const url = first ?? (typeof data.image === "string" ? data.image : data.image?.url);
      if (url) return url;
    }
    if (state.status === "FAILED" || state.error) {
      throw new Error(`fal image generation failed: ${JSON.stringify(state.error ?? state.status)}`);
    }
  }
  throw new Error("fal image generation timed out");
}

/** Dry-run placeholder: solid-color 9:16 PNG → Blob (or marker URL). */
async function renderScenePlaceholder(outPath: string): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", "color=c=0x8a6f5d:s=720x1280", "-frames:v", "1", outPath],
    { stdio: "ignore", timeout: 60_000 }
  );
}

export async function generateSceneImage(req: SceneRenderRequest): Promise<SceneRenderResult> {
  if (DRY_RUN) {
    const out = `/tmp/scene-${Date.now()}.png`;
    await renderScenePlaceholder(out);
    const { put } = await import("@vercel/blob");
    if (blobToken()) {
      const { url } = await put(`scene/${Date.now()}.png`, createReadStream(out), {
        access: "private",
        contentType: "image/png",
        token: blobToken(),
      });
      return { url, dryRun: true };
    }
    return { url: `dryrun:scene:${Date.now()}`, dryRun: true };
  }

  // Primary: Gemini 2.5 Flash Image ("Nano Banana Pro") via the Google REST
  // API — the GEMINI_API_KEY is verified-good (the veo adapter uses it), and
  // this model is the best at preserving product text/logos.
  const key = requireKey("veo"); // GEMINI_API_KEY
  try {
    const url = await geminiImageEdit(key, req.imageUrl, req.prompt, req.quality);
    return { url, dryRun: false };
  } catch (primaryError) {
    console.warn(
      `[video-worker] gemini scene image failed, falling back to openai gpt-image-1: ${(primaryError as Error).message}`
    );
    try {
      const url = await openaiImageEdit(req.imageUrl, req.prompt);
      return { url, dryRun: false };
    } catch (openaiError) {
      console.warn(
        `[video-worker] openai scene image failed, falling back to fal flux: ${(openaiError as Error).message}`
      );
      // Fallback: fal flux-pro (cheaper, weaker at product text). Only when a
      // usable FAL_KEY exists (the stored one has been malformed — see notes).
      const falKey = process.env.FAL_KEY;
      if (falKey) {
        const url = await falImageSubmit("/fal-ai/flux-pro/v1.1", falKey, {
          prompt: req.prompt,
          image_url: req.imageUrl,
          num_images: 1,
          aspect_ratio: "9:16",
          output_format: "png",
        });
        return { url, dryRun: false };
      }
      throw primaryError;
    }
  }
}

/**
 * Gemini 2.5 Flash Image image-edit call:
 * POST /v1beta/models/gemini-2.5-flash-image:generateContent
 * Input: text prompt + the product photo as inline base64 (reference only).
 * Output: inline base64 PNG (or fileData URI) → stored to private Blob.
 */
async function geminiImageEdit(
  key: string,
  imageUrl: string,
  prompt: string,
  quality: "standard" | "pro"
): Promise<string> {
  const res = await fetch(imageUrl, {
    headers: blobToken() ? { Authorization: `Bearer ${blobToken()}` } : undefined,
  });
  if (!res.ok) throw new Error(`failed to fetch reference image for scene render: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/png";

  const gen = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mime, data: buf.toString("base64") } },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: quality === "pro" ? "9:16" : "9:16", imageSize: "2K" },
        },
      }),
    }
  );
  if (!gen.ok) throw new Error(`gemini scene image failed: ${gen.status} ${(await gen.text()).slice(0, 200)}`);

  const data = (await gen.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
          fileData?: { fileUri?: string };
        }>;
      };
    }>;
  };
  const part = data.candidates?.[0]?.content?.parts?.[0];
  if (!part) throw new Error("gemini scene image: empty response");
  if (part.fileData?.fileUri) return part.fileData.fileUri;

  if (part.inlineData?.data) {
    const { put } = await import("@vercel/blob");
    const imgBuf = Buffer.from(part.inlineData.data, "base64");
    const { url } = await put(`scene/${Date.now()}.png`, imgBuf, {
      access: "private",
      contentType: "image/png",
      token: blobToken(),
    });
    return url;
  }
  throw new Error("gemini scene image: no image in response");
}

/**
 * OpenAI gpt-image-1 image-edit fallback:
 * POST /v1/images/edits (multipart: reference image + prompt).
 * gpt-image-1 caps output at 2:3 (1024x1536) — the result is padded to the
 * 9:16 (720x1280) canvas Sora requires, then stored to private Blob.
 */
async function openaiImageEdit(imageUrl: string, prompt: string): Promise<string> {
  const key = requireKey("sora"); // OPENAI_API_KEY
  const res = await fetch(imageUrl, {
    headers: blobToken() ? { Authorization: `Bearer ${blobToken()}` } : undefined,
  });
  if (!res.ok) throw new Error(`failed to fetch reference image for openai edit: ${res.status}`);
  const imgBuf = Buffer.from(await res.arrayBuffer());

  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", "1024x1536");
  form.append("quality", "medium");
  form.append("image", new Blob([imgBuf], { type: "image/png" }), "product.png");

  const gen = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` }, // boundary set by FormData; no content-type
    body: form,
  });
  if (!gen.ok) throw new Error(`openai image edit failed: ${gen.status} ${(await gen.text()).slice(0, 200)}`);
  const data = (await gen.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const b64 = data.data?.[0]?.b64_json ?? data.data?.[0]?.url ?? null;
  if (!b64) throw new Error("openai image edit: empty response");

  const { writeFile } = await import("node:fs/promises");
  const { execFileSync } = await import("node:child_process");
  const tmp = `/tmp/openai-edit-${Date.now()}.png`;
  const padded = `/tmp/openai-pad-${Date.now()}.png`;
  if (b64.startsWith("data:") || b64.includes("base64,")) {
    await writeFile(tmp, Buffer.from(b64.split("base64,")[1] ?? b64, "base64"));
  } else if (b64.startsWith("http")) {
    const dl = await fetch(b64);
    if (!dl.ok) throw new Error(`openai edit download failed: ${dl.status}`);
    await writeFile(tmp, Buffer.from(await dl.arrayBuffer()));
  } else {
    await writeFile(tmp, Buffer.from(b64, "base64"));
  }
  execFileSync(
    "ffmpeg",
    [
      "-y", "-i", tmp,
      "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",
      "-frames:v", "1", padded,
    ],
    { stdio: "ignore", timeout: 60_000 }
  );
  const { put } = await import("@vercel/blob");
  const { url } = await put(`scene/${Date.now()}.png`, createReadStream(padded), {
    access: "private",
    contentType: "image/png",
    token: blobToken(),
  });
  return url;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function generateFootage(req: FootageRequest): Promise<FootageResult> {
  if (DRY_RUN) {
    const out = `/tmp/dryrun-${req.engine}-${Date.now()}.mp4`;
    await renderPlaceholder(req.durationSec, req.resolution, out);
    const { put } = await import("@vercel/blob");
    if (blobToken()) {
      const { url } = await put(`dryrun/footage/${req.engine}-${Date.now()}.mp4`, createReadStream(out), {
        access: "private",
        contentType: "video/mp4",
        token: blobToken(),
      });
      return { url, engine: req.engine, dryRun: true };
    }
    return { url: `dryrun:${req.engine}:${Date.now()}`, engine: req.engine, dryRun: true };
  }

  switch (req.engine) {
    case "sora":
      return { url: await generateSora(req), engine: "sora", dryRun: false };
    case "veo":
      return { url: await generateVeo(req), engine: "veo", dryRun: false };
    case "seedance":
      return { url: await generateSeedance(req), engine: "seedance", dryRun: false };
    case "kling":
      return { url: await generateKling(req), engine: "kling", dryRun: false };
    case "kling_v1":
      return { url: await generateKlingV1(req), engine: "kling_v1", dryRun: false };
    case "kling_v3":
      return { url: await generateKling(req), engine: "kling_v3", dryRun: false };
  }
}
