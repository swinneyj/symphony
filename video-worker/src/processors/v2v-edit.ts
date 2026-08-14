import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { blobToken } from "../env.js";
import { sql, markDone, failWithRetry, type JobRow } from "../db.js";
import {
  generateCloneFrameEdit,
  generateCloneVideo,
} from "../providers.js";

const execFileP = promisify(execFile);

/**
 * v2v_edit job — Video Clone (backlog row 9, Pipeline A: frame-edit → re-animate).
 *
 * metadata: {
 *   sourceVideoUrl: string,   // uploaded source (Blob/URL) to clone
 *   editPrompt: string,       // user prompt, e.g. "change the background to a neon nightclub"
 *   textChange?: string,      // optional on-screen text replacement (parity with nych.ai demo)
 *   motionPrompt?: string,    // optional motion direction for the re-animation
 *   durationSec?: number      // target clip length (clamped 5-10 by provider)
 * }
 *
 * Flow: download source → ffmpeg key frame → fal nano-banana-pro/edit (bg + text
 * swap, gpt-image-2 fallback) → Kling 3.0 Pro image-to-video → Blob → job done.
 */
export async function handleV2VEdit(job: JobRow, maxRetries: number): Promise<void> {
  try {
    const meta = (job.metadata ?? {}) as {
      sourceVideoUrl?: string;
      editPrompt?: string;
      textChange?: string;
      motionPrompt?: string;
      durationSec?: number;
      /** True V2V: feed the source video straight to Kling (needs public URL). */
      useVideoUrlDirect?: boolean;
    };
    const { sourceVideoUrl, editPrompt } = meta;
    if (!sourceVideoUrl || !editPrompt) {
      await failWithRetry(
        job,
        "v2v_edit requires metadata.sourceVideoUrl and metadata.editPrompt",
        maxRetries
      );
      return;
    }

    const workDir = `/tmp/v2v-${job.id}`;
    await execFileP("mkdir", ["-p", workDir]);

    // 1. Download the source video (private Blob URLs need the token header).
    const srcRes = await fetch(sourceVideoUrl, {
      headers: blobToken() ? { authorization: `Bearer ${blobToken()}` } : undefined,
    });
    if (!srcRes.ok) throw new Error(`source video fetch failed: ${srcRes.status}`);
    const srcPath = `${workDir}/source.mp4`;
    writeFileSync(srcPath, Buffer.from(await srcRes.arrayBuffer()));

    // 2. Extract a key frame near 40% in — subject is usually most visible.
    const probe = await execFileP("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", srcPath,
    ]);
    const dur = parseFloat(probe.stdout.trim()) || 4;
    const ts = Math.min(Math.max(dur * 0.4, 0.1), dur - 0.1);
    const framePath = `${workDir}/keyframe.png`;
    await execFileP("ffmpeg", [
      "-y", "-ss", String(ts), "-i", srcPath, "-frames:v", "1",
      "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2",
      "-q:v", "2", framePath,
    ], { timeout: 60_000 });
    const frameData = `data:image/png;base64,${readFileSync(framePath).toString("base64")}`;

    // 3. Frame edit: background + optional on-screen text change, subject pinned.
    const textLine = meta.textChange
      ? ` Replace the on-screen text (captions/watermarks) with: "${meta.textChange}".`
      : "";
    const editedFrame = await generateCloneFrameEdit(
      frameData,
      `${editPrompt}.${textLine} Keep the subject, pose, and framing identical.`
    );

    // 4. Re-animate the edited frame (Kling 3.0 Pro image-to-video).
    const motion = meta.motionPrompt ?? "subtle natural motion, same camera angle";
    const videoUrl = await generateCloneVideo(
      editedFrame,
      `${motion}. ${editPrompt}`,
      meta.durationSec ?? 5
    );

    // 5. Download result → private Blob → mark job done.
    const vidRes = await fetch(videoUrl);
    if (!vidRes.ok) throw new Error(`clone result fetch failed: ${vidRes.status}`);
    const { put } = await import("@vercel/blob");
    if (!blobToken()) throw new Error("BLOB_READ_WRITE_TOKEN required to store clone result");
    const { url } = await put(`v2v/${job.id}.mp4`, Buffer.from(await vidRes.arrayBuffer()), {
      access: "private",
      contentType: "video/mp4",
      token: blobToken(),
    });

    await markDone(job.id, { final_url: url });
    console.log(`[video-worker] v2v_edit ${job.id} done → ${url}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[video-worker] v2v_edit ${job.id} failed:`, msg);
    await failWithRetry(job, msg, maxRetries);
  }
}
