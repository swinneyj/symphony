import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL || "");

const accounts = await sql.query(
  `SELECT sa.id, sa.platform, sa.account_name, sa.account_username, sa.status,
          sa.workspace_id, sa.metadata->'shop'->>'openId' AS shop_open_id
   FROM social_accounts sa
   WHERE sa.platform IN ('tiktok','tiktok_shop')
   ORDER BY sa.platform, sa.account_name`
);

const workspaces = await sql.query(
  `SELECT w.id, w.name, w.created_at
   FROM workspaces w ORDER BY w.created_at DESC`
);

const members = await sql.query(
  `SELECT wm.workspace_id, u.email
   FROM workspace_members wm
   JOIN users u ON u.id = wm.user_id
   ORDER BY wm.workspace_id`
);

console.log("TIKTOK ACCOUNTS:", JSON.stringify(accounts, null, 1));
console.log("WORKSPACES:", JSON.stringify(workspaces, null, 1));
console.log("MEMBERS:", JSON.stringify(members, null, 1));
