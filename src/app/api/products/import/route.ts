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
  const normalizedName = name.trim().slice(0, 255);

  // TikTok sometimes withholds the product ID from server-side redirects even
  // though it returns the same canonical product title. Use that stable title
  // as a workspace-scoped fallback fingerprint for TikTok share links.
  if (/(^|\.)tiktok\.com$/i.test(parsed.hostname)) {
    const [existingTikTokTitle] = await db
      .select()
      .from(products)
      .where(and(
        eq(products.workspaceId, workspaceId),
        eq(products.sourceType, "link"),
        eq(products.name, normalizedName),
      ))
      .orderBy(desc(products.createdAt))
      .limit(1);
    if (existingTikTokTitle) return existingTikTokTitle;
  }
  const description = og.description || null;
  const structuredProductImage = extractTikTokVariantImage(html);
  let originalImageUrl = structuredProductImage || (ogInfo?.image
    ? absolutize(ogInfo.image, parsed)
    : og.image
      ? absolutize(og.image, parsed)
      : null);
  // Only trust TikTok's product-scoped social image here. Scanning every CDN
  // URL in the page can pick recommendation/ad imagery from another product.
  const galleryImageUrls = originalImageUrl ? [originalImageUrl] : [];
  // TikTok CDN thumbs default to 260:260 — request the 720:720 variant so
  // the video pipeline gets a usable source (verified serving 200).
  if (originalImageUrl) {
    originalImageUrl = originalImageUrl.replace(/:260:260\.webp/, ":720:720.webp");
  }
  const price = og.priceAmount || extractJsonLdPrice(html);

  // Resolve TikTok's stable product ID from either the share redirect or the
  // Shop PDP. Query parameters on both forms change between requests.
  let resolvedUrl: string | null = null;
  let tiktokProductId: string | null = null;
  try {
    const final = new URL(resolvedFetchUrl);
    if (final.hostname === "www.tiktok.com" && final.pathname.startsWith("/view/product/")) {
      resolvedUrl = final.origin + final.pathname;
      tiktokProductId = final.pathname.split("/").pop() || null;
    } else if (final.hostname === "shop.tiktok.com") {
      const pdpMatch = final.pathname.match(/\/(?:[a-z]{2}\/)?pdp\/(\d+)/i);
      if (pdpMatch) {
        tiktokProductId = pdpMatch[1];
        resolvedUrl = `${final.origin}${final.pathname}`;
      }
    }
  } catch {
    /* keep null */
  }

  // The first URL check handles literal webhook retries. This second check
  // handles TikTok short links whose redirect query changes on every fetch.
  if (tiktokProductId) {
    const [existingTikTokProduct] = await db
      .select()
      .from(products)
      .where(and(eq(products.workspaceId, workspaceId), eq(products.tiktokProductId, tiktokProductId)))
      .orderBy(desc(products.createdAt))
      .limit(1);
    if (existingTikTokProduct) return existingTikTokProduct;
  }

  const [product] = await db
    .insert(products)
    .values({
      workspaceId,
      createdById: userId,
      name: normalizedName,
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
 * TikTok Shop PDPs expose the actual variant/catalog image in the structured
 * product model. Prefer that image over og:image, which is often a lifestyle
 * promotional graphic. This stays scoped to sale-property images so we never
 * scan arbitrary CDN URLs from recommendations or reviews.
 */
function extractTikTokVariantImage(html: string): string | null {
  if (!/<(?:link|meta)[^>]+(?:shop\.tiktok\.com|tiktok)/i.test(html)) return null;
  const script = html.match(
    /<script[^>]+id=["']__MODERN_ROUTER_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  )?.[1];
  if (!script) return null;
  try {
    const root = JSON.parse(script) as unknown;
    let productModel: Record<string, unknown> | null = null;
    const visit = (value: unknown) => {
      if (productModel || value == null) return;
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (record.product_model && typeof record.product_model === "object") {
        productModel = record.product_model as Record<string, unknown>;
        return;
      }
      for (const item of Object.values(record)) visit(item);
    };
    visit(root);
    const saleProperties = productModel?.sale_properties;
    if (!Array.isArray(saleProperties)) return null;
    for (const property of saleProperties) {
      const values = (property as Record<string, unknown>)?.property_values;
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        const image = (value as Record<string, unknown>)?.image;
        const urls = image && typeof image === "object"
          ? (image as Record<string, unknown>).url_list
          : null;
        if (Array.isArray(urls)) {
          const first = urls.find((url): url is string => typeof url === "string");
          if (first) return first;
        }
      }
    }
  } catch {
    // Fall back to og:image when TikTok changes its SSR shape.
  }
  return null;
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
