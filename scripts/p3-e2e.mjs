// P3 cross-post dispatcher E2E — runs against the REAL Facebook page.
// - Seeds social_accounts rows (facebook w/ page-scoped token, instagram w/ user token)
// - Creates a post targeting facebook + instagram
// - publishPostToPlatforms → expects facebook: published, instagram: failed (media gap)
// - Verifies the live FB post via Graph API, deletes it, cleans up DB rows.
//
// Usage: needs FACEBOOK_* / INSTAGRAM_* env (extract from BWS like fb-p1-test),
// then: node --import tsx scripts/p3-e2e.mjs
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("missing DATABASE_URL");
  process.exit(1);
}

const { fetchFacebookPages, deleteFacebookPost } = await import("../src/lib/meta/facebook.ts");
const { publishPostToPlatforms } = await import("../src/lib/publish.ts");

const sql = neon(DATABASE_URL);
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

try {
  // 1. Resolve the page-scoped token (page ops require it).
  const pages = await fetchFacebookPages(process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
  const page = pages.find((p) => p.id === process.env.FACEBOOK_PAGE_ID);
  check("resolved page-scoped token", !!page?.accessToken, page?.name ?? "");

  // 2. Seed social accounts (clean any previous test rows).
  await sql`DELETE FROM social_accounts WHERE account_name = 'p3-e2e'`;
  await sql`INSERT INTO social_accounts (workspace_id, platform, platform_account_id, account_name, access_token, status)
    SELECT id, 'facebook', ${process.env.FACEBOOK_PAGE_ID}, 'p3-e2e', ${page.accessToken}, 'connected' FROM workspaces LIMIT 1`;
  await sql`INSERT INTO social_accounts (workspace_id, platform, platform_account_id, account_name, access_token, status)
    SELECT id, 'instagram', ${process.env.INSTAGRAM_USER_ID}, 'p3-e2e', ${process.env.INSTAGRAM_ACCESS_TOKEN}, 'connected' FROM workspaces LIMIT 1`;
  check("seeded facebook + instagram accounts", true);

  // 3. Create the post (new map convention).
  const [post] = await sql`
    INSERT INTO posts (workspace_id, created_by_id, content, platform_configs, status)
    SELECT id, (SELECT id FROM users LIMIT 1), 'P3 cross-post test — will self-delete.',
           ${JSON.stringify({ facebook: {}, instagram: {} })}, 'draft' FROM workspaces LIMIT 1
    RETURNING id`;
  check("post created", !!post?.id, post?.id);

  // 4. Dispatch.
  const res = await publishPostToPlatforms(post.id);
  check("facebook published", res.results.facebook?.status === "published", `externalId=${res.results.facebook?.externalId}`);
  check("instagram failed (media gap)", res.results.instagram?.status === "failed", res.results.instagram?.error ?? "");
  check("overall status partial (fb ok, ig failed)", res.status === "partial", res.status);

  // 5. Verify the live FB post, then delete it.
  const fbId = res.results.facebook?.externalId;
  if (fbId) {
    const verify = await fetch(
      `https://graph.facebook.com/v21.0/${fbId}?fields=id,message&access_token=${encodeURIComponent(page.accessToken)}`
    );
    const body = await verify.json();
    check("fb post live on page", verify.ok && !!body.id, body.message?.slice(0, 40) ?? "");
    await deleteFacebookPost({ postId: fbId, accessToken: page.accessToken });
    check("fb post deleted", true);
  }

  // 6. Cleanup DB rows.
  await sql`DELETE FROM posts WHERE id = ${post.id}`;
  await sql`DELETE FROM social_accounts WHERE account_name = 'p3-e2e'`;
  check("db rows cleaned", true);
} catch (error) {
  console.error("ERROR:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
