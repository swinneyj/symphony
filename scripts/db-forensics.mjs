import "dotenv/config";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT pid, usename, application_name, client_addr, state,
         state_change, now() - state_change AS state_age,
         now() - query_start AS query_age,
         left(query, 100) AS query
  FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid()
  ORDER BY state_age DESC NULLS LAST
  LIMIT 30
`;
console.log("=== SESSIONS ===");
for (const r of rows) {
  console.log(
    `pid=${r.pid} user=${r.usename} app=${r.application_name ?? "-"} state=${r.state} ` +
    `state_age=${r.state_age ?? "-"} query_age=${r.query_age ?? "-"}\n   q: ${r.query ?? "-"}`
  );
}
console.log("\n=== STATE COUNTS ===");
const counts = await sql`SELECT state, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY state ORDER BY count(*) DESC`;
console.table(counts);
process.exit(0);
