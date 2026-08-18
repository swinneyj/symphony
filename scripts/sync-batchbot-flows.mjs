// Sync BatchBot formula flows into Symphony's system formulas.
// Reads the 24 BatchBot official formula graphs (extracted live from the
// authenticated /api/formulas/<id> endpoints) and writes each flow's real
// parameters into video_formulas: duration_sec, quality, boomerang,
// overlay_template, and a translated node_graph (Symphony vocabulary:
// product → sceneRender → footage → script → voice → overlay → boomerang → output).
//
// Mapping rules:
//   ai_video.durationSeconds      → duration_sec            (multi-shot: max)
//   ai_video.resolution 480p      → quality "standard" (720p out)
//   ai_video.resolution 720p      → quality "pro"      (1080p out)
//   composition.reversePlayback   → boomerang = true
//   text_overlay.previewText      → overlay_template (@product → {product})
//   description                   → scene_prompt_template (kept if already set)
//   avatar/choice/real_video      → captured in node_graph meta + scene prompt note
//
// Idempotent: updates by name (workspace_id IS NULL, is_system = true);
// inserts when missing. Run: node scripts/sync-batchbot-flows.mjs
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(\S+)/)[1];
const sql = neon(url);

// ---------------------------------------------------------------------------
// Canonical flow data — extracted 2026-08-13 from BatchBot (jay trial session).
// overlay: null = keep the overlay node in the graph but no burned CTA.
// ---------------------------------------------------------------------------
const FLOWS = [
  { name: "Furniture AI", bbId: "ab7ffa6d-ec5b-4f0f-a980-cdfea4720d0b",
    desc: "Uses product description. Works best with furniture.",
    dur: 7, quality: "standard", reverse: false, overlay: null,
    note: "2 AI image stills → 2 AI video shots (5s + 7s). No text overlay." },
  { name: "Standard BOF", bbId: "26a27742-f976-48c3-9f33-8dd447d32a33",
    desc: "A generic BOF video of holding the product and showing it on a kitchen counter",
    dur: 4, quality: "standard", reverse: false, overlay: null,
    note: "2 AI video shots (4s each) + editable top caption (example: 'Product benefit here')." },
  { name: "Beauty UGC", bbId: "a1812646-cc53-46cb-b2f9-d761c92b607e",
    desc: "Creates a classic UGC makeup video style",
    dur: 15, quality: "standard", reverse: false, overlay: null,
    note: "Presenter avatar + Talking/No-Talking choice. 15s AI video." },
  { name: "Clothing UGC", bbId: "1b3f2687-4a26-43a0-84d4-13acf5407ce2",
    desc: "Creates a classic UGC clothing video style",
    dur: 15, quality: "standard", reverse: false, overlay: null,
    note: "Presenter avatar. 15s AI video." },
  { name: "Warehouse Showcase", bbId: "45c12036-7c28-4876-9139-94790c811f43",
    desc: "Video of your product in a warehouse setting.",
    dur: 8, quality: "pro", reverse: false, overlay: null,
    note: "720p tier. 8s AI video." },
  { name: "Shoe In Car Display", bbId: "d6c95f60-fdc1-442d-a39d-7d65478b0295",
    desc: "Only works for shoes. Works best for women's footwear. Product description needed.",
    dur: 5, quality: "standard", reverse: false, overlay: null,
    note: "2 AI video shots (5s each)." },
  { name: "Unboxing UGC", bbId: "953e811d-791e-42e3-9c71-50a6faa87d50",
    desc: "Creates a hands-only makeup bundle unboxing UGC video",
    dur: 15, quality: "pro", reverse: false, overlay: null,
    note: "720p tier. 15s AI video, hands-only unboxing." },
  { name: "Problem vs Fix", bbId: "463bd5ae-b1ff-4807-bb51-a828a95619dc",
    desc: "Shows a series of images, then cuts to the product",
    dur: 4, quality: "standard", reverse: false, overlay: "my biggest insecurity...",
    note: "User uploads reference image → 4s AI video → 2 stacked captions (hook + 'and what ACTUALLY fixed it')." },
  { name: "Ice Block Reveal", bbId: "f443270c-7316-44c0-ad29-71e6a436dfc9",
    desc: "Shows your clothing product frozen in an ice block.",
    dur: 10, quality: "standard", reverse: false, overlay: null,
    note: "AI image (product frozen in ice) → 10s AI video." },
  { name: "T-Shirt at the Store", bbId: "6099a025-1f14-416a-9f4e-6bf1490b5fc5",
    desc: "Great for showing off funny shits in a grocery store",
    dur: 6, quality: "pro", reverse: false, overlay: null,
    note: "720p tier. AI image → 6s AI video + editable top caption (empty by default)." },
  { name: "Viral Intro Clips", bbId: "7a73361d-ce35-4732-a16a-72abbe0f8dc4",
    desc: "Browse a selection of viral intro clips that can smoothly edit into your video.",
    dur: 6, quality: "standard", reverse: false, overlay: null,
    note: "REAL-CLIP formula (51 preset intro clips + user clip) → composition. Not AI-generated." },
  { name: "Overlay Studio", bbId: "2b8ffa11-f45e-49e9-b633-4bd285aa71fa",
    desc: "Upload multiple clips, pick one overlay, get many outputs.",
    dur: 6, quality: "standard", reverse: false, overlay: null,
    note: "REAL-CLIP formula. User clip + 1 of 12 caption presets (POV Relief Hook, Save This, etc.)." },
  { name: "Clothing Mirror Showcase", bbId: "ea063e8e-c54e-4f7f-b8d8-68626dc880bc",
    desc: "Your clothing product on the avatar in a mirror",
    dur: 4, quality: "pro", reverse: false, overlay: null,
    note: "720p tier. Avatar mirror shot: AI image → 4s AI video." },
  { name: "Store Display", bbId: "045cd02a-0b2e-44d5-95b8-8b2bf71130f7",
    desc: "Shows your product at the store",
    dur: 4, quality: "standard", reverse: true, overlay: "{product} is back! Tap the orange cart to see if you have coupons at checkout!",
    note: "AI image → 4s AI video + top caption + reverse playback." },
  { name: "Shoe POV Look-Down", bbId: "b6db9784-632f-43ea-b66c-5585c2518f53",
    desc: "First-person POV video looking down at your shoes",
    dur: 10, quality: "standard", reverse: false, overlay: null,
    note: "10s AI video, first-person POV." },
  { name: "Retail Endcap Display", bbId: "7639bff5-e904-4dd6-9cac-aac883fc5c77",
    desc: "Put any product on a realistic big-box store endcap for TikTok Shop. Adjustable length, reverse playback, and a fully editable bottom-of-funnel caption hook. Just swap in your product.",
    dur: 4, quality: "standard", reverse: true, overlay: "POV: you just found your new {product} essential",
    note: "4s AI video + caption + reverse playback." },
  { name: "Better Warehouse", bbId: "f2796912-63b4-45b8-b3d6-4656d5f18e4e",
    desc: "A cheaper and better alternative to the popular warehouse prompt.",
    dur: 4, quality: "standard", reverse: true, overlay: "if u were gonna buy the {product}... check the orange cart before they change the price 😭",
    note: "AI image → 4s AI video + caption + reverse playback. NEW formula (not previously imported)." },
  { name: "Driving POV Product Transition", bbId: "74704c77-166f-40f9-9f30-13afb26e66c3",
    desc: "The ad opens with a realistic first-person POV of a car driving through traffic, then smoothly transitions to a close-up of the product being held in the person's hand.",
    dur: 4, quality: "standard", reverse: false, overlay: "Dont forget, the {product} is violently discounted rn 😭🍯✨",
    note: "2 shots (4s driving POV + 4s hand hold) + top caption." },
  { name: "Cleaning Product Demo", bbId: "20f95096-f7d9-48f2-8446-8b803e8308de",
    desc: "Probe formula for the cleaning/restoration cluster. Private draft.",
    dur: 15, quality: "pro", reverse: false, overlay: null,
    note: "720p tier. 15s AI demo video." },
  { name: "Try-On (No Face) — Women", bbId: "c13eecf8-bf53-42b4-bec2-0a795169377e",
    desc: "No-face clothing try-on video. Pulls the product from your library, generates a person wearing the item (cropped shoulders-down, no face), and does a lively full turn to show fit, drape, and movement. Adjustable length and reverse playback. Vertical 9:16.",
    dur: 10, quality: "standard", reverse: false, overlay: null,
    note: "No-face avatar try-on, 10s AI video, editable top caption (empty by default)." },
  { name: "Big-Box Endcap Display (Supercenter Style)", bbId: "8efe123b-38a5-47be-9cdd-08e774ec3b0a",
    desc: "big box endcap display",
    dur: 6, quality: "standard", reverse: true, overlay: "POV: you just found your new {product} essential",
    note: "6s AI video + caption + reverse playback." },
  { name: "Kitchen Counter Display", bbId: "bde44b04-48e9-4f68-ab98-e2539bc7521b",
    desc: "Works best with smaller product health, shoes and little gaggets.",
    dur: 4, quality: "standard", reverse: true, overlay: "{product}",
    note: "AI image → 4s AI video + product-name caption + reverse playback." },
  { name: "Handheld Product Voiceover", bbId: "0ca57d0c-daa2-474a-977c-d3aa81a5c91c",
    desc: "Faceless bottom-of-funnel product demo with a photorealistic handheld product showcase, automatically generated product voiceover, optional caption hook, and native spoken audio.",
    dur: 8, quality: "standard", reverse: false, overlay: null,
    note: "8s AI video + auto voiceover + editable caption (example: 'tartellete tubing mascara')." },
  { name: "Scroll-Stopper Steal", bbId: "47835b15-1849-4dbf-957c-b90cf5d5e27e",
    desc: "TikTok-Shop style faceless product ad formula with selectable product and presenter avatar, silent three-beat Seedance video, editable bold top caption, composition, and output.",
    dur: 9, quality: "standard", reverse: false, overlay: "who else stocked up on {product} because it was on a crazy sale today?",
    note: "Presenter avatar, 9s silent AI video + bold top caption." },
  // ---- Community formulas (12) — present on the public library page ----
  { name: "Store Mannequin", bbId: "b1d5a953-6ba5-44e5-8fda-e1b2db66fdac",
    desc: "Shows clothing on a store mannequin",
    dur: 5, quality: "standard", reverse: true, overlay: null,
    note: "AI image (mannequin display) → 5s AI video + reverse playback. Editable caption (empty by default)." },
  { name: "Cozy Shoe Reveal", bbId: "da3638f9-8d30-4824-9ee9-e9ddf2e6e6eb",
    desc: "Hand-held shoe reveal styled at home",
    dur: 6, quality: "standard", reverse: true, overlay: "I'm so sorry to those that already got the {product} because it's so affordable now",
    note: "6s AI video + caption + reverse playback." },
  { name: "Outfit Check", bbId: "18995b0b-2b32-4e6e-a308-71d0257acd19",
    desc: "Turn any clothing product photo into an authentic, faceless TikTok-style outfit check video — the item shown on a person walking toward the camera to show the fit, fabric, and drape. Just add your product, caption, and go.",
    dur: 10, quality: "standard", reverse: false, overlay: null,
    note: "No-face outfit check, 10s AI video, editable top caption (empty by default)." },
  { name: "Try-On (No Face)", bbId: "ddb04551-fef2-43e6-b33f-4c0fc4b4532b",
    desc: "No-face clothing try-on video. Pulls the product from your library, generates a person wearing the item (cropped shoulders-down, no face), and does a lively full turn to show fit, drape, and movement. Adjustable length and reverse playback. Vertical 9:16.",
    dur: 5, quality: "standard", reverse: true, overlay: null,
    note: "No-face avatar try-on, 5s AI video + reverse playback, editable caption." },
  { name: "Doorstep Unboxing", bbId: "5612e13b-fc04-4987-a268-3f0dfa59e1aa",
    desc: "Realistic AI doorstep unboxing video with on-screen TikTok-style captions and adjustable length — just add your product.",
    dur: 8, quality: "standard", reverse: false, overlay: null,
    note: "AI image → 8s AI video + editable top caption (empty by default)." },
  { name: "Shoe in Mirror", bbId: "1e3fa7b2-0a4e-4ede-86b7-2547801d5814",
    desc: "Female holding shoe and standing in front of mirror",
    dur: 4, quality: "standard", reverse: true, overlay: null,
    note: "AI image (mirror hold) → 4s AI video + reverse playback." },
  { name: "Handbag in Car", bbId: "9d9ded14-770c-4ffb-bdc1-1f3743acb08c",
    desc: "A handbag being held in a luxury car",
    dur: 4, quality: "standard", reverse: true, overlay: null,
    note: "4s AI video + reverse playback." },
  { name: "Purse & Coffee", bbId: "ae26e2ff-8adc-4f67-9fa0-54453984039a",
    desc: "Hangbag next to coffee and cinnamon roll in a luxe city environment",
    dur: 4, quality: "standard", reverse: true, overlay: null,
    note: "AI image → 4s AI video + reverse playback." },
  { name: "Themed Press-On Nails Detail Showcase", bbId: "8138f096-eeaa-47eb-816b-1b3cbd764031",
    desc: "A product-only vertical UGC formula where the selected product photo supplies the nail and hand reference, the product description is interpreted into its underlying real-world theme for the background setting, and the generated image flows into a slow, elegant hand-detail showcase video.",
    dur: 4, quality: "standard", reverse: true, overlay: null,
    note: "4s AI video + reverse playback, product photo = nail/hand reference." },
  { name: "Bathroom Counter Push-In", bbId: "cabb7e90-9ee9-4dfd-9ac1-c741f970da05",
    desc: "Generates realistic handheld iPhone-style bathroom-counter product footage with an optional run-time reverse playback setting.",
    dur: 6, quality: "standard", reverse: false, overlay: "{product} is finally back in stock! click the orange cart to see if you have coupons",
    note: "6s handheld AI video + caption." },
  { name: "Retail Shelf", bbId: "d3b090b3-e993-4413-97ba-d7d0d6211b72",
    desc: "retail shelf with timer",
    dur: 6, quality: "standard", reverse: true, overlay: "sorry if you paid full price — this detox is finally on sale",
    note: "6s AI video + caption + reverse playback." },
  { name: "Faceless Supplement Demo", bbId: "563e9219-c66e-4272-9bdb-1afdf9265694",
    desc: "with voiceover",
    dur: 11, quality: "standard", reverse: false, overlay: "{product} is back! tap the orange cart to see if you have any coupons.",
    note: "AI image → 11s AI video + voiceover + caption." },
];

// ---------------------------------------------------------------------------
// Build a Symphony-vocabulary node graph (linear chain) from a flow spec.
// ---------------------------------------------------------------------------
function promptFor(f) {
  const n = f.name.toLowerCase();
  let setting = "a premium, realistic commercial product scene";
  let action = "Keep the product large, centered, sharp, fully in frame, and facing the camera.";
  if (n.includes("warehouse")) setting = "a realistic organized warehouse aisle with dramatic practical lighting";
  else if (n.includes("shelf") || n.includes("endcap") || n.includes("store display")) setting = "a realistic big-box retail shelf or endcap with believable store lighting";
  else if (n.includes("kitchen") || n.includes("counter") || n.includes("bathroom")) setting = "a realistic, clean lifestyle countertop with soft window light and shallow depth of field";
  else if (n.includes("car") || n.includes("driving")) setting = "a realistic luxury car interior or first-person driving scene";
  else if (n.includes("shoe")) setting = "a realistic lifestyle footwear scene with natural perspective and believable ground contact";
  else if (n.includes("try-on") || n.includes("outfit") || n.includes("clothing mirror")) {
    setting = "a realistic faceless fashion try-on scene, cropped below the face";
    action = "Show fit, drape, fabric texture, and movement while keeping the garment construction and pattern unchanged.";
  } else if (n.includes("unbox")) {
    setting = "a realistic hands-only unboxing scene on a clean home surface";
    action = "Show careful hands opening and presenting the product without covering its important details.";
  } else if (n.includes("purse") || n.includes("handbag")) setting = "a premium lifestyle scene with the bag in a luxury car or elegant city café setting";
  else if (n.includes("nail")) setting = "a clean, elegant beauty close-up focused on the hand and nail product theme";
  return `Create a polished vertical 9:16 TikTok Shop product video for {product}. Use ${setting}. ${action} Preserve the product's exact shape, label, logo, colors, proportions, and packaging details. Do not invent text, alter branding, duplicate the product, add extra limbs or people, melt or warp the product, crop the product, or let props obscure it. ${f.desc}`;
}

function buildGraph(f) {
  const nodes = [];
  const edges = [];
  const add = (type, data, x) => {
    const id = `${type}-${nodes.length + 1}`;
    nodes.push({ id, type, position: { x, y: 120 }, data });
    if (nodes.length > 1) edges.push({ id: `e-${nodes[nodes.length - 2].id}-${id}`, source: nodes[nodes.length - 2].id, target: id });
    return id;
  };
  let x = 80;
  add("product", {}, x); x += 260;
  add("sceneRender", { prompt: promptFor(f) }, x); x += 260;
  add("footage", { durationSec: f.dur, quality: f.quality }, x); x += 260;
  // NOTE: no script node — flattenGraph reads script.scriptTemplate and an
  // empty string would clobber the formula's flat script_template (killing
  // voiceover). The script layer stays on the flat field.
  if (f.overlay) {
    add("overlay", { text: f.overlay }, x); x += 260;
  }
  if (f.reverse) {
    add("boomerang", {}, x); x += 260;
  }
  add("output", {}, x);
  return {
    source: "batchbot",
    sourceFormulaId: f.bbId,
    flowNote: f.note,
    nodes,
    edges,
  };
}

let updated = 0, inserted = 0, skipped = 0;

for (const f of FLOWS) {
  const graph = buildGraph(f);
  const existing = await sql`
    SELECT id, scene_prompt_template FROM video_formulas
    WHERE name = ${f.name} AND workspace_id IS NULL AND is_system = true
    LIMIT 1
  `;
  const scenePrompt = existing[0]?.scene_prompt_template?.length > 220
    ? existing[0].scene_prompt_template
    : promptFor(f);
  const sceneNode = graph.nodes.find((node) => node.type === "sceneRender");
  if (sceneNode) sceneNode.data.prompt = scenePrompt;
  if (existing.length > 0) {
    await sql`
      UPDATE video_formulas SET
        duration_sec = ${f.dur},
        quality = ${f.quality},
        boomerang = ${f.reverse},
        overlay_template = ${f.overlay},
        scene_prompt_template = ${scenePrompt},
        node_graph = ${JSON.stringify(graph)},
        updated_at = now()
      WHERE id = ${existing[0].id}
    `;
    updated++;
    console.log(`~ ${f.name}  (${f.dur}s, ${f.quality}${f.reverse ? ", ↺" : ""}${f.overlay ? `, "${f.overlay.slice(0, 42)}"` : ""})`);
  } else {
    await sql`
      INSERT INTO video_formulas
        (name, category, script_template, scene_prompt_template, source_frame,
         motion_preset, duration_sec, quality, boomerang, overlay_template,
         node_graph, is_system)
      VALUES
        (${f.name}, 'batchbot', ${"Check this out — {product}. {features} Tap the cart to grab it."}, ${scenePrompt}, 'render',
         'none', ${f.dur}, ${f.quality}, ${f.reverse}, ${f.overlay},
         ${JSON.stringify(graph)}, true)
    `;
    inserted++;
    console.log(`+ ${f.name}  (NEW)`);
  }
}

console.log(`\ndone. updated=${updated} inserted=${inserted}`);
