import { NextResponse } from "next/server";
import { JOB_FLAGS, jobsPending, cacheDel, type JobFlagKind } from "@/lib/market/cache";

/**
 * GET/DELETE /api/cron/worker-gate?w=video|img|ads
 *
 * Neon compute gate for the VPS workers (see neon-compute-frugality.md).
 * Workers call GET before their DB poll: `{ due: true }` means a job was
 * enqueued recently (flag set by the API routes) → poll Neon. `{ due: false }`
 * → skip the DB entirely this cycle (no Neon wake). Workers call DELETE after
 * observing an empty queue to re-arm the gate.
 *
 * This route touches ONLY Vercel KV — never the database.
 * Guarded by CRON_SECRET; degrades to { due: true } if KV is unreachable so a
 * KV hiccup can never starve the queues.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const w = (new URL(request.url).searchParams.get("w") ?? "video") as JobFlagKind;
  if (!(w in JOB_FLAGS)) {
    return NextResponse.json({ error: `unknown worker '${w}'` }, { status: 400 });
  }

  let due = false;
  try {
    due = await jobsPending(w);
  } catch {
    due = true; // KV hiccup → let workers poll the DB rather than starve
  }
  return NextResponse.json({ due });
}

export async function DELETE(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const w = (new URL(request.url).searchParams.get("w") ?? "video") as JobFlagKind;
  if (!(w in JOB_FLAGS)) {
    return NextResponse.json({ error: `unknown worker '${w}'` }, { status: 400 });
  }

  await cacheDel(JOB_FLAGS[w]);
  return NextResponse.json({ cleared: w });
}
