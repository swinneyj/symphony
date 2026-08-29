import { blobToken } from "../env.js";
import { sql, markDone, failWithRetry, updateBatchProgress, type JobRow } from "../db.js";
import { generateFootage, type Engine, MissingKeyError } from "../providers.js";
import { buildScenePrompt } from "../prompt.js";

/**
 * Footage job: generates the video clip for one product.
 *
 * Flow: product image (processed ?? original) + formula scene prompt + motion
 * preset → provider.generateFootage → Blob URL stored on the job.
 */
export async function handleFootage(job: JobRow, maxRetries: number): Promise<void> {
  try {
    // Image Studio standalone mode: the job carries its own approved image
    // (metadata.sceneImageUrl) and no product row is needed.
    type ProductRow = {
      id: string;
      name: string;
      description: string | null;
      price: string | null;
      original_image_url: string | null;
      processed_image_url: string | null;
    };
    const meta = (job.metadata ?? {}) as {
      videoEngine?: Engine;
      sourceFrame?: string;
      sceneImageUrl?: string;
      scenePromptTemplate?: string;
      motionPreset?: string;
      durationSec?: number;
      quality?: string;
      resolution?: "480p" | "720p" | "1080p";
      aspectRatio?: string;
      seed?: number;
      noChain?: boolean;
      prompt?: string;
    };

    let product: ProductRow | null = null;
    if (job.product_id) {
      const rows = await sql`
        SELECT id, name, description, price, original_image_url, processed_image_url
        FROM products WHERE id = ${job.product_id}
      `;
      product = (rows[0] ?? null) as unknown as ProductRow;
    }
    if (!product && !meta.sceneImageUrl) {
      await failWithRetry(job, "footage requires a product or metadata.sceneImageUrl", maxRetries);
      return;
    }

    const [formula] = job.formula_id
      ? await sql`
          SELECT scene_prompt_template, motion_preset, duration_sec, quality
          FROM video_formulas WHERE id = ${job.formula_id}
        `
      : [null];

    const [batch] = job.batch_id
      ? await sql`SELECT provider FROM video_batches WHERE id = ${job.batch_id}`
      : [null];

    // First frame: the AI scene render when present (spec §10 — never feed the
    // brand's listing photo to the video provider), else processed/original.
    const engine = (meta.videoEngine ?? batch?.provider ?? process.env.VIDEO_DEFAULT_ENGINE ?? "sora") as Engine;
    const imageUrl = meta.sceneImageUrl ?? product?.processed_image_url ?? product?.original_image_url;
    if (!imageUrl) {
      await failWithRetry(job, "no image available for this product (run product processing first)", maxRetries);
      return;
    }
    // Deliver the first frame as a base64 data URI so the video provider never
    // has to fetch anything itself (private Blob URLs would 403; some hosts
    // block bot fetchers). Sora requires the image to match the requested size
    // exactly — img-worker pads to 720x1280, so this holds for processed images.
    let firstFrame = imageUrl;
    if (imageUrl.startsWith("dryrun:")) {
      // Dry-run marker: no real image exists; the provider dry-run path ignores it.
      firstFrame = imageUrl;
    } else if (!imageUrl.startsWith("data:")) {
      const res = await fetch(imageUrl, {
        headers: blobToken() ? { Authorization: `Bearer ${blobToken()}` } : undefined,
      });
      if (!res.ok) throw new Error(`failed to fetch first-frame image: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
      firstFrame = `data:${mime};base64,${buf.toString("base64")}`;
    }

    const scenePrompt = meta.prompt ?? buildScenePrompt({
      // Graph-authored (Formula Studio) values override the formula row.
      scenePromptTemplate: meta.scenePromptTemplate ?? formula?.scene_prompt_template ?? null,
      motionPreset: meta.motionPreset ?? formula?.motion_preset ?? null,
      product: {
        name: product?.name ?? "the product",
        description: product?.description ?? "",
        price: product?.price ?? "",
      },
    });

    const result = await generateFootage({
      engine,
      imageUrl: firstFrame,
      prompt: scenePrompt,
      durationSec: meta.durationSec ?? formula?.duration_sec ?? 6,
      // Image Studio: explicit resolution override beats the quality mapping.
      ...(meta.resolution
        ? { resolution: meta.resolution }
        : {
            // Cost mapping (fal Seedance 2.5: 480p ≈ $0.22/s, 720p ≈ $0.47/s, 1080p ≈ $0.9+/s):
            //   fast → 480p, standard → 720p, pro → 1080p (Seedance clamps to 720p anyway)
            resolution:
              (meta.quality ?? formula?.quality ?? "standard") === "fast"
                ? "480p"
                : (meta.quality ?? formula?.quality ?? "standard") === "pro"
                  ? "1080p"
                  : "720p",
          }),
      ...(meta.aspectRatio ? { aspectRatio: meta.aspectRatio } : {}),
      ...(meta.seed !== undefined ? { seed: meta.seed } : {}),
    });

    await markDone(job.id, { footage_url: result.url });
    if (job.batch_id) await updateBatchProgress(job.batch_id);
    // Chain: footage done → enqueue final assembly (voiceover + concat).
    // Image Studio sets noChain=true; it chains its own assembly explicitly.
    if (job.batch_id && !meta.noChain) {
      const meta = (job.metadata ?? {}) as Record<string, unknown>;
      await sql`
        INSERT INTO video_batch_jobs (batch_id, workspace_id, product_id, formula_id, job_type, status, script, metadata, created_at, updated_at)
        VALUES (${job.batch_id}, ${job.workspace_id}, ${job.product_id}, ${job.formula_id}, 'batch_video', 'queued', ${job.script}, ${JSON.parse(JSON.stringify({
          footageUrl: result.url,
          extendMode: meta.extendMode ?? "none",
          overlayTemplate: meta.overlayTemplate ?? null,
          overlayBlocks: meta.overlayBlocks ?? null,
          overlayFontSize: meta.overlayFontSize ?? null,
          overlayLayout: meta.overlayLayout ?? null,
        }))}, now(), now())
      `;
    }
    console.log(
      `[video-worker] footage done job=${job.id} engine=${result.engine} dryRun=${result.dryRun}`
    );
  } catch (error) {
    const message =
      error instanceof MissingKeyError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`[video-worker] footage failed job=${job.id}: ${message}`);
    await failWithRetry(job, message, maxRetries);
  }
}
