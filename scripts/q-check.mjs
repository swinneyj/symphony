import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
async function main() {
  const [f] = await sql`SELECT id, name, scene_prompt_template FROM video_formulas WHERE id = 'eaa8bdb9-0918-480f-a6df-2c3560ca735e'`;
  console.log(JSON.stringify(f, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
