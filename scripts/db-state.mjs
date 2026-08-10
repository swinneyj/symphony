import { neon } from "@neondatabase/serverless";
import "dotenv/config";

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'social_accounts' ORDER BY ordinal_position`;
  console.log("COLS:", cols.map((c) => c.column_name).join(", "));
  const rows = await sql`SELECT account_name, status, token_expires_at FROM social_accounts WHERE workspace_id = '959993d8-8b55-44f2-bef1-abded19934de' AND platform = 'tiktok'`;
  console.log("ROW:", JSON.stringify(rows));
}
main();
