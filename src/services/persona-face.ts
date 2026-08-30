/**
 * Persona face generation — Nano Banana (Gemini 2.5 Flash Image) text-to-image
 * for AI influencer faces. App-side (GEMINI_API_KEY + Blob live in the Next
 * env — same key llm.ts uses). Mirrors video-worker/src/providers.ts
 * geminiImageEdit, but text-only and multi-image.
 *
 * Cost: ~$0.04–0.08/img (1K resolution, billed via the AI Pro subscription).
 * Each generation is recorded as an ai_generations row with the media price
 * in result.costUsd so spend stays visible in cost rollups.
 */

import { MEDIA_PRICING } from "@/lib/usage-core";
import { blobToken } from "@/lib/blob-token";

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export type PersonaFaceGenResult = {
  urls: string[];
  costUsd: number;
};

/** One text-only image call → private Blob URL. */
async function generateFaceImage(
  description: string,
  key: string,
  seedHint: string
): Promise<string> {
  const gen = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${description}\n\nPhotorealistic vertical portrait, natural skin texture, consistent facial identity across shots, neutral studio lighting, shallow depth of field, TikTok Shop creator UGC style. Keep the face centered, shoulders up, sharp eyes. No text, no watermark, no distortions. Variation pass: ${seedHint}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "9:16", imageSize: "1K" },
        },
      }),
    }
  );
  if (!gen.ok) {
    throw new Error(`gemini face image failed: ${gen.status} ${(await gen.text()).slice(0, 200)}`);
  }

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
  if (!part) throw new Error("gemini face image: empty response");

  if (part.fileData?.fileUri) return part.fileData.fileUri;

  if (part.inlineData?.data) {
    const { put } = await import("@vercel/blob");
    const imgBuf = Buffer.from(part.inlineData.data, "base64");
    const { url } = await put(`persona-faces/${seedHint}-${Date.now()}.png`, imgBuf, {
      access: "private",
      contentType: part.inlineData.mimeType ?? "image/png",
      token: blobToken(),
    });
    return url;
  }
  throw new Error("gemini face image: no image in response");
}

/**
 * Generates `count` (1–5, default 3) Nano Banana face images from a text
 * description. Returns private Blob URLs + the estimated media cost.
 */
export async function generatePersonaFaces(
  description: string,
  count: number,
  ctx: { workspaceId: string; userId: string }
): Promise<PersonaFaceGenResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");

  const n = Math.min(Math.max(count || 3, 1), 5);
  const variations = [
    "frontal, looking at camera",
    "three-quarter angle, soft smile",
    "looking slightly away, candid",
    "bright natural light, smiling",
    "evening indoor light, relaxed",
  ];

  const urls: string[] = [];
  const errors: string[] = [];
  for (let i = 0; i < n; i++) {
    try {
      const url = await generateFaceImage(description, key, `${ctx.userId.slice(0, 8)}-${i}-${variations[i % variations.length].replace(/\W+/g, "-").slice(0, 24)}`);
      urls.push(url);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (urls.length === 0) {
    throw new Error(`face generation failed: ${errors.join(" | ")}`);
  }

  const costUsd = urls.length * MEDIA_PRICING.sceneImageUsd;
  return { urls, costUsd };
}
