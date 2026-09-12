import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { and, desc, eq } from "drizzle-orm";

/**
 * POST /api/products/import
 * Imports product(s) from link(s).
 *
 * Body: { workspaceId, url }                    (single, legacy)
 *   or: { workspaceId, urls: string[] }         (batch)
 *
 * Each URL is fetched and parsed for Open Graph tags (og:title,
 * og:description, og:image) plus best-effort price extraction
 * (og:price:amount / JSON-LD Product offers). Returns per-URL results so the
 * UI can show exactly which links succeeded and which failed.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const internal = request.headers.get("x-symphony-integration-secret") === process.env.MESSAGING_WEBHOOK_SECRET;
    const session = internal ? { user: { id: typeof body.userId === "string" ? body.userId : process.env.MESSAGING_USER_ID ?? "" } } : await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, url, urls } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const list: string[] = Array.isArray(urls)
      ? urls
      : typeof url === "string"
        ? [url]
        : [];
    if (list.length === 0) {
      return NextResponse.json({ error: "url or urls is required" }, { status: 400 });
    }
    if (list.length > 20) {
      return NextResponse.json({ error: "Max 20 URLs per batch" }, { status: 400 });
    }

    if (!internal && !(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const imported: unknown[] = [];
    const failed: { url: string; error: string }[] = [];

    for (const rawUrl of list) {
      try {
        const product = await importOne(rawUrl, workspaceId, session.user.id);
        imported.push(product);
      } catch (e) {
        failed.push({
          url: rawUrl,
          error: e instanceof Error ? e.message : "Import failed",
        });
      }
    }

    return NextResponse.json(
      {
        imported,
        failed,
        importedCount: imported.length,
        failedCount: failed.length,
      },
      { status: imported.length > 0 ? 200 : 400 }
    );
  } catch (error) {
    console.error("Error importing products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Import a single URL into the products table. Throws on failure. */
async function importOne(rawUrl: string, workspaceId: string, userId: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("Invalid URL");
  }

  // Webhook providers retry deliveries, and users commonly resend the same
  // share link while waiting. Reuse the latest matching product rather than
  // creating another product and another cleanup job.
  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.sourceUrl, parsed.toString())))
    .orderBy(desc(products.createdAt))
    .limit(1);
  if (existing) return existing;

  let html: string;
  let finalUrl: string | null = null;
  try {
    // Realistic browser UA — TikTok serves a "Security Check" page (no og
    // tags, no product data) to bot-like agents like SymphonyBot/1.0.
    const res = await fetch(parsed.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch URL (${res.status})`);
    }
    html = await res.text();
    finalUrl = res.url;
  } catch (error) {
    console.error("Import fetch failed:", error);
    throw new Error("Failed to fetch URL");
  }

  const og = parseOpenGraph(html);

  // TikTok share links (/t/...) redirect to /view/product/<id> and serve a
  // "Security Check" page to bots (no og tags in HTML) — but the redirect
  // target carries og_info={"title":...,"image":...}. Parse that first.
  const resolvedFetchUrl = finalUrl || parsed.toString();
  let ogInfo: { title?: string; image?: string } | null = null;
  try {
    const raw = new URL(resolvedFetchUrl).searchParams.get("og_info");
    if (raw) ogInfo = JSON.parse(raw);
  } catch {
    ogInfo = null;
  }

  const name =
    ogInfo?.title ||
    og.title ||
    parsed.hostname.replace(/^www\./, "") ||
    "Imported product";
  const description = og.description || null;
  let originalImageUrl = ogInfo?.image
    ? absolutize(ogInfo.image, parsed)
    : og.image
      ? absolutize(og.image, parsed)
      : null;
  // Prefer the full-resolution TikTok gallery over the tiny social OG thumb.
  // Keep distinct angles/details so Image Studio can use them as references.
  const galleryImageUrls = findTikTokImages(html);
  if (galleryImageUrls.length > 0) originalImageUrl = galleryImageUrls[0];
  // TikTok CDN thumbs default to 260:260 — request the 720:720 variant so
  // the video pipeline gets a usable source (verified serving 200).
  if (originalImageUrl) {
    originalImageUrl = originalImageUrl.replace(/:260:260\.webp/, ":720:720.webp");
  }
  const price = og.priceAmount || extractJsonLdPrice(html);

  // Resolved product page (e.g. https://www.tiktok.com/view/product/<id>)
  // without the short-link noise, for dedup + TikTok Shop integration.
  let resolvedUrl: string | null = null;
  let tiktokProductId: string | null = null;
  try {
    const final = new URL(resolvedFetchUrl);
    if (final.hostname === "www.tiktok.com" && final.pathname.startsWith("/view/product/")) {
      resolvedUrl = final.origin + final.pathname;
      tiktokProductId = final.pathname.split("/").pop() || null;
    }
  } catch {
    /* keep null */
  }

  const [product] = await db
    .insert(products)
    .values({
      workspaceId,
      createdById: userId,
      name: name.trim().slice(0, 255),
      description: description?.slice(0, 2000) || null,
      price,
      currency: og.priceCurrency || "USD",
      originalImageUrl,
      sourceType: "link",
      sourceUrl: resolvedUrl || parsed.toString(),
      tiktokProductId,
      status: "raw",
      metadata: { og: { ...og, image: originalImageUrl }, ogInfo, galleryImageUrls },
    })
    .returning();

  return product;
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

type OgData = {
  title: string | null;
  description: string | null;
  image: string | null;
  priceAmount: string | null;
  priceCurrency: string | null;
};

function parseOpenGraph(html: string): OgData {
  const get = (prop: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    const m = html.match(re);
    if (m) return decodeEntities(m[1]).trim();
    // attribute order can vary: content before property
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
      "i"
    );
    const m2 = html.match(re2);
    return m2 ? decodeEntities(m2[1]).trim() : null;
  };

  return {
    title: get("og:title"),
    description: get("og:description"),
    image: get("og:image"),
    priceAmount: get("og:price:amount") || get("product:price:amount"),
    priceCurrency: get("og:price:currency") || get("product:price:currency"),
  };
}

function extractJsonLdPrice(html: string): string | null {
  const re = /"offers"\s*:\s*{[^}]*?"price"\s*:\s*"?([\d.,]+)"?/i;
  const m = html.match(re);
  return m ? m[1] : null;
}

/**
 * Find the first TikTok CDN product image embedded in raw HTML.
 * TikTok Shop PDPs ship the gallery as img.src / JSON fields under
 * tiktokcdn domains even when og:image is absent. Prefer full-size
 * (non-260:260 thumbnail) URLs and escape any backslash-escaped slashes
 * that appear inside serialized JSON strings.
 */
function findTikTokImages(html: string): string[] {
  // Match https://<sub>.tiktokcdn(.com|.us|...)/... up to a quote/space.
  const re =
    /https?:\\?\/\\?\/[a-z0-9.-]*tiktokcdn[a-z0-9.-]*\\?\/[^\s"'<>\\]+/gi;
  const candidates = html.match(re) ?? [];
  const bestByAsset = new Map<string, { url: string; pixels: number; order: number }>();
  for (const [order, raw] of candidates.entries()) {
    const url = decodeEntities(raw.replace(/\\\//g, "/"));
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(url)) continue;
    const dimensions = url.match(/(?:resize|crop)-webp:(\d+):(\d+)\.webp/i);
    const pixels = dimensions ? Number(dimensions[1]) * Number(dimensions[2]) : 0;
    const assetKey = url.split("?")[0].split("~")[0];
    const previous = bestByAsset.get(assetKey);
    if (!previous || pixels > previous.pixels) bestByAsset.set(assetKey, { url, pixels, order });
  }
  return [...bestByAsset.values()]
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.url)
    .slice(0, 6);
}

function absolutize(url: string, base: URL): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
