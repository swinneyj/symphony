// Applies migrations/0001_video_studio.sql statement-by-statement
// against DATABASE_URL from .env.local, then verifies the end state.
//
// Channel notes: sql.unsafe() silently no-ops on the Neon pooler endpoint
// (verified Aug 2026), so raw statements go through sql.query(text, []).
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(\S+)/)[1];
const sql = neon(url);

const raw = readFileSync("migrations/0001_video_studio.sql", "utf8");

// Strip comment lines FIRST (splitting on ';' inside a comment mangles it),
// then split into statements.
const statements = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--") && l.trim().length > 0)
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`executing ${statements.length} statements...`);
for (const stmt of statements) {
  try {
    await sql.query(stmt, []);
    console.log("  ok:", stmt.slice(0, 60).replace(/\s+/g, " "));
  } catch (e) {
    console.log("  FAIL:", e.message);
    process.exit(1);
  }
}

// Verify (tagged-template queries — the reliable channel)
const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('products','voices','video_formulas','video_batches','video_batch_jobs') ORDER BY tablename`;
console.log("\nvideo studio tables:", tables.length === 5 ? "ALL 5 OK" : `MISSING: ${tables.map((t) => t.tablename).join(", ")}`);
const enums = await sql`SELECT t.typname FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid GROUP BY t.typname ORDER BY t.typname`;
const vsEnums = enums.filter((e) => e.typname.startsWith("product_") || e.typname.startsWith("video_"));
console.log("video studio enums:", vsEnums.length === 6 ? "ALL 6 OK" : `MISSING: ${vsEnums.map((e) => e.typname).join(", ")}`);
