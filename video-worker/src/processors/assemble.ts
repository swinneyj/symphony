import { createReadStream, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { sql, markDone, failWithRetry, type JobRow } from "../db.js";
import { generateVoiceover } from "../tts.js";
import { renderPlaceholder } from "../providers.js";

/**
 * batch_video job: voiceover + final assembly.
 *
 * Inputs: footage clip (from the footage job, passed via job.metadata),
 * voice from the batch, script from the job row.
 * Output: 9:16 MP4 (h264+aac, faststart) uploaded to Blob → job.final_url.
 */
export async function handleAssemble(job: JobRow, maxRetries: number): Promise<void> {
  const workdir = `/tmp/assemble-${job.id}`;
  try {
    const { execSync } = await import("node:child_process");
    execSync(`mkdir -p ${workdir}`, { stdio: "ignore" });

    const footageUrl = (job.metadata?.footageUrl as string | undefined) ?? job.footage_url;
    if (!footageUrl) {
      await failWithRetry(job, "no footage available for this product (footage job did not complete)", maxRetries);
      return;
    }

    // 1. Voiceover
    const [voice] = job.batch_id
      ? await sql`
          SELECT v.name, v.provider, v.provider_voice_id
          FROM video_batches b JOIN voices v ON v.id = b.voice_id
          WHERE b.id = ${job.batch_id}
        `
      : [null];
    const voiceOverPath = `${workdir}/vo.mp3`;
    let haveVoiceover = false;
    if (job.script && job.script.trim().length > 0) {
      const provider = (voice?.provider ?? "openai_tts") as "elevenlabs" | "openai_tts" | "kokoro";
      await generateVoiceover({
        script: job.script,
        provider,
        voiceName: voice?.name ?? null,
        providerVoiceId: voice?.provider_voice_id ?? null,
        outPath: voiceOverPath,
      });
      haveVoiceover = existsSync(voiceOverPath);
    }

    // 2. Footage (download, or re-render placeholder for dry-run markers)
    const footagePath = `${workdir}/footage.mp4`;
    if (footageUrl.startsWith("dryrun:")) {
      await renderPlaceholder(6, "720p", footagePath);
    } else {
      const res = await fetch(footageUrl);
      if (!res.ok) throw new Error(`failed to download footage: ${res.status}`);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(footagePath, Buffer.from(await res.arrayBuffer()));
    }

    // 3. Assemble: footage video + VO audio, silence-cut start, 9:16, faststart.
    const finalPath = `${workdir}/final.mp4`;
    const args = ["-y"];
    args.push("-i", footagePath);
    if (haveVoiceover) args.push("-i", voiceOverPath);
    args.push(
      "-map", "0:v:0",
      ...(haveVoiceover ? ["-map", "1:a:0"] : []),
      "-c:v", "libx264", "-preset", "medium", "-crf", "23",
      ...(haveVoiceover
        ? ["-c:a", "aac", "-b:a", "128k", "-af", "silenceremove=start_periods=1:start_threshold=-45dB,alimiter=limit=0.95"]
        : ["-an"]),
      "-shortest", "-movflags", "+faststart", "-pix_fmt", "yuv420p",
      finalPath
    );
    execFileSync("ffmpeg", args, { stdio: "ignore", timeout: 180_000 });

    // 4. Upload + store (dry-run without Blob token → marker URL)
    const { put } = await import("@vercel/blob");
    let url: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      ({ url } = await put(
        `videos/${job.workspace_id}/${job.product_id}/${job.id}.mp4`,
        createReadStream(finalPath),
        { access: "public", contentType: "video/mp4" }
      ));
    } else {
      url = `dryrun:assemble:${job.id}`;
    }
    await markDone(job.id, { final_url: url });
    console.log(`[video-worker] assemble done job=${job.id} vo=${haveVoiceover}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[video-worker] assemble failed job=${job.id}: ${message}`);
    await failWithRetry(job, message, maxRetries);
  } finally {
    try {
      const { rmSync } = await import("node:fs");
      rmSync(workdir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}
