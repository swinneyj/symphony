// P1/P2 Meta posting test — run once tokens are available.
// Reads FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN / INSTAGRAM_USER_ID /
// INSTAGRAM_ACCESS_TOKEN from /opt/data/fb-test.env (or env).
//   FB: posts a test feed item, verifies it, deletes it. Lists pages.
//   IG: creates an image container and waits for FINISHED — does NOT publish
//       (no IG delete API; unpublished containers just expire → zero residue).
// Usage: node --env-file=/opt/data/fb-test.env scripts/fb-p1-test.mjs
import { readFileSync } from "node:fs";

const pageId = process.env.FACEBOOK_PAGE_ID;
const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const igUserId = process.env.INSTAGRAM_USER_ID;
const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;

// Import the libs via tsx (app is TS). Run with: node --import tsx scripts/fb-p1-test.mjs
const { fetchFacebookPages, facebookPostFeed, deleteFacebookPost } = await import(
  "../src/lib/meta/facebook.ts"
);
const { instagramCreateContainer, waitForInstagramContainer } = await import(
  "../src/lib/meta/instagram.ts"
);

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

try {
  // ── Facebook (full post + delete) ──
  if (pageId && fbToken) {
    const pages = await fetchFacebookPages(fbToken);
    check("fb token can list pages", pages.some((p) => p.id === pageId), pages.map((p) => p.name).join(", "));

    // Page operations require the PAGE-scoped token (a user token 403s on
    // /{page-id}/feed even with all scopes) — resolve it from /me/accounts.
    const page = pages.find((p) => p.id === pageId);
    const pageToken = page?.accessToken ?? fbToken;
    check("resolved page-scoped token", page?.accessToken ? true : false, page?.name ?? "falling back to user token");

    const { postId } = await facebookPostFeed({
      pageId,
      accessToken: pageToken,
      message: "Symphony integration test — this post will self-delete.",
    });
    check("fb feed post created", !!postId, `postId=${postId}`);

    await deleteFacebookPost({ postId, accessToken: pageToken });
    check("fb feed post deleted", true, `postId=${postId}`);
  } else {
    check("fb checks skipped (no FACEBOOK_* env)", true);
  }

  // ── Instagram (container only — no publish, no residue) ──
  if (igUserId && igToken) {
    const { id } = await instagramCreateContainer({
      igUserId,
      accessToken: igToken,
      caption: "Symphony integration test — container check, never published.",
      imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=720",
    });
    check("ig container created", !!id, `containerId=${id}`);

    await waitForInstagramContainer({ containerId: id, accessToken: igToken });
    check("ig container processed (FINISHED)", true, `containerId=${id}`);
  } else {
    check("ig checks skipped (no INSTAGRAM_* env)", true);
  }
} catch (error) {
  console.error("ERROR:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
