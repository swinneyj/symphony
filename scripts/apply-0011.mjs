// One-off migration runner: applies migrations/0011_llm_usage.sql to the live DB.
import fs from "fs";
import { neon } from "@neondatabase/serverless";

const env = fs.readFileSync(".env.local", "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}
const sqlText = fs.readFileSync("migrations/0011_llm_usage.sql", "utf8");

(async () => {
  const sql = neon(m[1].trim());
  // The migration file has multiple statements — run them one by one.
  const statements = sqlText
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await sql.query(stmt);
  }
  // Verify the table exists.
  const rows = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'llm_usage'");
  console.log("migration applied; llm_usage table:", rows.length === 1 ? "EXISTS" : "MISSING");
  const cols = await sql.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'llm_usage' ORDER BY ordinal_position"
  );
  console.log("columns:", cols.map((c) => c.column_name).join(", "));
})().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
