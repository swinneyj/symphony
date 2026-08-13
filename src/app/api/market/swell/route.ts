import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { marketProducts } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";

/**
 * GET /api/market/swell?workspaceId=&limit=8
 * Swell meter — top movers across daily TikTok Shop SALE-rank snapshots
 * (source='tiktok_shop', written by scripts/swell-snapshot.mjs).
 *
 * Takes the two most recent snapshot dates, computes rank deltas
 * (prev − cur; positive = climbed), returns the biggest climbers.
 * `ready` is false until at least two snapshot dates exist (the meter
 * needs a baseline to measure movement against).
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
        { error: "workspaceId required" },
        { status: 400 }
      );
    }
    if (!(await hasWorkspaceAccess(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") ?? 8) || 8, 1),
      20
    );

    // The two most recent snapshot dates for this workspace's TikTok Shop feed.
    const dates = await db
      .selectDistinct({ date: marketProducts.snapshotDate })
      .from(marketProducts)
      .where(
        and(
          eq(marketProducts.workspaceId, workspaceId),
          eq(marketProducts.source, "tiktok_shop")
        )
      )
      .orderBy(desc(marketProducts.snapshotDate))
      .limit(2);

    if (dates.length < 2) {
      return NextResponse.json({
        ready: false,
        snapshotDates: dates.map((d) => d.date),
        rows: [],
      });
    }

    const [curDate, prevDate] = dates.map((d) => d.date);

    const [cur, prev] = await Promise.all([
      db
        .select({
          sourceProductId: marketProducts.sourceProductId,
          name: marketProducts.name,
          imageUrl: marketProducts.imageUrl,
          priceMin: marketProducts.priceMin,
          priceMax: marketProducts.priceMax,
          currency: marketProducts.currency,
          rank: marketProducts.rank,
        })
        .from(marketProducts)
        .where(
          and(
            eq(marketProducts.workspaceId, workspaceId),
            eq(marketProducts.source, "tiktok_shop"),
            eq(marketProducts.snapshotDate, curDate)
          )
        ),
      db
        .select({
          sourceProductId: marketProducts.sourceProductId,
          rank: marketProducts.rank,
        })
        .from(marketProducts)
        .where(
          and(
            eq(marketProducts.workspaceId, workspaceId),
            eq(marketProducts.source, "tiktok_shop"),
            eq(marketProducts.snapshotDate, prevDate)
          )
        ),
    ]);

    const prevRank = new Map(
      prev.map((p) => [p.sourceProductId, p.rank ?? null] as const)
    );

    const rows = cur
      .map((p) => {
        const before = prevRank.get(p.sourceProductId);
        const curRank = p.rank ?? null;
        const delta =
          curRank != null && before != null ? before - curRank : null;
        return {
          sourceProductId: p.sourceProductId,
          name: p.name,
          imageUrl: p.imageUrl,
          price: p.priceMin ?? p.priceMax,
          currency: p.currency ?? "USD",
          rank: curRank,
          prevRank: before,
          delta,
        };
      })
      .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity))
      .slice(0, limit);

    return NextResponse.json({
      ready: true,
      snapshotDates: [curDate, prevDate],
      rows,
    });
  } catch (error) {
    console.error("[swell] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Swell meter failed" },
      { status: 500 }
    );
  }
}
