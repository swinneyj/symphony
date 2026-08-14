// Verify sync results: durations/quality/boomerang/overlay + graph chain integrity
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(\S+)/)[1];
const sql = neon(url);

const rows = await sql`
  SELECT name, duration_sec, quality, boomerang, overlay_template,
         node_graph IS NOT NULL AS has_graph, source_frame, motion_preset
  FROM video_formulas
  WHERE is_system = true AND category = 'batchbot'
  ORDER BY name
`;
let graphs = 0, reverse = 0, overlays = 0, pro = 0;
for (const r of rows) {
  if (r.has_graph) graphs++;
  if (r.boomerang) reverse++;
  if (r.overlay_template) overlays++;
  if (r.quality === "pro") pro++;
  console.log(
    `${r.name.padEnd(42)} dur=${String(r.duration_sec).padEnd(3)} q=${String(r.quality).padEnd(8)} boom=${r.boomerang ? "Y" : "n"} graph=${r.has_graph ? "Y" : "n"} | ${r.overlay_template ?? ""}`
  );
}
console.log(`\nTOTAL=${rows.length} graphs=${graphs} reverse=${reverse} overlays=${overlays} pro=${pro}`);

// Spot-check: Problem vs Fix graph structure
const [pf] = await sql`SELECT node_graph FROM video_formulas WHERE name = 'Problem vs Fix'`;
const g = typeof pf.node_graph === "string" ? JSON.parse(pf.node_graph) : pf.node_graph;
console.log("\nProblem vs Fix graph:", JSON.stringify(g, null, 1).slice(0, 1400));
