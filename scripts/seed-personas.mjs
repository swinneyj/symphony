// Seeds demo AI-influencer personas + one persona-bound formula (M5).
// System-level (workspace_id NULL = visible to every workspace). Faces are
// intentionally NOT seeded — the QA flow generates them via the UI
// (✨ Generate face with AI exercises the M2 route end-to-end).
// Idempotent: skips rows whose name already exists.
// Run: node scripts/seed-personas.mjs  (reads DATABASE_URL from .env.local)
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(\S+)/)[1];
const sql = neon(url);

const personas = [
  {
    name: "Ava",
    description:
      "24-year-old blonde fitness creator, athletic build, bright smile, energetic UGC style, TikTok Shop affiliate",
    personaPrompt: "energetic, authentic, natural daylight, casual creator vibe, fitness lifestyle",
    voiceName: "Nova",
  },
  {
    name: "Marcus",
    description:
      "32-year-old Black male tech and lifestyle creator, clean-shaven, confident but relaxed, warm smile, studio-quality creator look",
    personaPrompt: "confident, measured, warm studio lighting, premium unboxing vibe",
    voiceName: "Onyx",
  },
  {
    name: "Lena",
    description:
      "26-year-old East-Asian beauty and skincare creator, soft features, glowing skin, gentle smile, bright clean aesthetic",
    personaPrompt: "soft, friendly, bright clean lighting, beauty tutorial vibe, dewy skin glow",
    voiceName: "Shimmer",
  },
];

// One system formula demonstrating the persona binding + {persona} script vars.
const personaFormula = {
  name: "Influencer Pitch — Ava",
  category: "generic",
  scriptTemplate:
    "Hey, it's {persona}! I found this {product} and honestly it's better than I expected. {features} {personaStyle} Tap the orange cart to check it out.",
  scenePromptTemplate:
    "The influencer {persona} presents {product} in a bright modern fitness studio, holding the product naturally toward the camera, genuine smile, soft daylight, shallow depth of field, TikTok UGC style",
  motionPreset: "none",
  durationSec: 8,
  quality: "standard",
};

let added = 0;
const userRows = await sql`SELECT id FROM users ORDER BY created_at LIMIT 1`;
const userRow = userRows[0];
if (!userRow) throw new Error("no users in DB — seed personas need a created_by");

for (const p of personas) {
  const exists = await sql`SELECT id FROM personas WHERE name = ${p.name} AND workspace_id IS NULL`;
  if (exists.length > 0) {
    console.log("persona =", p.name, "(exists)");
    continue;
  }
  const [voice] = await sql`SELECT id FROM voices WHERE name = ${p.voiceName} AND workspace_id IS NULL`;
  await sql`INSERT INTO personas (workspace_id, created_by_id, name, description, persona_prompt, voice_id, is_system)
    VALUES (NULL, ${userRow.id}, ${p.name}, ${p.description}, ${p.personaPrompt}, ${voice?.id ?? null}, true)`;
  added++;
  console.log("persona +", p.name, voice ? `(voice ${p.voiceName})` : "(no voice found)");
}

const f = personaFormula;
const existsFormula = await sql`SELECT id FROM video_formulas WHERE name = ${f.name} AND workspace_id IS NULL`;
if (existsFormula.length === 0) {
  const [ava] = await sql`SELECT id FROM personas WHERE name = 'Ava' AND workspace_id IS NULL`;
  await sql`INSERT INTO video_formulas (name, category, script_template, scene_prompt_template, motion_preset, duration_sec, quality, is_system, persona_id)
    VALUES (${f.name}, ${f.category}, ${f.scriptTemplate}, ${f.scenePromptTemplate}, ${f.motionPreset}, ${f.durationSec}, ${f.quality}, true, ${ava?.id ?? null})`;
  added++;
  console.log("formula +", f.name);
} else {
  console.log("formula =", f.name, "(exists)");
}

console.log(`done. added ${added} rows (0 = already seeded).`);
