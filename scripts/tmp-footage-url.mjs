import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT metadata FROM video_batch_jobs WHERE batch_id='7ee9810e-2b8d-4cd3-8e57-5a6f33ca422a' AND job_type='batch_video'`;
const m = JSON.parse(rows[0].metadata);
console.log("footageUrl:", m.footageUrl);
