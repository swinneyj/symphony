import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts, productWatchlist } from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

/**
 * Product Monitor watchlist.
 *   GET    /api/market/watchlist?workspaceId          — watched items + rank trajectory
 *   POST   /api/market/watchlist { workspaceId, source, sourceProductId, name, imageUrl, alertRankDrop }
 *   DELETE /api/market/watchlist?workspaceId&source&sourceProductId
 */
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const watched = await db
      .select()
      .from(productWatchlist)
      .where(eq(productWatchlist.workspaceId, workspaceId))
      .orderBy(desc(productWatchlist.createdAt));

    // Latest + previous snapshot per watched product → spot-change deltas.
    const snapshots = await db
      .select({
        source: marketProducts.source,
        sourceProductId: marketProducts.sourceProductId,
        snapshotDate: marketProducts.snapshotDate,
        rank: marketProducts.rank,
        sales7d: marketProducts.sales7d,
        momentumScore: marketProducts.momentumScore,
        gmv30d: marketProducts.gmv30d,
      })
      .from(marketProducts)
      .where(
        and(
          eq(marketProducts.workspaceId, workspaceId),
          inArray(
            marketProducts.sourceProductId,
            watched.map((w) => w.sourceProductId)
          )
        )
      )
      .orderBy(desc(marketProducts.snapshotDate));

    const byProduct = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const key = `${s.source}:${s.sourceProductId}`;
      if (!byProduct.has(key)) byProduct.set(key, []);
      byProduct.get(key)!.push(s);
    }

    const rows = watched.map((w) => {
      const hist = byProduct.get(`${w.source}:${w.sourceProductId}`) ?? [];
      const cur = hist[0];
      const prev = hist[1];
      return {
        ...w,
        currentRank: cur?.rank ?? null,
        spotChange: cur?.rank != null && prev?.rank != null ? prev.rank - cur.rank : null,
        momentumScore: cur?.momentumScore ?? null,
        sales7d: cur?.sales7d ?? null,
        gmv30d: cur?.gmv30d ?? null,
        lastSnapshot: cur?.snapshotDate ?? null,
      };
    });

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("Error in watchlist GET:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { workspaceId, source, sourceProductId, name, imageUrl, alertRankDrop } = body;
    if (!workspaceId || !source || !sourceProductId || !name) {
      return NextResponse.json({ error: "workspaceId, source, sourceProductId, name required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const [row] = await db
      .insert(productWatchlist)
      .values({
        workspaceId,
        source,
        sourceProductId,
        name,
        imageUrl: imageUrl ?? null,
        alertRankDrop: alertRankDrop ?? 10,
      })
      .onConflictDoNothing()
      .returning();
    return NextResponse.json({ row, added: Boolean(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const source = searchParams.get("source");
    const sourceProductId = searchParams.get("sourceProductId");
    if (!workspaceId || !source || !sourceProductId) {
      return NextResponse.json({ error: "workspaceId, source, sourceProductId required" }, { status: 400 });
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await db
      .delete(productWatchlist)
      .where(
        and(
          eq(productWatchlist.workspaceId, workspaceId),
          eq(productWatchlist.source, source),
          eq(productWatchlist.sourceProductId, sourceProductId)
        )
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
