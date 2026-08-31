import { put } from "@vercel/blob";
import { sql, type JobRow, markDone, failWithRetry } from "../db.js";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB cap on source images
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * product_process pipeline:
 *  1. load product row
 *  2. download original image (from original_image_url)
 *  3. [Phase 2] rembg background removal + 9:16 canvas + upscale
 *  4. upload result to Vercel Blob (public URL)
 *  5. update product -> processed_image_url set, status 'ready'
 *  6. mark job done
 */
export async function handleProductProcess(job: JobRow, maxRetries: number) {
  try {
    const productId = job.product_id;
    if (!productId) throw new Error("job has no product_id");

    const [product] = (await sql`
      SELECT id, workspace_id, name, original_image_url
      FROM products WHERE id = ${productId}
    `) as unknown as {
      id: string;
      workspace_id: string;
      name: string;
      original_image_url: string | null;
    }[];

    if (!product) throw new Error(`product ${productId} not found`);
    if (!product.original_image_url) {
      throw new Error(`product ${productId} has no original_image_url`);
    }

    const image = await downloadImage(product.original_image_url);
    if (!image) throw new Error("failed to download original image");

    // Upload the source image as the processed asset for now. Phase 2 swaps
    // `image.buffer` for the rembg/9:16-processed buffer before this line.
    const ext = image.ext;
    const blob = await put(
      `products/${product.workspace_id}/${productId}/processed-${Date.now()}.${ext}`,
      image.buffer,
      {
        access: "private",
        contentType: image.contentType,
        addRandomSuffix: false,
      }
    );

    await sql`
      UPDATE products
      SET processed_image_url = ${blob.url}, status = 'ready', updated_at = now()
      WHERE id = ${productId}
    `;

    await markDone(job.id, { thumbnail_url: blob.url });
    console.log(
      `[product_process] done: product=${productId} url=${blob.url}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[product_process] failed: job=${job.id} ${message}`);
    await failWithRetry(job, message, maxRetries);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function downloadImage(
  url: string
): Promise<{ buffer: Buffer; ext: string; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { "user-agent": "SymphonyVideoWorker/0.1" },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      throw new Error(`not an image (content-type: ${contentType})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(
        `image too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB > 25 MB)`
      );
    }

    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";

    return { buffer, ext, contentType };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("not an image")) {
      throw error;
    }
    return null;
  }
}
