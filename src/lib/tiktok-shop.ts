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

/** Helper to score images based on 'studio' qualities (white background, high contrast).**
* Simple heuristic: check if the image URL contains keywords like 'hero', 'main', or 'product'.
* Real-world implementation would use a vision model but this suffices for initial filtering.
*/
export function calculateImageQuality(url?: string): number {
  if (!url) return 0;
  const u = url.toLowerCase();
  let score = 50; // base score
  if (u.includes("hero")) score += 20;
  if (u.includes("main") || u.includes("product")) score += 10;
  if (u.includes("studio") || u.includes("white")) score += 20;
  return Math.min(score, 100);
}

type ShopApiProduct = NonNullable<ShopApiResponse["data"]>["products"][number];

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
    imageQualityScore: calculateImageQuality(imageUrl),
    mainVideoUrl: p.main_video?.url ?? undefined,
    status: p.status?.added_status ?? p.status?.inventory_status ?? undefined,
    sellerName: p.shop?.name,
    detailLink: p.detail_link,
  };
}

/** Fetch one page of the creator's SHOWCASE products.*
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
