import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { resolveCoverUrl } from "@/lib/market/echotik";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

    const { id } = await params;
    const [product] = await db
      .select({ workspaceId: marketProducts.workspaceId, imageUrl: marketProducts.imageUrl })
      .from(marketProducts)
      .where(eq(marketProducts.id, id))
      .limit(1);
    if (!product?.imageUrl) return new Response("No image", { status: 404 });
    if (!(await hasWorkspaceAccess(product.workspaceId, session.user.id))) {
      return new Response("Forbidden", { status: 403 });
    }

    const resolved = await resolveCoverUrl(product.imageUrl);
    const upstream = await fetch(resolved, { signal: AbortSignal.timeout(30_000) });
    if (!upstream.ok) return new Response("Upstream error", { status: 502 });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/webp",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error streaming market product image:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
