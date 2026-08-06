/**
 * Video Studio presets — motion presets (Higgsfield ports), scene presets,
 * and category buckets. Static code constants; system formulas reference them
 * by name.
 */

export type MotionPreset = {
  id: string;
  label: string;
  /** Sentence appended to the scene prompt to drive the camera move. */
  prompt: string;
};

export const MOTION_PRESETS: MotionPreset[] = [
  {
    id: "none",
    label: "Static / none",
    prompt: "",
  },
  {
    id: "orbit360",
    label: "Orbit 360",
    prompt:
      "camera orbits 360 degrees around the product, slowly and smoothly, product stays centered",
  },
  {
    id: "floatSpin",
    label: "Float Spin",
    prompt:
      "product floats gently and rotates, soft ambient light, subtle parallax depth",
  },
  {
    id: "earthZoom",
    label: "Earth Zoom",
    prompt:
      "dramatic zoom-in from a wide establishing shot to a tight close-up on the product",
  },
  {
    id: "cardboardCutout",
    label: "Cardboard Cutout",
    prompt:
      "flat cutout look, product slides and bounces on a clean studio backdrop",
  },
  {
    id: "iceStatue",
    label: "Ice Statue",
    prompt:
      "product materializes like a frozen statue with a shimmering reveal, cinematic light",
  },
  {
    id: "elevate",
    label: "Elevate",
    prompt:
      "camera rises from below the product to an elevated angle, dramatic and premium",
  },
  {
    id: "blueDepth",
    label: "Blue Depth",
    prompt:
      "deep blue gradient backdrop with volumetric light, product slowly rotates in depth",
  },
];

export const SCENE_PRESETS: { id: string; label: string; prompt: string }[] = [
  { id: "patio", label: "Patio scene", prompt: "sunlit patio scene, warm golden hour light" },
  { id: "farmhouse", label: "Modern farmhouse kitchen", prompt: "modern farmhouse kitchen, soft daylight" },
  { id: "bedroom", label: "Bedroom flat lay", prompt: "cozy bedroom flat lay, neutral tones" },
  { id: "tech-desk", label: "Tech desk setup", prompt: "clean tech desk setup, soft studio light" },
  { id: "studio", label: "Clean studio", prompt: "clean minimal studio backdrop, soft shadows" },
  { id: "shelf", label: "Retail shelf", prompt: "retail shelf display, bright even lighting" },
  { id: "bath", label: "Bathroom spa", prompt: "spa bathroom scene, steam and candles" },
  { id: "custom", label: "Custom prompt", prompt: "" },
];

/** Naive category buckets used to fill {category} and pick default scene presets. */
export const CATEGORY_BUCKETS: { keywords: string[]; category: string; scene: string }[] = [
  { keywords: ["sofa", "chair", "table", "furniture", "lamp", "bed", "desk"], category: "furniture", scene: "farmhouse" },
  { keywords: ["home", "kitchen", "cookware", "decor", "candle", "throw"], category: "home", scene: "farmhouse" },
  { keywords: ["beauty", "skincare", "serum", "makeup", "cream", "hair"], category: "beauty", scene: "bath" },
  { keywords: ["tech", "gadget", "phone", "charger", "earbuds", "camera"], category: "tech", scene: "tech-desk" },
  { keywords: ["wear", "shirt", "hoodie", "jacket", "sneaker", "shoe"], category: "fashion", scene: "studio" },
];

export function guessCategory(text: string): { category: string; scene: string } {
  const hay = text.toLowerCase();
  for (const bucket of CATEGORY_BUCKETS) {
    if (bucket.keywords.some((k) => hay.includes(k))) {
      return { category: bucket.category, scene: bucket.scene };
    }
  }
  return { category: "generic", scene: "studio" };
}
