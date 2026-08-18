// Seeds system-level Video Studio data (workspaceId NULL = available to all):
//  - stock voices (OpenAI TTS)
//  - system formulas (BatchBot-proven script structures)
// Idempotent: skips rows whose name already exists.
// Run: node scripts/seed-video-studio.mjs  (reads DATABASE_URL from .env.local)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(\S+)/)[1];
const sql = neon(url);

const voices = [
  { name: "Alloy", provider: "openai_tts", providerVoiceId: "alloy", isCloned: false },
  { name: "Echo", provider: "openai_tts", providerVoiceId: "echo", isCloned: false },
  { name: "Fable", provider: "openai_tts", providerVoiceId: "fable", isCloned: false },
  { name: "Onyx", provider: "openai_tts", providerVoiceId: "onyx", isCloned: false },
  { name: "Nova", provider: "openai_tts", providerVoiceId: "nova", isCloned: false },
  { name: "Shimmer", provider: "openai_tts", providerVoiceId: "shimmer", isCloned: false },
];

// BatchBot-proven structure + the spec's variant hooks.
const formulas = [
  {
    name: "Kitchen Counter Display",
    category: "product",
    scriptTemplate:
      "This {product} is one of those products that looks even better in person. Tap the orange cart to check it out.",
    scenePromptTemplate:
      "Create a polished vertical 9:16 product hero scene for {product}. Place one complete, accurately shaped product prominently in the foreground on a clean light marble kitchen countertop. Use bright soft daylight from a nearby window, a warm neutral modern kitchen background, shallow depth of field, premium commercial food-and-beverage advertising photography, realistic contact shadow and subtle reflections. Face the product toward the camera and preserve its label, logo, colors, proportions, and packaging details exactly. Keep the product large, centered, fully in frame, and sharp, with clean negative space for captions. Do not add extra cans or duplicate products, hands, people, props covering the product, invented text, warped packaging, melted logos, cropped edges, or extreme perspective.",
    motionPreset: "kitchenCounterProduct",
    durationSec: 4,
    quality: "standard",
  },
  {
    name: "TikTok Shop Hook",
    category: "generic",
    scriptTemplate:
      "I just saw the same {product} at the store, but I found mine on TikTok Shop. Let me show you. {features} Tap the orange cart to check it out.",
    scenePromptTemplate: "cinematic {category} scene, warm light, shallow depth of field",
    motionPreset: "orbit360",
    durationSec: 8,
    quality: "standard",
  },
  {
    name: "Price Drop Hook",
    category: "generic",
    scriptTemplate:
      "This was double the price at the store. {features} Grab it before the sale ends — tap the orange cart.",
    scenePromptTemplate: "clean studio backdrop, soft shadows, product centered",
    motionPreset: "earthZoom",
    durationSec: 6,
    quality: "standard",
  },
  {
    name: "Feature Led",
    category: "generic",
    scriptTemplate:
      "Let me show you why everyone's talking about this {product}. {features} Tap the cart to see it for yourself.",
    scenePromptTemplate: "bright retail display lighting, product hero shot",
    motionPreset: "floatSpin",
    durationSec: 6,
    quality: "standard",
  },
  {
    name: "Comparison",
    category: "generic",
    scriptTemplate:
      "Store version vs this: same {product}, way better price here. {features} Check it out on TikTok Shop.",
    scenePromptTemplate: "split-screen product showcase, clean gradient backdrop",
    motionPreset: "cardboardCutout",
    durationSec: 8,
    quality: "standard",
  },
  {
    name: "Massive Sale Urgency",
    category: "generic",
    scriptTemplate:
      "Massive sale on {product} right now. {features} Don't miss it — tap the orange cart.",
    scenePromptTemplate: "bold colorful backdrop, energetic lighting, product rotating",
    motionPreset: "blueDepth",
    durationSec: 6,
    quality: "standard",
  },
];

let added = 0;

for (const v of voices) {
  const exists = await sql`SELECT id FROM voices WHERE name = ${v.name} AND workspace_id IS NULL`;
  if (exists.length === 0) {
    await sql`INSERT INTO voices (name, provider, provider_voice_id, is_cloned) VALUES (${v.name}, ${v.provider}, ${v.providerVoiceId}, ${v.isCloned})`;
    added++;
    console.log("voice +", v.name);
  }
}

for (const f of formulas) {
  const exists = await sql`SELECT id FROM video_formulas WHERE name = ${f.name} AND workspace_id IS NULL`;
  if (exists.length === 0) {
    await sql`INSERT INTO video_formulas (name, category, script_template, scene_prompt_template, motion_preset, duration_sec, quality, is_system)
      VALUES (${f.name}, ${f.category}, ${f.scriptTemplate}, ${f.scenePromptTemplate}, ${f.motionPreset}, ${f.durationSec}, ${f.quality}, true)`;
    added++;
    console.log("formula +", f.name);
  }
}

console.log(`done. added ${added} rows (0 = already seeded).`);
