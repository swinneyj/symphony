import { db } from "@/db";
import { socialAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  fetchAllShopProducts,
  getShopCredentials,
  searchShopProducts,
  ShopApiError,
} from "@/lib/tiktok-shop";

/**
 * Steal This Ad — product-link resolution.
 *
 * A TikTok share link (/t/<id>, vm.tiktok.com) can 301 to a Shop PRODUCT
 * page (/view/product/<pid>) instead of a video. Product links have no
 * video to download via yt-dlp; we resolve the product's name/description/
 * image from the page (og tags + the redirect's og_info), and — when the
 * connected Shop account can find it — the product's MAIN VIDEO URL, which
 * the ads-worker downloads straight from the CDN (DC-IP safe) and
 * transcribes so remixes combine product facts + the shop video's VO.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type ResolvedProductLink = {
  sourceUrl: string;
  productId: string;
  title: string;
  brief: string;
};

/** Fetch og:* meta from a TikTok product page (graceful: "" on failure). */
async function fetchOgTags(pageUrl: string): Promise<{
  title: string;
  description: string;
  image: string;
}> {
  const empty = { title: "", description: "", image: "" };
  try {
    const page = await fetch(pageUrl, {
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await page.text();
    const ogTag = (name: string) =>
      html.match(
        new RegExp(
          `<meta[^>]+(?:property|name)="og:${name}"[^>]+content="([^"]*)"`,
          "i"
        )
      )?.[1] ??
      html.match(
        new RegExp(
          `<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="og:${name}"`,
          "i"
        )
      )?.[1] ??
      "";
    return {
      title: ogTag("title"),
      description: ogTag("description"),
      image: ogTag("image"),
    };
  } catch {
    return empty;
  }
}

/**
 * Resolve a TikTok share/product URL into product info.
 * Returns null when the URL is NOT a product link (video, upload, web…).
 */
export async function resolveProductLink(
  inputUrl: string
): Promise<ResolvedProductLink | null> {
  const parsed = new URL(inputUrl);
  if (!parsed.hostname.includes("tiktok.com")) return null;
  if (!/\/t\/|\/view\/product\//.test(parsed.pathname)) return null;

  let sourceUrl = parsed.toString();
  let productId = parsed.pathname.match(/\/view\/product\/(\d+)/)?.[1] ?? "";

  // Resolve share links: the 301 Location leaks og_info + the product id.
  let ogInfoTitle = "";
  let ogInfoImage = "";
  try {
    const redir = await fetch(sourceUrl, {
      redirect: "manual",
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(8_000),
    });
    const location = redir.headers.get("location") ?? "";
    productId =
      location.match(/\/view\/product\/(\d+)/)?.[1] ?? productId;
    if (location.startsWith("http")) sourceUrl = location.split("?")[0];
    const ogMatch = location.match(/og_info=([^&]+)/);
    if (ogMatch) {
      try {
        const og = JSON.parse(decodeURIComponent(ogMatch[1])) as {
          title?: string;
          image?: string;
        };
        ogInfoTitle = og.title?.replace(/\+/g, " ") ?? "";
        ogInfoImage = og.image?.replace(/\+/g, " ") ?? "";
      } catch {
        // ignore malformed og_info
      }
    }
  } catch {
    // resolution failure — not necessarily a product link
  }

  if (!productId) return null;

  const og = await fetchOgTags(sourceUrl);
  const title = (og.title || ogInfoTitle || "TikTok Shop product")
    .trim()
    .slice(0, 300);
  const brief = [
    `Product: ${title}`,
    og.description && `Description: ${og.description}`,
    (og.image || ogInfoImage) && `Product image: ${og.image || ogInfoImage}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);

  return { sourceUrl, productId, title, brief };
}

/**
 * Find the product's MAIN VIDEO via the connected TikTok Shop account.
 * Tries the creator's showcase first (deterministic), then the affiliate
 * catalog search. Returns the CDN video URL or null (any failure → null;
 * the product still works brief-only).
 */
export async function findProductMainVideo(
  workspaceId: string,
  productId: string,
  keyword: string
): Promise<string | null> {
  try {
    const connected = await db
      .select({ metadata: socialAccounts.metadata })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts.workspaceId, workspaceId),
          eq(socialAccounts.platform, "tiktok"),
          eq(socialAccounts.status, "connected")
        )
      );
    const shopAccount = connected.find((a) => {
      const shop = (a.metadata ?? {}) as { shop?: { accessToken?: string } };
      return !!shop.shop?.accessToken;
    });
    if (!shopAccount) return null;
    const shopToken = (
      (shopAccount.metadata ?? {}) as { shop?: { accessToken?: string } }
    ).shop?.accessToken;
    if (!shopToken) return null;

    const creds = getShopCredentials(shopToken);

    // 1) Creator showcase (fetchAllShopProducts paginates internally,
    // bounded by its 10k safety valve) — the product is usually here.
    const showcase = await fetchAllShopProducts(creds);
    const hit = showcase.find((p) => String(p.id) === String(productId));
    if (hit?.mainVideoUrl) return hit.mainVideoUrl;

    // 2) Catalog search by title keyword (one page), match by id.
    const search = await searchShopProducts(creds, {
      keyword: keyword.slice(0, 80),
      pageSize: 20,
    });
    const searchHit = search.products.find(
      (p) => String(p.id) === String(productId)
    );
    return searchHit?.mainVideoUrl ?? null;
  } catch (error) {
    // No shop account / token expired / product not in catalog → brief-only.
    console.error("[product-link] main-video lookup skipped:", error instanceof ShopApiError ? error.message : "no shop access");
    return null;
  }
}
