import "dotenv/config";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, status, failure_reason, platform_configs FROM posts WHERE id = '51a44cc2-11bb-4435-b37f-53da81c87cec'`;
console.log(JSON.stringify(rows, null, 1));
