/**
 * TikTok Shop API — affiliate/creator product catalog sync.
 *
 * Pulls the products a TikTok Shop CREATOR (affiliate) promotes in their
 * shop showcase. Auth is Creator OAuth (connect → callback → token), NOT
 * the static seller shop-cipher creds. The creator must be enrolled in the
 * TikTok Shop affiliate program.
 *
 * Flow (per TikTok Shop docs, creator-authorization-guide):
 *   1. Redirect to https://shop.tiktok.com/alliance/creator/auth?app_key=…&state=…
 *   2. User approves → callback?code=…&state=…
 *   3. Exchange code via GET https://auth.tiktok-shops.com/api/v2/token/get
 *      (?app_key&app_secret&auth_code&grant_type=authorized_code)
 *      → access_token (7d) + refresh_token (1y) + open_id
 *   4. Call APIs with header `x-tts-access-token: <access_token>`
 *
 * Creator product list endpoint (Get Shop Products, scope "Affiliate
 * Information"):
 *   GET https://open-api.tiktokglobalshop.com/affiliate_creator/202509/shop_products
 *       ?app_key=…&sign=…&timestamp=…&page_size=…&page_token=…
 *   (sign = HMAC-SHA256 of app_secret + sorted query string — see signer below)
 */

const SHOP_API = "https://open-api.tiktokglobalshop.com";
const AUTH_API = "https://auth.tiktok-shops.com";
const TIMEOUT_MS = 20_000;

export type ShopCredentials = {
  appKey: string;
  appSecret: string;
  accessToken: string;
};

/** Creator app creds from env (static) + live access token per connected creator. */
export function getShopCredentials(accessToken?: string): ShopCredentials {
  const appKey = process.env.TIKTOK_SHOP_APP_KEY ?? "";
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET ?? "";
  if (!appKey || !appSecret) {
    throw new Error("TikTok Shop is not configured (TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET)");
  }
  if (!accessToken) {
    throw new Error("No TikTok Shop creator access token — connect your creator account first");
  }
  return { appKey, appSecret, accessToken };
}

/** Build the creator authorization URL (step 1). */
export function buildCreatorAuthUrl(redirectUri: string, state: string): string {
  const appKey = process.env.TIKTOK_SHOP_APP_KEY ?? "";
  if (!appKey) throw new Error("TIKTOK_SHOP_APP_KEY is not configured");
  const params = new URLSearchParams({ app_key: appKey, state });
  return `https://shop.tiktok.com/alliance/creator/auth?${params.toString()}`;
}

/** Exchange auth_code for tokens (step 3). */
export async function exchangeCreatorCode(opts: {
  appKey: string;
  appSecret: string;
  code: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  accessTokenExpireIn: number;
  refreshTokenExpireIn: number;
  openId: string;
}> {
  const params = new URLSearchParams({
    app_key: opts.appKey,
    app_secret: opts.appSecret,
    auth_code: opts.code,
    grant_type: "authorized_code", // intentional — TikTok Shop, not standard OAuth
  });
  const res = await fetch(`${AUTH_API}/api/v2/token/get?${params.toString()}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as {
    code?: number;
    message?: string;
    data?: {
      access_token?: string;
      refresh_token?: string;
      access_token_expire_in?: number;
      refresh_token_expire_in?: number;
      open_id?: string;
    };
  } | null;
  if (!res.ok || json?.code !== 0 || !json.data?.access_token) {
    throw new Error(
      `TikTok Shop token exchange failed (${res.status}): ${json?.message ?? "unknown"}`
    );
  }
  return {
    accessToken: json.data.access_token,
    refreshToken: json.data.refresh_token ?? "",
    accessTokenExpireIn: json.data.access_token_expire_in ?? 0,
    refreshTokenExpireIn: json.data.refresh_token_expire_in ?? 0,
    openId: json.data.open_id ?? "",
  };
}

/** Refresh an expiring access token. */
export async function refreshCreatorToken(opts: {
  appKey: string;
  appSecret: string;
  refreshToken: string;
}): Promise<{ accessToken: string; refreshToken: string; accessTokenExpireIn: number }> {
  const params = new URLSearchParams({
    app_key: opts.appKey,
    app_secret: opts.appSecret,
    refresh_token: opts.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${AUTH_API}/api/v2/token/refresh?${params.toString()}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as {
    code?: number;
    message?: string;
    data?: { access_token?: string; refresh_token?: string; access_token_expire_in?: number };
  } | null;
  if (!res.ok || json?.code !== 0 || !json.data?.access_token) {
    throw new Error(`TikTok Shop token refresh failed (${res.status}): ${json?.message ?? "unknown"}`);
  }
  return {
    accessToken: json.data.access_token,
    refreshToken: json.data.refresh_token ?? opts.refreshToken,
    accessTokenExpireIn: json.data.access_token_expire_in ?? 0,
  };
}

/** HMAC-SHA256 request signature (per TikTok Shop API docs). */
function signRequest(appSecret: string, queryString: string): string {
  const key = appSecret;
  // docs: sign = hmac_sha256(secret, sorted-query-string); hex digest
  const { createHmac } = require("crypto");
  return createHmac("sha256", key).update(queryString).digest("hex");
}

export type ShopProduct = {
  id: string;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  mainImageUrl?: string;
  status?: string;
  sellerName?: string;
  detailLink?: string;
};

type ShopApiResponse = {
  code?: number;
  message?: string;
  data?: {
    products?: Array<{
      id?: string | number;
      title?: string;
      description?: string;
      // Showcase endpoint returns images as {width,height,url} objects
      main_images?: Array<{ url?: string }>;
      addition?: {
        customized_main_images?: Array<{ url?: string }>;
      };
      price?: {
        original_price?: {
          minimum_amount?: string | number;
          maximum_amount?: string | number;
          currency?: string;
        };
      };
      status?: {
        inventory_status?: string;
        added_status?: string;
        is_hidden?: boolean;
        review_status?: string;
      };
      source?: string;
      detail_link?: string;
      shop?: { name?: string };
    }>;
    next_page_token?: string;
    total?: number;
  };
};

/** Structured error so API routes can surface friendly guidance to the UI. */
export class ShopApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ShopApiError";
  }
}

type ShopApiProduct = NonNullable<
  NonNullable<ShopApiResponse["data"]>["products"]
>[number];

/** Map a raw Shop API product into the app's ShopProduct shape. */
function mapShopProduct(p: ShopApiProduct): ShopProduct {
  const imageUrl =
    p.main_images?.[0]?.url ??
    p.addition?.customized_main_images?.[0]?.url ??
    null;
  return {
    id: String(p.id ?? ""),
    name: p.title ?? "",
    description: p.description,
    price:
      p.price?.original_price?.minimum_amount != null
        ? String(p.price.original_price.minimum_amount)
        : undefined,
    currency: p.price?.original_price?.currency ?? "USD",
    mainImageUrl: imageUrl ?? undefined,
    status: p.status?.added_status ?? p.status?.inventory_status ?? undefined,
    sellerName: p.shop?.name,
    detailLink: p.detail_link,
  };
}

/**
 * Fetch one page of the creator's SHOWCASE products.
 * GET /affiliate_creator/202405/showcases/products?origin=SHOWCASE
 * Requires scope: creator.showcase.read (or creator.video.write)
 */
export async function fetchShopProductsPage(
  creds: ShopCredentials,
  opts: { pageToken?: string; pageSize?: number } = {}
): Promise<{ products: ShopProduct[]; nextPageToken: string }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const pageSize = Math.min(opts.pageSize ?? 20, 20); // valid range [1-20]

  const params: Record<string, string> = {
    app_key: creds.appKey,
    timestamp,
    page_size: String(pageSize),
    origin: "SHOWCASE",
  };
  if (opts.pageToken) params.page_token = opts.pageToken;

  const sortedQuery = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  const sign = signRequest(creds.appSecret, sortedQuery);

  const query = new URLSearchParams({ ...params, sign });
  const res = await fetch(`${SHOP_API}/affiliate_creator/202405/showcases/products?${query.toString()}`, {
    headers: { "x-tts-access-token": creds.accessToken },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`TikTok Shop API ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = (await res.json()) as ShopApiResponse;
  if (json.code && json.code !== 0) {
    throw new Error(`TikTok Shop API error ${json.code}: ${json.message ?? "unknown"}`);
  }

  const items = json.data?.products ?? [];
  const products: ShopProduct[] = items
    .map(mapShopProduct)
    .filter((p) => p.id && p.name);

  return { products, nextPageToken: json.data?.next_page_token ?? "" };
}

/** Fetch the whole creator showcase catalog (paginated). */
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
    if (all.length > 10_000) break; // safety valve
  } while (token);
  return all;
}

export type ShopSearchParams = {
  keyword?: string;
  sortField?: "PRODUCT_ID" | "PRICE" | "SALE";
  sortOrder?: "DESC" | "ASC";
  pageToken?: string;
  pageSize?: number;
};

/**
 * Search the TikTok Shop product catalog available to affiliate creators.
 * GET /affiliate_creator/202509/shop_products
 * Requires scope: "Affiliate Information" (434372).
 *
 * `keyword` is a free-text title search; results sort by sales, price, or
 * product id. Returns one page + the next page token for pagination.
 */
export async function searchShopProducts(
  creds: ShopCredentials,
  opts: ShopSearchParams = {}
): Promise<{ products: ShopProduct[]; nextPageToken: string }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);

  const params: Record<string, string> = {
    app_key: creds.appKey,
    timestamp,
    page_size: String(pageSize),
  };
  if (opts.keyword?.trim()) params.keyword = opts.keyword.trim();
  if (opts.sortField) params.sort_field = opts.sortField;
  if (opts.sortOrder) params.sort_order = opts.sortOrder;
  if (opts.pageToken) params.page_token = opts.pageToken;

  const sortedQuery = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");
  const sign = signRequest(creds.appSecret, sortedQuery);

  const query = new URLSearchParams({ ...params, sign });
  const res = await fetch(
    `${SHOP_API}/affiliate_creator/202509/shop_products?${query.toString()}`,
    {
      headers: { "x-tts-access-token": creds.accessToken },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ShopApiError(res.status, text.slice(0, 300) || `HTTP ${res.status}`);
  }
  const json = (await res.json()) as ShopApiResponse;
  if (json.code && json.code !== 0) {
    throw new ShopApiError(Number(json.code), json.message ?? "unknown");
  }

  const items = json.data?.products ?? [];
  const products: ShopProduct[] = items
    .map(mapShopProduct)
    .filter((p) => p.id && p.name);

  return { products, nextPageToken: json.data?.next_page_token ?? "" };
}
