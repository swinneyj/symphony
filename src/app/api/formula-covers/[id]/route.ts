import { NextResponse } from "next/server";
import { db } from "@/db";
import { videoFormulas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";

/**
 * GET /api/formula-covers/[id]
 * Streams a formula's cover image from private Blob WITHOUT auth.
 *
 * The formula UUID is the secret (unlisted, like /f/<id> formula pages and
 * the media proxy): covers are AI-generated scene stills, not user PII, and
 * the grid tiles need a URL the browser can fetch directly. Anything private
 * shouldn't be uploaded as a cover.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [formula] = await db
      .select({ coverImageUrl: videoFormulas.coverImageUrl })
      .from(videoFormulas)
      .where(eq(videoFormulas.id, id))
      .limit(1);

    if (!formula?.coverImageUrl) return new Response("Not found", { status: 404 });

    if (formula.coverImageUrl.includes("blob.vercel-storage.com")) {
      const token = blobToken();
      if (!token) return new Response("Blob token missing", { status: 500 });
      const upstream = await fetch(formula.coverImageUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!upstream.ok) return new Response("Upstream error", { status: 502 });
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") ?? "image/png",
          "Content-Length": upstream.headers.get("content-length") ?? "",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // Non-blob URL (e.g. an external image) — 302 so the browser fetches direct.
    return NextResponse.redirect(formula.coverImageUrl, 302);
  } catch (error) {
    console.error("Error streaming formula cover:", error);
    return new Response("Internal error", { status: 500 });
  }
}
