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

export type Engine = "veo" | "seedance" | "sora" | "kling";

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
  veo: "GEMINI_API_KEY",
  seedance: "FAL_KEY",
  kling: "FAL_KEY",
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
  // TODO_VERIFY: exact Sora 2 API shape + model id (openai.com/v1/videos).
  const submit = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "sora-2", // TODO_VERIFY
      prompt: req.prompt,
      image: req.imageUrl, // first frame = product photo
      duration: req.durationSec,
      resolution: req.resolution,
    }),
  });
  if (!submit.ok) throw new Error(`sora submit failed: ${submit.status} ${await submit.text()}`);
  const { id } = (await submit.json()) as { id: string };
  // Poll until the clip is ready (Sora jobs are async).
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`https://api.openai.com/v1/videos/${id}`, {
      headers: { authorization: `Bearer ${key}` },
    });
    if (!poll.ok) throw new Error(`sora poll failed: ${poll.status}`);
    const state = (await poll.json()) as { status?: string; url?: string; error?: { message?: string } };
    if (state.url) return state.url;
    if (state.status === "failed" || state.error) {
      throw new Error(`sora generation failed: ${state.error?.message ?? state.status}`);
    }
  }
  throw new Error("sora generation timed out");
}

async function generateVeo(req: FootageRequest): Promise<string> {
  const key = requireKey("veo");
  // TODO_VERIFY: model id + first-frame image parameter for Veo via Gemini API.
  const model = "veo-3.1-generate-preview"; // TODO_VERIFY
  const submit = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.prompt }] }],
        generationConfig: {
          durationSeconds: req.durationSec,
          resolution: req.resolution,
        },
      }),
    }
  );
  if (!submit.ok) throw new Error(`veo submit failed: ${submit.status} ${await submit.text()}`);
  const { name } = (await submit.json()) as { name: string };
  // Veo returns a long-running operation; poll it.
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${name}?key=${key}`
    );
    if (!poll.ok) throw new Error(`veo poll failed: ${poll.status}`);
    const op = (await poll.json()) as { done?: boolean; response?: { video?: { url?: string } }; error?: { message?: string } };
    if (op.done && op.response?.video?.url) return op.response.video.url;
    if (op.error) throw new Error(`veo generation failed: ${op.error.message}`);
  }
  throw new Error("veo generation timed out");
}

async function falSubmit(queueId: string, key: string, body: unknown): Promise<string> {
  // fal.ai queue API: submit → poll status_url → result (media url).
  const submit = await fetch(`https://queue.fal.run${queueId}`, {
    method: "POST",
    headers: { authorization: `Key ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!submit.ok) throw new Error(`fal submit failed: ${submit.status} ${await submit.text()}`);
  const { status_url, request_id } = (await submit.json()) as { status_url?: string; request_id?: string };
  const pollUrl = status_url ?? `https://queue.fal.run/fal-ai/requests/${request_id}/status`;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(pollUrl, { headers: { authorization: `Key ${key}` } });
    if (!poll.ok) throw new Error(`fal poll failed: ${poll.status}`);
    const state = (await poll.json()) as { status?: string; response_url?: string; error?: unknown };
    if (state.status === "COMPLETED" && state.response_url) {
      const res = await fetch(state.response_url, { headers: { authorization: `Key ${key}` } });
      const data = (await res.json()) as { video?: { url?: string } | string };
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
  // TODO_VERIFY: exact fal queue id for Seedance image-to-video.
  return falSubmit("/fal-ai/byte-dance/seedance/v1.5-alpha/image-to-video", key, {
    image_url: req.imageUrl,
    prompt: req.prompt,
    duration: req.durationSec,
    resolution: req.resolution,
  });
}

async function generateKling(req: FootageRequest): Promise<string> {
  const key = requireKey("kling");
  // TODO_VERIFY: exact fal queue id for Kling image-to-video.
  return falSubmit("/fal-ai/kling-video/v2.5/image-to-video", key, {
    image_url: req.imageUrl,
    prompt: req.prompt,
    duration: req.durationSec,
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function generateFootage(req: FootageRequest): Promise<FootageResult> {
  if (DRY_RUN) {
    const out = `/tmp/dryrun-${req.engine}-${Date.now()}.mp4`;
    await renderPlaceholder(req.durationSec, req.resolution, out);
    const { put } = await import("@vercel/blob");
    if (blobToken()) {
      const { url } = await put(`dryrun/footage/${req.engine}-${Date.now()}.mp4`, createReadStream(out), {
        access: "public",
        contentType: "video/mp4",
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
  }
}
