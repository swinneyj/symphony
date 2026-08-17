import { createReadStream, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { blobToken } from "../env.js";
import { sql, markDone, failWithRetry, type JobRow } from "../db.js";
import { generateVoiceover } from "../tts.js";
import { renderPlaceholder } from "../providers.js";
import { runQc } from "../qc.js";

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
    let footagePath = `${workdir}/footage.mp4`;
    const extendMode = (job.metadata?.extendMode as string | undefined) ?? null;
    if (footageUrl.startsWith("dryrun:")) {
      await renderPlaceholder(6, "720p", footagePath);
    } else {
      const res = await fetch(footageUrl, {
        headers: blobToken() ? { Authorization: `Bearer ${blobToken()}` } : undefined,
      });
      if (!res.ok) throw new Error(`failed to download footage: ${res.status}`);
      const { writeFile } = await import("node:fs/promises");
      await writeFile(footagePath, Buffer.from(await res.arrayBuffer()));
    }

    // 2b. Reverse-extend (spec §10.7): play clip forward then backward — 10s
    // video from a 5s generation, halves footage credit spend. Ambient motion
    // only (zoom/pan); not for action demos.
    if (extendMode === "reverse") {
      const revPath = `${workdir}/footage-rev.mp4`;
      const extPath = `${workdir}/footage-ext.mp4`;
      execFileSync(
        "ffmpeg",
        ["-y", "-i", footagePath, "-vf", "reverse", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "23", revPath],
        { stdio: "ignore", timeout: 180_000 }
      );
      execFileSync(
        "ffmpeg",
        ["-y", "-i", footagePath, "-i", revPath, "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", extPath],
        { stdio: "ignore", timeout: 180_000 }
      );
      footagePath = extPath;
      console.log(`[video-worker] assemble reverse-extended job=${job.id}`);
    }

    // 2c. CTA text overlay (formula.overlayTemplate): burn "{product} / {price}"
    // substituted text onto the clip. $0 (ffmpeg drawtext). Skipped if no font
    // is available on the worker so the job can never fail over a font.
    let overlayArgs: string[] = [];
    const overlayTemplate = (job.metadata?.overlayTemplate as string | undefined) ?? null;
    if (overlayTemplate && overlayTemplate.trim().length > 0) {
      const [product] = await sql`
        SELECT name, price FROM products WHERE id = ${job.product_id}
      `;
      const text = overlayTemplate
        .replaceAll("@product", product?.name ?? "this")
        .replaceAll("@price", product?.price != null ? String(product.price) : "")
        .replaceAll("{product}", product?.name ?? "this")
        .replaceAll("{price}", product?.price != null ? String(product.price) : "");
      const font = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf", "/usr/share/fonts/truetype/freefont/FreeSans.ttf"].find((p) => existsSync(p));
      if (font) {
        // Per-line layout from the run view's draggable canvas: each line is
        // burned at its own {x,y} fraction (0..1), centered on that point.
        // Falls back to stacked-top when no layout accompanies the text.
        const layout = (job.metadata?.overlayLayout as { x: number; y: number }[] | undefined) ?? null;
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        const { writeFile } = await import("node:fs/promises");
        const fontSize = Number(job.metadata?.overlayFontSize ?? 44);
        const drawtexts: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const textFile = `${workdir}/overlay-${i}.txt`;
          await writeFile(textFile, line, "utf8");
          const pos = layout?.[i] ?? { x: 0.5, y: 0.12 + i * 0.14 };
          const x = Math.min(0.95, Math.max(0.05, Number(pos.x) || 0.5));
          const y = Math.min(0.92, Math.max(0.05, Number(pos.y) || 0.5));
          // Center the text box on (x,y): x=(w-text_w)*fx keeps it on-screen
          // and centered at fx=0.5; same for y.
          drawtexts.push(
            `drawtext=fontfile=${font}:textfile=${textFile}:fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=16:x=(w-text_w)*${x}:y=(h-text_h)*${y}`
          );
        }
        if (drawtexts.length > 0) {
          overlayArgs = ["-vf", drawtexts.join(",")];
          console.log(`[video-worker] assemble overlay job=${job.id}: ${lines.length} line(s) @ ${JSON.stringify(layout ?? "stacked")}`);
        }
      } else {
        console.warn(`[video-worker] assemble: no font found, skipping overlay job=${job.id}`);
      }
    }

    // 3. Assemble: footage video + VO audio, silence-cut start, 9:16, faststart.
    //    Overscan: crop a small margin off every edge and scale back up. AI
    //    video models (Kling especially) warp/move the outer border band on
    //    near-static shots; cropping that band out removes the artifact
    //    deterministically (the classic editor's overscan trick). 3% per side
    //    is visually invisible but sits outside the warping zone.
    const finalPath = `${workdir}/final.mp4`;
    const args = ["-y"];
    args.push("-i", footagePath);
    if (haveVoiceover) args.push("-i", voiceOverPath);
    const overscanVf = "crop=iw*0.94:ih*0.94:iw*0.03:ih*0.03,scale=trunc(iw/0.94/2)*2:trunc(ih/0.94/2)*2";
    const vf = overlayArgs.length > 0 ? `${overscanVf},${overlayArgs[1]}` : overscanVf;
    args.push(
      "-map", "0:v:0",
      ...(haveVoiceover ? ["-map", "1:a:0"] : []),
      "-vf", vf,
      "-c:v", "libx264", "-preset", "medium", "-crf", "23",
      ...(haveVoiceover
        ? ["-c:a", "aac", "-b:a", "128k", "-af", "silenceremove=start_periods=1:start_threshold=-45dB,alimiter=limit=0.95"]
        : ["-an"]),
      // Boomerang videos must play their full forward+reverse length; -shortest
      // would truncate the clip to the VO duration and kill the effect.
      ...(extendMode === "reverse" ? [] : ["-shortest"]),
      "-movflags", "+faststart", "-pix_fmt", "yuv420p",
      finalPath
    );
    execFileSync("ffmpeg", args, { stdio: "ignore", timeout: 180_000 });

    // 3b. QC pass: border stability + letterbox check on the finished video
    // ($0 ffmpeg pixel analysis). Flags feed the UI; 'fail' still uploads but
    // the job is surfaced as needing review before posting.
    let qc: ReturnType<typeof runQc> | null = null;
    try {
      qc = runQc(finalPath);
      console.log(`[video-worker] assemble QC job=${job.id}: flag=${qc.flag} score=${qc.score.toFixed(1)} motion=${qc.motion.toFixed(1)} letterbox=${qc.letterbox} reasons=${qc.reasons.join("|") || "none"}`);
    } catch (qcError) {
      console.warn(`[video-worker] assemble QC skipped job=${job.id}: ${qcError instanceof Error ? qcError.message : qcError}`);
    }

    // 4. Upload + store (dry-run without Blob token → marker URL)
    const { put } = await import("@vercel/blob");
    let url: string;
    if (blobToken()) {
      ({ url } = await put(
        `videos/${job.workspace_id}/${job.product_id}/${job.id}.mp4`,
        createReadStream(finalPath),
        { access: "private", contentType: "video/mp4", token: blobToken() }
      ));
    } else {
      url = `dryrun:assemble:${job.id}`;
    }
    const meta = (job.metadata ?? {}) as Record<string, unknown>;
    await markDone(job.id, {
      final_url: url,
      metadata: {
        ...meta,
        ...(qc ? { qc: { flag: qc.flag, score: Math.round(qc.score * 10) / 10, motion: Math.round(qc.motion * 10) / 10, letterbox: qc.letterbox, reasons: qc.reasons } } : {}),
      },
    });
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
