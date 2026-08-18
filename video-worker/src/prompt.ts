/**
 * Scene prompt builder: fills the formula's scene prompt template with product
 * data and appends the motion-preset camera sentence (Higgsfield ports).
 */

export const MOTION_PRESETS: Record<string, string> = {
  none: "",
  orbit360: "Slow 360-degree orbit around the product, smooth continuous rotation, product stays centered.",
  floatSpin: "Product floats and spins gently in place, soft studio lighting, subtle shadow below.",
  earthZoom: "Dramatic zoom from a distant view into a tight product close-up, then a slow push-in.",
  cardboardCutout: "Flat cardboard-cutout style animation, slight parallax layers, playful tilt.",
  iceStatue: "Product frozen in a crystalline ice block, camera slowly orbits, frost particles drift.",
  elevate: "Product rises elegantly from below into frame, slow upward drift, premium feel.",
  blueDepth: "Deep blue gradient backdrop, product glides forward through depth of field, cinematic.",
  kitchenCounterProduct:
    "Very slow, subtle commercial product-camera push-in with gentle side-to-side parallax only; the product remains rigid, centered, fully in frame, and readable; no rotation, no deformation, no label changes, no object duplication.",
};

/**
 * Anti-artifact guardrail appended to EVERY scene prompt (2026-08): video
 * models (Kling especially) tend to add micro camera motion / edge warping on
 * near-static shots — the "moving borders" artifact. Explicitly pinning the
 * frame down measurably reduces it. Only the described camera move is allowed.
 */
export const STABLE_FRAME_CLAUSE =
  "Camera moves ONLY as described; do not add any other motion. The frame borders and edges must remain perfectly static and sharp throughout — no zooming, panning, drifting, pulsing, warping, morphing, or shifting at the video edges. Keep the image stable and locked.";

export interface PromptProduct {
  name: string;
  description: string | null;
  price: string | null;
  category?: string | null;
}

export function fillPlaceholders(template: string, product: PromptProduct): string {
  return template
    .replaceAll("{product}", product.name)
    .replaceAll("{price}", product.price ?? "")
    .replaceAll("{store}", "TikTok Shop")
    .replaceAll("{category}", product.category ?? "product");
}

export function buildScenePrompt(opts: {
  scenePromptTemplate: string | null;
  motionPreset: string | null;
  product: PromptProduct;
}): string {
  const base = opts.scenePromptTemplate
    ? fillPlaceholders(opts.scenePromptTemplate, opts.product)
    : `${opts.product.name}, professional product showcase video`;
  const motion = MOTION_PRESETS[opts.motionPreset ?? "none"] ?? "";
  return [base, motion, STABLE_FRAME_CLAUSE].filter(Boolean).join(" ");
}
