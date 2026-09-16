import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { cloneBenchmarks, cloneBenchmarkRuns, cloneBenchmarkRatings, personas } from "@/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { CREATOR_PROVIDER_CATALOG, createCreatorProviderRegistry, getProviderCapability } from "@/lib/creator-clone/providers";

const defaultVoiceProviders = CREATOR_PROVIDER_CATALOG
  .filter((provider) => provider.capabilities.some((capability) => capability.kind === "voice"))
  .map((provider) => provider.id);
const defaultAvatarProviders = CREATOR_PROVIDER_CATALOG
  .filter((provider) => provider.capabilities.some((capability) => capability.kind === "avatar"))
  .map((provider) => provider.id);

async function assertAccess(workspaceId: string, userId: string) {
  if (!(await hasWorkspaceAccess(workspaceId, userId))) throw new Error("Forbidden");
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    await assertAccess(workspaceId, session.user.id);

    const benchmarks = await db
      .select({ benchmark: cloneBenchmarks, creatorName: personas.name })
      .from(cloneBenchmarks)
      .innerJoin(personas, eq(cloneBenchmarks.creatorId, personas.id))
      .where(eq(cloneBenchmarks.workspaceId, workspaceId))
      .orderBy(desc(cloneBenchmarks.createdAt));
    if (!benchmarks.length) return NextResponse.json([]);
    const ids = benchmarks.map(({ benchmark }) => benchmark.id);
    const runs = await db.select().from(cloneBenchmarkRuns).where(inArray(cloneBenchmarkRuns.benchmarkId, ids));
    const runIds = runs.map((run) => run.id);
    const ratings = runIds.length
      ? await db.select().from(cloneBenchmarkRatings).where(inArray(cloneBenchmarkRatings.runId, runIds))
      : [];
    return NextResponse.json(
      benchmarks.map(({ benchmark, creatorName }) => ({
        ...benchmark,
        creatorName,
        runs: runs
          .filter((run) => run.benchmarkId === benchmark.id)
          .map((run) => ({
            ...run,
            ratings: ratings.filter((rating) => rating.runId === run.id),
          })),
      }))
    );
  } catch (error) {
    console.error("Error listing clone benchmarks:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    const creatorId = typeof body.creatorId === "string" ? body.creatorId : "";
    const script = typeof body.script === "string" ? body.script.trim() : "";
    if (!workspaceId || !creatorId || !script) {
      return NextResponse.json({ error: "workspaceId, creatorId, and script are required" }, { status: 400 });
    }
    await assertAccess(workspaceId, session.user.id);
    const [creator] = await db.select().from(personas).where(eq(personas.id, creatorId)).limit(1);
    if (!creator || (creator.workspaceId !== null && creator.workspaceId !== workspaceId)) {
      return NextResponse.json({ error: "Creator profile not found" }, { status: 404 });
    }
    if (creator.consentStatus !== "authorized") {
      return NextResponse.json({ error: "Creator consent must be authorized before benchmarking" }, { status: 400 });
    }

    const voiceProviders = Array.isArray(body.voiceProviders) && body.voiceProviders.length
      ? body.voiceProviders.filter((id: unknown): id is string => typeof id === "string")
      : defaultVoiceProviders;
    const avatarProviders = Array.isArray(body.avatarProviders) && body.avatarProviders.length
      ? body.avatarProviders.filter((id: unknown): id is string => typeof id === "string")
      : defaultAvatarProviders;
    if (!voiceProviders.length || !avatarProviders.length) {
      return NextResponse.json({ error: "Select at least one voice and avatar provider" }, { status: 400 });
    }
    for (const provider of voiceProviders) {
      if (!getProviderCapability(provider, "voice")) return NextResponse.json({ error: `Unknown voice provider: ${provider}` }, { status: 400 });
    }
    for (const provider of avatarProviders) {
      if (!getProviderCapability(provider, "avatar")) return NextResponse.json({ error: `Unknown avatar provider: ${provider}` }, { status: 400 });
    }

    const [benchmark] = await db.insert(cloneBenchmarks).values({
      workspaceId,
      creatorId,
      createdById: session.user.id,
      script,
      voiceId: typeof body.voiceId === "string" ? body.voiceId : null,
      avatarReferenceUrl: typeof body.avatarReferenceUrl === "string" ? body.avatarReferenceUrl : creator.faceImageUrl,
      qualityMode: ["economy", "standard", "premium"].includes(body.qualityMode) ? body.qualityMode : "standard",
      status: "running",
    }).returning();

    const registry = createCreatorProviderRegistry();
    const createdRuns = [];
    for (const voiceProvider of voiceProviders) {
      for (const avatarProvider of avatarProviders) {
        const startedAt = Date.now();
        let status: "done" | "failed" = "failed";
        let error: string | null = null;
        let outputUrl: string | null = null;
        try {
          const voice = registry.voices.get(voiceProvider);
          const avatar = registry.avatars.get(avatarProvider);
          if (!voice || !avatar) throw new Error("Provider adapter is not registered");
          const audio = await voice.generateSpeech({ creatorId, script, modelId: creator.voiceModelId ?? undefined });
          const video = await avatar.generateAvatarVideo({ creatorId, script, modelId: creator.avatarModelId ?? undefined, audioUrl: audio.outputUrl ?? "" });
          status = video.status === "complete" ? "done" : "failed";
          outputUrl = video.outputUrl ?? null;
        } catch (cause) {
          error = cause instanceof Error ? cause.message : "Provider run failed";
        }
        const [run] = await db.insert(cloneBenchmarkRuns).values({
          benchmarkId: benchmark.id,
          voiceProvider,
          avatarProvider,
          voiceModelId: creator.voiceModelId,
          avatarModelId: creator.avatarModelId,
          status,
          outputUrl,
          error,
          generationTimeMs: Date.now() - startedAt,
          resolution: "9:16",
        }).returning();
        createdRuns.push(run);
      }
    }
    await db.update(cloneBenchmarks).set({ status: "done", updatedAt: new Date() }).where(eq(cloneBenchmarks.id, benchmark.id));
    return NextResponse.json({ ...benchmark, status: "done", runs: createdRuns }, { status: 201 });
  } catch (error) {
    console.error("Error creating clone benchmark:", error);
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status });
  }
}
