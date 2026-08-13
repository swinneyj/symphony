import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { posts, workspaces, workspaceMembers } from "@/db/schema";

/**
 * GET /api/cron/scriptsmith-queue — import Scriptsmith drafts into Symphony.
 *
 * Pulls the Scriptsmith content queue (https://scriptsmith-liard.vercel.app)
 * and creates draft posts in this workspace so they show up in the normal
 * composer/publish flow. Items are removed from the queue after a successful
 * import, so the queue only ever holds unprocessed drafts.
 *
 * Guarded by the CRON_SECRET header (Vercel cron standard), same as the
 * other cron routes.
 */
const BACKEND = process.env.SCRIPTsmith_BACKEND || "https://scriptsmith-liard.vercel.app";
const QTOKEN = process.env.SCRIPTsmith_QUEUE_TOKEN;

type QueueItem = {
  id: string;
  mode?: string;
  business?: string;
  video?: { uniqueId?: string; id?: string; desc?: string; views?: number; score?: number };
  script?: { hook?: string; script?: string; caption?: string; hashtags?: string[] };
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!QTOKEN) {
    return NextResponse.json({ error: "SCRIPTsmith_QUEUE_TOKEN not set" }, { status: 500 });
  }

  const ws = await db.select().from(workspaces).orderBy(asc(workspaces.createdAt)).limit(1);
  if (!ws.length) return NextResponse.json({ imported: 0, skipped: "no workspace" });
  const member = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, ws[0].id))
    .limit(1);
  if (!member.length) return NextResponse.json({ imported: 0, skipped: "no workspace member" });
  const workspaceId = ws[0].id;
  const createdById = member[0].userId;

  let items: QueueItem[] = [];
  try {
    const r = await fetch(`${BACKEND}/api/queue`, {
      headers: { "X-Queue-Token": QTOKEN },
      next: { revalidate: 0 },
    });
    if (!r.ok) return NextResponse.json({ error: `queue fetch ${r.status}` }, { status: 502 });
    items = ((await r.json()) as { items?: QueueItem[] }).items ?? [];
  } catch (error) {
    return NextResponse.json({ error: "queue unreachable: " + (error as Error).message }, { status: 502 });
  }

  const results: Array<{ id: string; status: string }> = [];
  for (const item of items.slice(0, 10)) {
    try {
      const src = item.video?.uniqueId ? `@${item.video.uniqueId}` : "link";
      const content = [
        `[Scriptsmith draft] ${src} · ${item.video?.desc ?? ""}`.trim(),
        "",
        `HOOK: ${item.script?.hook ?? ""}`,
        "",
        `SCRIPT: ${item.script?.script ?? ""}`,
        "",
        `CAPTION: ${item.script?.caption ?? ""}`,
        "",
        `HASHTAGS: ${(item.script?.hashtags ?? []).join(" ")}`,
        "",
        `mode: ${item.mode ?? ""} · business: ${item.business ?? ""}`,
      ].join("\n");
      const [row] = await db
        .insert(posts)
        .values({
          workspaceId,
          createdById,
          content,
          platformConfigs: { scriptsmith: { platforms: [] } },
          status: "draft",
        })
        .returning({ id: posts.id });

      const del = await fetch(`${BACKEND}/api/queue?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { "X-Queue-Token": QTOKEN },
      });
      results.push({ id: row.id, status: del.ok ? "imported" : "imported (queue cleanup failed)" });
    } catch (error) {
      results.push({ id: item.id, status: "error" });
      console.error("scriptsmith-queue import failed for", item.id, error);
    }
  }

  const imported = results.filter((r) => r.status.startsWith("imported")).length;
  return NextResponse.json({ fetched: items.length, imported, results });
}
