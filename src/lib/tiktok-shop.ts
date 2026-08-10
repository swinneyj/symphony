/**
 * TikTok Shop API — product catalog sync.
 *
 * Pulls the seller's full product list from the TikTok Shop Open API
 * (partner.tiktokshop.com / open-api.tiktokglobalshop.com) and upserts
 * into the `products` table with source_type = "tiktok_showcase".
 *
 * Auth: app_key + app_secret (developer app) + shop cipher (authorized
 * shop). All three come from env — set by the workspace owner in the
 * TikTok Shop Partner Center. Same pattern as the other platform
 * connectors: code ships now, creds are a your-lane setup task.
 */

const SHOP_API = "https://open-api.tiktokglobalshop.com";
const TIMEOUT_MS = 20_000;

export type ShopCredentials = {
  appKey: string;
  appSecret: string;
  shopCipher: string;
};

export function getShopCredentials(): ShopCredentials {
  const appKey = process.env.TIKTOK_SHOP_APP_KEY ?? "";
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET ?? "";
  const shopCipher = process.env.TIKTOK_SHOP_CIPHER ?? "";
  if (!appKey || !appSecret || !shopCipher) {
    throw new Error("TikTok Shop is not configured (TIKTOK_SHOP_APP_KEY / _APP_SECRET / _CIPHER)");
  }
  return { appKey, appSecret, shopCipher };
}

export type ShopProduct = {
  id: string; // tiktok product id
  name: string;
  description?: string;
  price?: string; // formatted like "49.99"
  currency?: string;
  mainImageUrl?: string;
  status?: string; // ACTIVE | INACTIVE | ...
};

type ShopApiListResponse = {
  code?: number;
  message?: string;
  data?: {
    products?: Array<{
      id?: string;
      title?: string;
      name?: string;
      description?: string;
      price?: string | number;
      currency?: string;
      main_image?: { url_list?: string[] } | null;
      main_image_url?: string;
      images?: Array<{ url_list?: string[] }>;
      status?: string;
    }>;
    // pagination
    next_page_token?: string;
    total?: number;
  };
};

/**
 * Fetch one page of products from the shop. Sorted by create time desc.
 * Returns raw products + next-page token ("" when exhausted).
 */
export async function fetchShopProductsPage(
  creds: ShopCredentials,
  opts: { pageToken?: string; pageSize?: number } = {}
): Promise<{ products: ShopProduct[]; nextPageToken: string }> {
  const body = {
    app_key: creds.appKey,
    app_secret: creds.appSecret,
    shop_cipher: creds.shopCipher,
    page_size: Math.min(opts.pageSize ?? 50, 100),
    sort_by: "create_time:DESC",
    ...(opts.pageToken ? { page_token: opts.pageToken } : {}),
  };

  const res = await fetch(`${SHOP_API}/api/product/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`TikTok Shop API ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const json = (await res.json()) as ShopApiListResponse;
  if (json.code && json.code !== 0) {
    throw new Error(`TikTok Shop API error ${json.code}: ${json.message ?? "unknown"}`);
  }

  const items = json.data?.products ?? [];
  const products: ShopProduct[] = items
    .map((p) => {
      const imageUrl =
        p.main_image?.url_list?.[0] ??
        p.main_image_url ??
        p.images?.[0]?.url_list?.[0] ??
        null;
      return {
        id: String(p.id ?? ""),
        name: p.title ?? p.name ?? "",
        description: p.description,
        price: p.price != null ? String(p.price) : undefined,
        currency: p.currency ?? "USD",
        mainImageUrl: imageUrl ?? undefined,
        status: p.status,
      };
    })
    .filter((p) => p.id && p.name);

  return { products, nextPageToken: json.data?.next_page_token ?? "" };
}

/** Fetch the whole catalog (paginates until exhausted). */
export async function fetchAllShopProducts(
  creds: ShopCredentials,
  onProgress?: (fetched: number) => void
): Promise<ShopProduct[]> {
  const all: ShopProduct[] = [];
  let token = "";
  do {
    const { products, nextPageToken } = await fetchShopProductsPage(creds, {
      pageToken: token || undefined,
    });
    all.push(...products);
    onProgress?.(all.length);
    token = nextPageToken;
    // safety valve — never loop forever on a misbehaving API
    if (all.length > 10_000) break;
  } while (token);
  return all;
}
