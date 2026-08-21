import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'market_products' ORDER BY ordinal_position`;
console.log("COLS:", cols.map((c) => c.column_name).join(", "));
const counts = await sql`SELECT source, count(*) as n, max(snapshot_date) as latest FROM market_products GROUP BY source`;
console.log("SOURCES:", JSON.stringify(counts));
const any = await sql`SELECT * FROM market_products ORDER BY created_at DESC LIMIT 3`;
console.log("ANY:", JSON.stringify(any));
