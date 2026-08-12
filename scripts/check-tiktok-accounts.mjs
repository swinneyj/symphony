import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL || "");
const rows = await sql.query(
  "SELECT platform, platform_account_id, account_name, account_username, status, metadata, token_expires_at FROM social_accounts WHERE platform IN ('tiktok','tiktok_shop') ORDER BY platform, created_at"
);
console.log(JSON.stringify(rows, null, 2));
