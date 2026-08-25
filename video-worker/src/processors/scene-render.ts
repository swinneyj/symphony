import { sql, markDone, failWithRetry, updateBatchProgress, type JobRow } from "../db.js";
import { generateSceneImage } from "../providers.js";

/**
 * scene_render job: AI re-render of the product into an ORIGINAL scene (spec §10).
 *
 * Compliance: brand-owned listing photos must never become the video's first
 * frame (TikTok Shop copyright violations). This job re-creates the product in
 * a custom scene — input image is used ONLY as a scale/dimension reference.
 *
 * Flow:
 *   source_frame='render'  → generate scene image → job.scene_image_url + product.scene_image_url
 *   source_frame='original' → passthrough (user's own photography; scene url = processed image)
 *   then chain the footage job with metadata { sourceFrame, sceneImageUrl } so
 *   the video is generated from the RENDERED frame, not the listing photo.
 */
export async function handleSceneRender(job: JobRow, maxRetries: number): Promise<void> {
  try {
    const [product] = await sql`
      SELECT id, name, original_image_url, processed_image_url, regenerated_image_url\n      FROM products WHERE id = ${job.product_id}\n    `;
    if (!product) {
      await failWithRetry(job, `product ${job.product_id} not found`, maxRetries);
      return;
    }

    const [formula] = await sql`
      SELECT scene_prompt_template, source_frame, quality
      FROM video_formulas WHERE id = ${job.formula_id}
    `;

    const sourceFrame = formula?.source_frame ?? "render";
    const imageUrl = product.processed_image_url ?? product.original_image_url;
    if (!imageUrl) {
      await failWithRetry(job, `product ${product.name} has no image (run product processing first)`, maxRetries);
      return;
    }

    let sceneUrl = product.regenerated_image_url ?? imageUrl;
    let dryRun = false;
    if (sourceFrame === "render" && !product.regenerated_image_url) {
      // Graph/run-view scene prompt override wins over the formula row.

      const jobMeta = (job.metadata ?? {}) as {
        scenePromptTemplate?: string;
        quality?: string;
        durationSec?: number;
        videoEngine?: string;
        overlayBlocks?: string[];
        overlayLayout?: unknown;
        overlayTemplate?: string;
        overlayFontSize?: number;
        extendMode?: string;
        tiktokAccountId?: string;
        imageResolution?: string;
        motionPreset?: string;
      };
      const scenePromptTemplate = jobMeta.scenePromptTemplate ?? formula?.scene_prompt_template ?? null;
      const prompt = [
        "Only use the attached image as a reference for the scale and dimension of the products.",
        scenePromptTemplate?.trim() ||
          "Place the product on a clean neutral table with soft natural lighting.",
        "Keep all product details, text, and logos identical.",
      ].join(" ");
      const result = await generateSceneImage({
        imageUrl,
        prompt,
        quality: (jobMeta.quality ?? formula?.quality ?? "standard") === "pro" ? "pro" : "standard",
      });
      sceneUrl = result.url;
      dryRun = result.dryRun;
      // Store on the product too — the UI can preview the render before a batch is approved.
      await sql`
        UPDATE products SET scene_image_url = ${sceneUrl}, updated_at = now()
        WHERE id = ${product.id}
      `;
    }

    await markDone(job.id, { scene_image_url: sceneUrl });
    if (job.batch_id) await updateBatchProgress(job.batch_id);

    // Chain: scene_render done → enqueue footage from the rendered frame.
    // ALL original job metadata is carried forward (overlay blocks, engine,
    // duration, quality, TikTok account, etc.) so run-view overrides survive
    // the chain — plus the rendered scene url becomes the first frame.
    if (job.batch_id) {
      const carriedMeta = { ...(job.metadata ?? {}) };
      delete (carriedMeta as Record<string, unknown>).sourceFrame;
      await sql`
        INSERT INTO video_batch_jobs (batch_id, workspace_id, product_id, formula_id, job_type, status, script, metadata, created_at, updated_at)
        VALUES (${job.batch_id}, ${job.workspace_id}, ${job.product_id}, ${job.formula_id}, 'footage', 'queued', ${job.script},
                ${JSON.stringify({ ...carriedMeta, sourceFrame, sceneImageUrl: sceneUrl })}, now(), now())
      `;
    }
    console.log(
      `[video-worker] scene_render done job=${job.id} sourceFrame=${sourceFrame} dryRun=${dryRun}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[video-worker] scene_render failed job=${job.id}: ${message}`);
    await failWithRetry(job, message, maxRetries);
  }
}
