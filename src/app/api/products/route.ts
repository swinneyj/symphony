import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products, users } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * GET /api/products?workspaceId=<id>&status=<raw|processing|ready|failed>
 * Lists products for a workspace (newest first), with creator name joined.
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = searchParams.get("status");

    const conditions = [eq(products.workspaceId, workspaceId)];
    if (status) {
      conditions.push(eq(products.status, status as never));
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        currency: products.currency,
        originalImageUrl: products.originalImageUrl,
        processedImageUrl: products.processedImageUrl,
        sceneImageUrl: products.sceneImageUrl,
        sourceType: products.sourceType,
        sourceUrl: products.sourceUrl,
        tiktokProductId: products.tiktokProductId,
        status: products.status,
        metadata: products.metadata,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
        createdByName: users.name,
      })
      .from(products)
      .innerJoin(users, eq(products.createdById, users.id))
      .where(and(...conditions))
      .orderBy(desc(products.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error listing products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/products
 * Creates a product manually. Body: { workspaceId, name, description?,
 * price?, currency?, originalImageUrl?, sourceUrl? }
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, name, description, price, currency, originalImageUrl, sourceUrl } = body;

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }

    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [product] = await db
      .insert(products)
      .values({
        workspaceId,
        createdById: session.user.id,
        name: name.trim(),
        description: description?.trim() || null,
        price: price ? String(price) : null,
        currency: currency || "USD",
        originalImageUrl: originalImageUrl || null,
        sourceUrl: sourceUrl || null,
        sourceType: "manual",
        status: "raw",
      })
      .returning();

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
