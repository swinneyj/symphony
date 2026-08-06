import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { products, videoFormulas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { renderScript } from "@/lib/video/script-fill";

/**
 * POST /api/formulas/render
 * Body: { workspaceId, formulaId, productId, llm?: boolean }
 * Renders the formula's scriptTemplate with the product's data:
 * fills {product} {price} {category} {features} {store}.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, formulaId, productId, llm } = body;

    if (!workspaceId || !formulaId || !productId) {
      return NextResponse.json(
        { error: "workspaceId, formulaId and productId are required" },
        { status: 400 }
      );
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [formula] = await db
      .select()
      .from(videoFormulas)
      .where(eq(videoFormulas.id, formulaId))
      .limit(1);
    if (!formula) {
      return NextResponse.json({ error: "Formula not found" }, { status: 404 });
    }

    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const rendered = await renderScript(
      formula.scriptTemplate,
      {
        name: product.name,
        description: product.description,
        price: product.price,
      },
      { llm }
    );

    return NextResponse.json({
      formulaId: formula.id,
      productId: product.id,
      ...rendered,
    });
  } catch (error) {
    console.error("Error rendering script:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
