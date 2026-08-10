import { db } from "@/db";
import { socialAccounts, analyticsSnapshots } from "@/db/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import {
  fetchFacebookAnalytics,
  fetchInstagramAnalytics,
} from "@/lib/meta/analytics";

/**
 * SyncMetaAnalytics — pulls real platform metrics for every connected
 * Meta (Facebook/Instagram) account and writes a daily snapshot row.
 *
 * Called by GET /api/cron/analytics (CRON_SECRET guarded). Shape of the
 * snapshot data object matches what /api/analytics + /api/analytics/overview
 * already read back.
 */

const dayMs = 24 * 60 * 60 * 1000;

export async function syncMetaAnalytics(): Promise<{
  synced: number;
  failed: Array<{ account: string; error: string }>;
}> {
  const accounts = await db
    .select({
      id: socialAccounts.id,
      workspaceId: socialAccounts.workspaceId,
      platform: socialAccounts.platform,
      accountName: socialAccounts.accountName,
      platformAccountId: socialAccounts.platformAccountId,
      accessToken: socialAccounts.accessToken,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.status, "connected"),
        isNotNull(socialAccounts.accessToken),
        // Only Meta platforms have adapters today
        eq(socialAccounts.platform, "facebook")
      )
    );

  const igAccounts = await db
    .select({
      id: socialAccounts.id,
      workspaceId: socialAccounts.workspaceId,
      platform: socialAccounts.platform,
      accountName: socialAccounts.accountName,
      platformAccountId: socialAccounts.platformAccountId,
      accessToken: socialAccounts.accessToken,
    })
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.status, "connected"),
        isNotNull(socialAccounts.accessToken),
        eq(socialAccounts.platform, "instagram")
      )
    );

  const all = [...accounts, ...igAccounts];
  const synced: string[] = [];
  const failed: Array<{ account: string; error: string }> = [];

  for (const account of all) {
    try {
      const data =
        account.platform === "facebook"
          ? await fetchFacebookAnalytics(
              account.accessToken!,
              account.platformAccountId
            )
          : await fetchInstagramAnalytics(
              account.accessToken!,
              account.platformAccountId
            );

      await db.insert(analyticsSnapshots).values({
        workspaceId: account.workspaceId,
        socialAccountId: account.id,
        platform: account.platform,
        period: "daily",
        snapshotDate: new Date(),
        data: {
          ...data,
          capturedAt: new Date().toISOString(),
          source: "meta-graph-api",
        },
      });

      synced.push(account.accountName);
    } catch (error) {
      failed.push({
        account: account.accountName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Prune snapshots older than 90 days to keep the table lean.
  try {
    await db
      .delete(analyticsSnapshots)
      .where(
        and(
          sql`${analyticsSnapshots.platform} IN ('facebook','instagram')`,
          sql`${analyticsSnapshots.snapshotDate} < ${new Date(
            Date.now() - 90 * dayMs
          )}`
        )
      );
  } catch {
    // pruning is best-effort
  }

  return { synced: synced.length, failed };
}
