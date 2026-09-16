import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { cloneBenchmarkRuns, cloneBenchmarks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { blobToken } from "@/lib/blob-token";

export const runtime = "nodejs";

/** Stream a benchmark's private Fish Audio output only to authorized workspace members. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const [row] = await db
      .select({ run: cloneBenchmarkRuns, workspaceId: cloneBenchmarks.workspaceId })
      .from(cloneBenchmarkRuns)
      .innerJoin(cloneBenchmarks, eq(cloneBenchmarkRuns.benchmarkId, cloneBenchmarks.id))
      .where(eq(cloneBenchmarkRuns.id, id))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Benchmark run not found" }, { status: 404 });
    if (!(await hasWorkspaceAccess(row.workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const url = row.run.outputUrl;
    if (!url || url.startsWith("dryrun:")) return NextResponse.json({ error: "No audio output for this run" }, { status: 404 });

    if (!url.includes("blob.vercel-storage.com")) return NextResponse.redirect(url);
    const token = blobToken();
    if (!token) return NextResponse.json({ error: "Blob token missing" }, { status: 500 });
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const range = request.headers.get("range");
    if (range) headers.Range = range;
    const upstream = await fetch(url, { headers });
    if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: `Audio fetch failed: ${upstream.status}` }, { status: 502 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const responseHeaders: Record<string, string> = {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="benchmark-${id}.mp3"`,
      "Cache-Control": "private, max-age=3600",
    };
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) responseHeaders["Content-Range"] = contentRange;
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) responseHeaders["Content-Length"] = contentLength;
    return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers: responseHeaders });
  } catch (error) {
    console.error("Error streaming benchmark audio:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
