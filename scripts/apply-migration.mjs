// Applies a migrations/*.sql file statement-by-statement via sql.query()
// (the ONLY raw-SQL channel that works on the Neon pooler — sql.unsafe
// silently no-ops). Verifies the end state. Usage:
//   node scripts/apply-migration.mjs migrations/0002_market_research.sql
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "migrations/0002_market_research.sql";
const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(\S+)/)?.[1];
if (!url) {
  console.error("FATAL: DATABASE_URL not found in .env.local");
  process.exit(1);
}

const sql = neon(url);
const raw = readFileSync(file, "utf8");

// Strip comment lines BEFORE splitting (splitting first mangles ';' inside comments).
const noComments = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

const statements = noComments
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`executing ${statements.length} statements from ${file}...`);
for (const stmt of statements) {
  try {
    await sql.query(stmt, []);
    console.log(`  ok: ${stmt.slice(0, 60).replace(/\s+/g, " ")}`);
  } catch (error) {
    console.error(`  FAILED: ${stmt.slice(0, 60).replace(/\s+/g, " ")}`);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Verify the tables from the file exist.
const tables = [...raw.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
if (tables.length > 0) {
  const found = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${tables})
  `;
  const foundNames = (found || []).map((r) => r.table_name);
  const missing = tables.filter((t) => !foundNames.includes(t));
  console.log(
    missing.length === 0
      ? `tables OK: ${tables.join(", ")}`
      : `MISSING TABLES: ${missing.join(", ")}`
  );
  if (missing.length > 0) process.exit(1);
}
console.log("done.");
