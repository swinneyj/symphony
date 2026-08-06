import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products } from "@/db/schema";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * POST /api/products/import
 * Imports a product from a link. Body: { workspaceId, url }
 *
 * Fetches the page, parses Open Graph tags (og:title, og:description,
 * og:image) plus best-effort price extraction (og:price:amount / JSON-LD
 * Product offers), and creates a product with sourceType "link".
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, url } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let html: string;
    try {
      const res = await fetch(parsed.toString(), {
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; SymphonyBot/1.0; +https://symphonyapp.company)",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch URL (${res.status})` },
          { status: 502 }
        );
      }
      html = await res.text();
    } catch (error) {
      console.error("Import fetch failed:", error);
      return NextResponse.json(
        { error: "Failed to fetch URL" },
        { status: 502 }
      );
    }

    const og = parseOpenGraph(html);
    const name =
      og.title ||
      parsed.hostname.replace(/^www\./, "") ||
      "Imported product";
    const description = og.description || null;
    const originalImageUrl = og.image ? absolutize(og.image, parsed) : null;
    const price = og.priceAmount || extractJsonLdPrice(html);

    const [product] = await db
      .insert(products)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: name.trim().slice(0, 255),
        description: description?.slice(0, 2000) || null,
        price,
        currency: og.priceCurrency || "USD",
        originalImageUrl,
        sourceType: "link",
        sourceUrl: parsed.toString(),
        status: "raw",
        metadata: { og: { ...og, image: originalImageUrl } },
      })
      .returning();

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error importing product:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
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
