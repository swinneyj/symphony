import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { fetchInfluencerProductsPage } from "@/lib/market";
import AdmZip from "adm-zip";

/**
 * POST /api/market/products/export-zip
 * Body: { urls: string[], productIds?: string[], influencerId?: string }
 *
 * Mass-downloads product cover images as a single .zip. cover_urls on
 * cdn.echotik.live are SHORT-LIVED signed URLs ("check sign failed" once
 * expired) and the CDN hotlink-protects (needs browser UA + Referer). If a
 * signed URL 403s, we re-pull the creator's product list fresh (bypassing the
 * 6h KV cache, which would otherwise serve stale signatures) and map
 * product_id → fresh cover_url, then retry once. Max 100 images / 25 MB.
 */
const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  referer: "https://echotik.live/",
  origin: "https://echotik.live",
};

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      urls?: string[];
      productIds?: string[];
      influencerId?: string;
    };
    const urls = (body.urls ?? []).filter((u) => typeof u === "string" && u.startsWith("https://")).slice(0, 100);
    if (urls.length === 0) return NextResponse.json({ error: "No image URLs provided" }, { status: 400 });

    const fetchImage = async (url: string): Promise<Buffer | null> => {
      try {
        const res = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(20_000) });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > 25 * 1024 * 1024) return null;
        return buf;
      } catch {
        return null;
      }
    };

    // Batch download; collect any stale (403) URLs for a fresh re-pull.
    const zip = new AdmZip();
    let ok = 0;
    const stale: string[] = [];
    for (const url of urls) {
      const buf = await fetchImage(url);
      if (buf) {
        ok += 1;
        zip.addFile(`product-${String(ok).padStart(2, "0")}.webp`, buf);
      } else {
        stale.push(url);
      }
    }

    // Fresh re-pull: signed URLs expired (CDN "check sign failed"). Re-fetch
    // the product list bypassing the KV cache and swap in fresh cover_urls.
    if (stale.length > 0 && body.influencerId && body.productIds?.length) {
      try {
        const fresh = await fetchInfluencerProductsPage(
          body.influencerId,
          { page: 1, perPage: 50, order: "", sort: "desc" },
          true
        );
        const freshById = new Map<string, string>();
        for (const p of fresh.page.products) {
          if (p.imageUrl) freshById.set(p.sourceProductId, p.imageUrl);
        }
        for (let i = 0; i < stale.length && ok < 100; i++) {
          const staleUrl = stale[i];
          const pid = body.productIds[i] ?? "";
          const freshUrl = freshById.get(pid);
          if (!freshUrl || freshUrl === staleUrl) continue;
          const buf = await fetchImage(freshUrl);
          if (buf) {
            ok += 1;
            zip.addFile(`product-${String(ok).padStart(2, "0")}.webp`, buf);
          }
        }
      } catch {
        /* fresh re-pull failed — ship what we have */
      }
    }

    if (ok === 0) return NextResponse.json({ error: "No images could be downloaded (signed URLs may have expired — reload the product list and try again)" }, { status: 502 });

    const buf = zip.toBuffer();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="products-${Date.now()}.zip"`,
      },
    });
  } catch (error) {
    console.error("Error in market export-zip:", error);
    const msg = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
