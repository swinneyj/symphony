// P1 Facebook posting test — run once a token is available.
// Reads FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN from /opt/data/fb-test.env
// (or env). Posts a test feed item, verifies it, deletes it. Then lists pages.
// Usage: node --env-file=/opt/data/fb-test.env scripts/fb-p1-test.mjs
import { readFileSync } from "node:fs";

const pageId = process.env.FACEBOOK_PAGE_ID;
const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
if (!pageId || !token) {
  console.error("missing FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN (fb-test.env)");
  process.exit(1);
}

// Import the lib via tsx (app is TS). Run with: node --import tsx scripts/fb-p1-test.mjs
const { fetchFacebookPages, facebookPostFeed, deleteFacebookPost } = await import(
  "../src/lib/meta/facebook.ts"
);

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

try {
  const pages = await fetchFacebookPages(token);
  check("token can list pages", pages.some((p) => p.id === pageId), pages.map((p) => p.name).join(", "));

  const { postId } = await facebookPostFeed({
    pageId,
    accessToken: token,
    message: "Symphony integration test — this post will self-delete.",
  });
  check("feed post created", !!postId, `postId=${postId}`);

  await deleteFacebookPost({ postId, accessToken: token });
  check("feed post deleted", true, `postId=${postId}`);
} catch (error) {
  console.error("ERROR:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
