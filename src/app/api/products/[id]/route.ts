import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedProduct(id: string, userId: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .limit(1);

  if (!product) return null;
  if (!(await hasWorkspaceAccess(product.workspaceId, userId))) {
    return "forbidden" as const;
  }
  return product;
}

/**
 * PATCH /api/products/[id]
 * Updates editable fields. Body: any subset of { name, description, price,
 * currency, originalImageUrl, processedImageUrl, sourceUrl, status }.
 */
export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const product = await getOwnedProduct(id, session.user.id);
    if (product === null) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (product === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const allowed: Record<string, unknown> = {};
    for (const key of [
      "name",
      "description",
      "price",
      "currency",
      "originalImageUrl",
      "processedImageUrl",
      "sourceUrl",
      "status",
    ]) {
      if (key in body) allowed[key] = body[key];
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(products)
      .set({ ...allowed, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/products/[id]
 * Hard-deletes the product (jobs referencing it keep job rows, productId set null).
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const product = await getOwnedProduct(id, session.user.id);
    if (product === null) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (product === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(products).where(eq(products.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
