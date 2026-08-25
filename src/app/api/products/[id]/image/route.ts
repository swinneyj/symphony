import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";

/**
 * GET /api/products/[id]/image
 * Streams the product's display image: scene render → processed → original.
 *
 * Scene/processed images live in PRIVATE Blob storage — a browser <img> can't
 * fetch them directly (403 without a Bearer token). This route proxies the
 * bytes with the Blob token server-side. The original TikTok CDN URL is public
 * and gets a plain redirect.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const [product] = await db
      .select({
        id: products.id,
        workspaceId: products.workspaceId,
        originalImageUrl: products.originalImageUrl,
        processedImageUrl: products.processedImageUrl,
        sceneImageUrl: products.sceneImageUrl,
        name: products.name,
      })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) return new Response("Not found", { status: 404 });
    if (!(await hasWorkspaceAccess(product.workspaceId, session.user.id))) {
      return new Response("Forbidden", { status: 403 });
    }

    // ?variant=scene|processed|original picks a specific image; default is
    // scene → processed → original (the "best" available).
    const variant = new URL(request.url).searchParams.get("variant");
    const url =
      (variant === "scene" && product.sceneImageUrl) ||
      (variant === "processed" && product.processedImageUrl) ||
      (variant === "original" && product.originalImageUrl) ||
      (product.sceneImageUrl ?? product.processedImageUrl ?? product.originalImageUrl);
    if (!url) return new Response("No image", { status: 404 });
    if (url.includes("blob.vercel-storage.com")) {
      const token = blobToken();
      if (!token) return new Response("Blob token missing", { status: 500 });
      const upstream = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!upstream.ok) return new Response("Upstream error", { status: 502 });
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    return NextResponse.redirect(url);
  } catch (error) {
    console.error("Error streaming product image:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
