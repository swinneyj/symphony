// End-to-end test of discount-watchdog alert pipeline with mocked fetch + DB.
// Verifies: account lookup → showcase fetch → product lookup → prev/cur diff →
// stdout alert → snapshot update. Run: node scripts/test-discount-watchdog.mjs
import assert from "node:assert";

// --- env BEFORE import (module reads env at import time) ---
process.env.DATABASE_URL = "postgres://mock";
process.env.TIKTOK_SHOP_APP_KEY = "app-key";
process.env.TIKTOK_SHOP_APP_SECRET = "app-secret";

const logLines = [];
const updates = [];

const dbRows = [
  {
    // Has a previous snapshot: 60% off → now FULL price (discount gone).
    id: "prod-1",
    name: "Ultimate Color Corrector Stain",
    price: "29.99",
    currency: "USD",
    tiktokId: "1732518933400032055",
    sourceType: "link",
    metadata: {
      discountWatch: {
        found: true,
        priceMin: 11.99,
        originalMin: 29.99,
        currency: "USD",
        discountPct: 60,
        hidden: false,
        checkedAt: "2026-08-15T09:00:00.000Z",
      },
    },
  },
  {
    // New product, no snapshot yet — should snapshot without alerting.
    id: "prod-2",
    name: "Stadium Chair",
    price: "49.99",
    currency: "USD",
    tiktokId: "999",
    sourceType: "link",
    metadata: null,
  },
  {
    // In prev snapshot as FOUND → now NOT in catalog (removed).
    id: "prod-3",
    name: "Viral Gadget",
    price: "19.99",
    currency: "USD",
    tiktokId: "777",
    sourceType: "link",
    metadata: {
      discountWatch: {
        found: true,
        priceMin: 19.99,
        originalMin: 19.99,
        currency: "USD",
        discountPct: 0,
        hidden: false,
        checkedAt: "2026-08-15T09:00:00.000Z",
      },
    },
  },
];

let showcaseCalled = 0;
let searchCalled = 0;

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("showcases/products")) {
    showcaseCalled++;
    return jsonResponse({
      code: 0,
      data: {
        products: [
          {
            id: "1732518933400032055",
            title: "Ultimate Color Corrector Stain",
            price: {
              original_price: { minimum_amount: 29.99, currency: "USD" },
              sale_price: { minimum_amount: 29.99 }, // discount GONE
            },
            status: { is_hidden: false },
          },
        ],
        next_page_token: "",
      },
    });
  }
  if (u.includes("shop_products")) {
    searchCalled++;
    return jsonResponse({
      code: 0,
      data: {
        products: [
          {
            id: "999",
            title: "Stadium Chair",
            price: {
              original_price: { minimum_amount: 49.99, currency: "USD" },
              sale_price: { minimum_amount: 39.99 }, // 20% off
            },
            status: { is_hidden: false },
          },
        ],
        next_page_token: "",
      },
    });
  }
  throw new Error(`unexpected url ${u}`);
};
function jsonResponse(obj) {
  return {
    ok: true,
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

const mockPool = {
  query: async (sql, args) => {
    if (sql.includes("FROM social_accounts")) {
      return { rows: [{ workspaceId: "ws-1", shopToken: "fake-token" }] };
    }
    if (sql.includes("FROM products")) {
      return { rows: dbRows };
    }
    if (sql.includes("UPDATE products")) {
      updates.push(args);
      return { rows: [] };
    }
    throw new Error(`unexpected sql: ${sql.slice(0, 60)}`);
  },
  end: async () => {},
};

const mod = await import("./discount-watchdog.mjs");
mod.__setPool(mockPool);

// Capture stdout
const origWrite = process.stdout.write;
let stdout = "";
process.stdout.write = (chunk) => {
  stdout += String(chunk);
  return true;
};

const code = await mod.main();

process.stdout.write = origWrite;

assert.equal(code, 0, "main returns 0");
assert.equal(showcaseCalled, 1, "showcase endpoint called once");
assert.equal(searchCalled, 2, "search fallback for prod-2 + prod-3 (not in showcase)");
assert.ok(stdout.includes("discount GONE"), "alert for prod-1 discount gone");
assert.ok(stdout.includes("Ultimate Color Corrector Stain"), "prod-1 name in alert");
assert.ok(stdout.includes("NO LONGER FOUND"), "alert for prod-3 removed");
assert.ok(stdout.includes("Viral Gadget"), "prod-3 name in alert");
assert.equal(updates.length, 3, "snapshot updated for all 3 products");

// Verify prod-1 snapshot reflects the new full-price state.
const prod1Update = updates.find(([, json]) => json.includes('"found":true') && json.includes('"discountPct":0'));
assert.ok(prod1Update, "prod-1 snapshot now discountPct 0");
const prod3Update = updates.find(([, json]) => json.includes('"found":false'));
assert.ok(prod3Update, "prod-3 snapshot now found:false");

console.log("=== stdout captured ===");
console.log(stdout.trim());
console.log("=== assertions ===");
console.log("PASS: exit 0, showcase+search routing, discount-gone alert, removed alert, 3 snapshots");
console.log("PASS: end-to-end watchdog test");
