import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { blobToken } from "../env.js";
import { sql, markDone, failWithRetry, type JobRow } from "../db.js";
import {
  generateCloneFrameEdit,
  generateCloneVideo,
  type CloneModel,
} from "../providers.js";

const execFileP = promisify(execFile);

/** Browser-ish UA — TikTok serves the full page (incl. playAddr) to it. */
const TT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * TikTok video download that works from datacenter IPs (ported from
 * ads-worker/worker.py, verified 2026-08 from this VPS). yt-dlp's TikTok
 * extractor gets bot-challenged here; a browser-like fetch receives the full
 * page with the signed playAddr, and the video CDN serves that same session
 * the file (Referer required). No login/cookies needed.
 */
async function downloadTikTokSource(url: string, outPath: string): Promise<void> {
  const headers = { "User-Agent": TT_UA, "Accept-Language": "en-US,en;q=0.9" };
  // The video CDN serves the file to the same session that fetched the page
  // (session cookies + Referer required) — mirror ads-worker's Session().
  let cookieHeader = "";
  const sessionFetch = async (u: string, extra: Record<string, string> = {}) => {
    const res = await fetch(u, {
      headers: { ...headers, ...(cookieHeader ? { cookie: cookieHeader } : {}), ...extra },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length) {
      cookieHeader = setCookies
        .map((c) => c.split(";")[0])
        .filter(Boolean)
        .join("; ");
    }
    return res;
  };

  const resp = await sessionFetch(url);
  if (!resp.ok) throw new Error(`tiktok page fetch failed: ${resp.status}`);
  if (resp.url.includes("/view/product/")) {
    throw new Error(
      "This is a TikTok Shop product link, not a video — paste an ad video URL or upload the file."
    );
  }
  const m = resp.url.match(/\/video\/(\d+)/);
  if (!m) throw new Error(`no TikTok video id found at ${resp.url.slice(0, 120)}`);
  let page = await resp.text();
  if (!page.includes(m[1])) {
    // short-link interstitial — refetch canonical page
    const r2 = await sessionFetch(resp.url);
    if (!r2.ok) throw new Error(`tiktok canonical fetch failed: ${r2.status}`);
    page = await r2.text();
  }
  const match = page.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error("TikTok page returned no rehydration data (bot-walled?)");
  const data = JSON.parse(match[1]) as {
    __DEFAULT_SCOPE__?: {
      "webapp.video-detail"?: {
        itemInfo?: {
          itemStruct?: {
            video?: { playAddr?: string | { urlList?: string[]; url_list?: string[] } };
          };
        };
      };
    };
  };
  const video = data.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct?.video ?? {};
  const play = video.playAddr;
  let playUrl: string | null = null;
  if (typeof play === "string") playUrl = play;
  else if (play) playUrl = (play.urlList ?? play.url_list ?? [null])[0];
  if (!playUrl) throw new Error("no playable video URL in page data");
  const vr = await fetch(playUrl, {
    headers: { ...headers, ...(cookieHeader ? { cookie: cookieHeader } : {}), Referer: "https://www.tiktok.com/" },
    signal: AbortSignal.timeout(90_000),
  });
  if (!vr.ok) throw new Error(`tiktok video fetch failed: ${vr.status}`);
  const buf = Buffer.from(await vr.arrayBuffer());
  if (buf.length === 0) throw new Error("downloaded video is empty");
  writeFileSync(outPath, buf);
}

/** Fail fast if the "video" we downloaded is actually HTML/not a container. */
function assertVideoBytes(buf: Buffer, src: string): void {
  const isMp4 = buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp";
  const isWebm = buf.length > 4 && buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (!isMp4 && !isWebm) {
    const looksHtml = buf.subarray(0, 256).toString("latin1").trimStart().startsWith("<");
    throw new Error(
      looksHtml
        ? `source URL returned HTML, not a video (${src.slice(0, 120)}) — use a direct .mp4 link or upload the file`
        : `source download is not a recognized video container (mp4/webm)`
    );
  }
}

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
      /** Re-animate engine: kling-pro (default) | kling-standard | sora | veo. */
      model?: CloneModel;
      /** Output size: 9:16 (default) | 16:9 | 1:1. */
      aspectRatio?: string;
      /** Output quality: 720p (default) | 1080p. */
      resolution?: string;
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

    // 1. Download the source video. TikTok page/short links resolve to the
    //    direct CDN file (ads-worker port); anything else is fetched raw and
    //    magic-byte-checked so an HTML error page can't masquerade as an mp4.
    const srcPath = `${workDir}/source.mp4`;
    if (sourceVideoUrl.includes("tiktok.com")) {
      await downloadTikTokSource(sourceVideoUrl, srcPath);
    } else {
      const srcRes = await fetch(sourceVideoUrl, {
        headers: blobToken() ? { authorization: `Bearer ${blobToken()}` } : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      if (!srcRes.ok) throw new Error(`source video fetch failed: ${srcRes.status}`);
      const buf = Buffer.from(await srcRes.arrayBuffer());
      assertVideoBytes(buf, sourceVideoUrl);
      writeFileSync(srcPath, buf);
    }

    // 2. Extract a key frame near 40% in — subject is usually most visible.
    //    Size follows the requested output: 720p/1080p × 9:16/16:9/1:1.
    const aspect = meta.aspectRatio === "16:9" ? "16:9" : meta.aspectRatio === "1:1" ? "1:1" : "9:16";
    const is1080 = meta.resolution === "1080p";
    const KEYFRAME_SIZE: Record<string, string> = {
      "9:16": is1080 ? "1080x1920" : "720x1280",
      "16:9": is1080 ? "1920x1080" : "1280x720",
      "1:1": is1080 ? "1080x1080" : "720x720",
    };
    const kfSize = KEYFRAME_SIZE[aspect];
    const probe = await execFileP("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", srcPath,
    ]);
    const dur = parseFloat(probe.stdout.trim()) || 4;
    const ts = Math.min(Math.max(dur * 0.4, 0.1), dur - 0.1);
    const framePath = `${workDir}/keyframe.png`;
    await execFileP("ffmpeg", [
      "-y", "-ss", String(ts), "-i", srcPath, "-frames:v", "1",
      "-vf", `scale=${kfSize}:force_original_aspect_ratio=decrease,pad=${kfSize}:(ow-iw)/2:(oh-ih)/2`,
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

    // 4. Re-animate the edited frame (model picker: kling-pro/standard, sora, veo).
    const motion = meta.motionPrompt ?? "subtle natural motion, same camera angle";
    const videoUrl = await generateCloneVideo(
      editedFrame,
      `${motion}. ${editPrompt}`,
      meta.durationSec ?? 5,
      meta.model ?? "kling-pro",
      aspect,
      is1080 ? "1080p" : "720p"
    );

    // 5. Normalize result: Sora's generateFootage already lands on Blob;
    //    fal/Gemini URLs need a download → private Blob → mark job done.
    if (videoUrl.includes("blob.vercel-storage.com")) {
      await markDone(job.id, { final_url: videoUrl });
      console.log(`[video-worker] v2v_edit(${meta.model ?? "kling-pro"}) ${job.id} done → ${videoUrl}`);
      return;
    }
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
