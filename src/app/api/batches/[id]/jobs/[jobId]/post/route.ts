import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { videoBatchJobs, videoBatches, products, socialAccounts, posts, postPlatformStatus } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hasWorkspaceAccess } from "@/lib/workspace-access";
import { initVideoPublish, fetchPublishStatus } from "@/lib/tiktok/posting";
import { refreshTikTokToken, tiktokClientKey, tiktokClientSecret } from "@/lib/tiktok/auth";
import { buildComplianceChecklist, buildTikTokTitle } from "@/lib/video/compliance";

// Posts a completed batch job's final video to the workspace's TikTok account.
// Compliance gate: refuses to post when the checklist fails (dry-run allowed).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id, jobId } = await params;

    const [job] = await db
      .select()
      .from(videoBatchJobs)
      .where(and(eq(videoBatchJobs.id, jobId), eq(videoBatchJobs.batchId, id)));

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!(await hasWorkspaceAccess(job.workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (job.status !== "done" || !job.finalUrl) {
      return NextResponse.json(
        { error: "Job is not complete — no final video to post" },
        { status: 409 }
      );
    }
    const meta = (job.metadata ?? {}) as Record<string, unknown>;
    if (meta.tiktokPublishId) {
      return NextResponse.json(
        { error: "Already posted (publish_id present)" },
        { status: 409 }
      );
    }

    const [batch] = await db.select().from(videoBatches).where(eq(videoBatches.id, id));
    const [product] = job.productId
      ? await db.select().from(products).where(eq(products.id, job.productId))
      : [];

    // TikTok account for this workspace — the batch's chosen account wins
    // (job.metadata.tiktokAccountId), falling back to the first connected one.
    const accountId = typeof meta.tiktokAccountId === "string" ? meta.tiktokAccountId : null;
    const [account] = accountId
      ? await db
          .select()
          .from(socialAccounts)
          .where(
            and(
              eq(socialAccounts.id, accountId),
              eq(socialAccounts.workspaceId, job.workspaceId),
              eq(socialAccounts.platform, "tiktok")
            )
          )
          .limit(1)
      : await db
          .select()
          .from(socialAccounts)
          .where(and(eq(socialAccounts.workspaceId, job.workspaceId), eq(socialAccounts.platform, "tiktok")))
          .limit(1);

    if (!account?.accessToken) {
      return NextResponse.json(
        { error: "No connected TikTok account for this workspace" },
        { status: 409 }
      );
    }

    // TikTok user tokens last 24h — refresh when near/past expiry (rotating
    // refresh token). Falls back to the stored token if refresh fails.
    let accessToken = account.accessToken;
    const expiresAtMs = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : 0;
    if (account.refreshToken && expiresAtMs && Date.now() > expiresAtMs - 6 * 3600 * 1000) {
      try {
        const refreshed = await refreshTikTokToken({
          clientKey: tiktokClientKey(),
          clientSecret: tiktokClientSecret(),
          refreshToken: account.refreshToken,
        });
        if (refreshed) {
          accessToken = refreshed.accessToken;
          await db
            .update(socialAccounts)
            .set({
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken,
              tokenExpiresAt: refreshed.expiresIn
                ? new Date(Date.now() + refreshed.expiresIn * 1000)
                : null,
              updatedAt: new Date(),
            })
            .where(eq(socialAccounts.id, account.id));
        }
      } catch (error) {
        console.warn("TikTok token refresh failed, using stored token:", error);
      }
    }

    // Compliance gate — Video Studio products are TikTok Shop content by design.
    const checklist = buildComplianceChecklist({
      productName: product?.name ?? "Product",
      durationSec: null, // duration not stored on jobs; assembly targets ≥6s
      isShopProduct: true,
    });
    if (!checklist.passed) {
      return NextResponse.json(
        { error: "Compliance check failed", checks: checklist.checks },
        { status: 422 }
      );
    }

    const title = buildTikTokTitle({
      productName: product?.name ?? "Product",
      isShopProduct: true,
    });

    // Direct Post via PULL_FROM_URL (video already on Blob).
    const body = await request.json().catch(() => ({}));
    const privacyLevel = ["SELF_ONLY", "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS"].includes(
      body.privacyLevel
    )
      ? (body.privacyLevel as "SELF_ONLY" | "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS")
      : "SELF_ONLY";
    const init = await initVideoPublish({
      accessToken,
      videoUrl: job.finalUrl,
      title,
      privacyLevel,
    });

    // Record on the job + create a post row for the composer/analytics views.
    const newMeta = { ...meta, tiktokPublishId: init.publishId, tiktokStatus: "SENDING", postedAt: new Date().toISOString(), dryRun: init.dryRun };
    await db
      .update(videoBatchJobs)
      .set({ metadata: newMeta, updatedAt: new Date() })
      .where(eq(videoBatchJobs.id, job.id));

    const [post] = await db
      .insert(posts)
      .values({
        workspaceId: job.workspaceId,
        createdById: session.user.id,
        content: title,
        platformConfigs: { tiktok: { platforms: ["tiktok"] } },
        status: "published",
        publishedAt: new Date(),
      })
      .returning();

    await db.insert(postPlatformStatus).values({
      postId: post.id,
      socialAccountId: account.id,
      platform: "tiktok",
      status: "published",
      platformPostId: init.publishId,
    });

    // One status poll (Direct Post usually completes within seconds).
    let publishStatus = "SENDING";
    try {
      const statusRes = await fetchPublishStatus({
        accessToken,
        publishId: init.publishId,
      });
      publishStatus = statusRes.status;
      await db
        .update(videoBatchJobs)
        .set({
          metadata: { ...newMeta, tiktokStatus: statusRes.status, failReason: statusRes.failReason },
          updatedAt: new Date(),
        })
        .where(eq(videoBatchJobs.id, job.id));
    } catch {
      // status poll failure is not fatal — publish_id is recorded for later checks
    }

    return NextResponse.json({ publishId: init.publishId, status: publishStatus, dryRun: init.dryRun, postId: post.id });
  } catch (error) {
    console.error("Error posting batch video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
