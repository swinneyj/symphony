"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Heart,
  CheckCircle2,
  Users,
  BarChart3,
  RefreshCw,
  Clock,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OverviewResponse {
  metrics: {
    totalPosts: number;
    publishedPosts: number;
    scheduledPosts: number;
    draftPosts: number;
    connectedAccounts: number;
    totalFollowers: number;
    totalEngagement: number;
    totalImpressions: number;
  };
  platformBreakdown: Array<{
    platform: string;
    followers: number;
    engagement: number;
    impressions: number;
    posts: number;
    accounts: number;
  }>;
  recentTrends: {
    daily: Array<{ date: string; posts: number }>;
  };
  recentPosts: Array<{
    id: string;
    content: string | null;
    status: string;
    platforms: string[];
    createdAt: string;
  }>;
}

const platformColors: Record<string, string> = {
  Instagram: "bg-pink-500",
  YouTube: "bg-red-600",
  X: "bg-neutral-900 dark:bg-neutral-100",
  TikTok: "bg-black dark:bg-white",
  LinkedIn: "bg-blue-700",
  Facebook: "bg-blue-600",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  x: "X",
  twitter: "X",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  facebook: "Facebook",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("30d");
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    if (!res.ok) return;
    const workspaces = await res.json();
    if (workspaces.length === 0) return;
    const wsId = workspaces[0].id;
    const overviewRes = await fetch(`/api/analytics/overview?workspaceId=${encodeURIComponent(wsId)}`);
    if (overviewRes.ok) setData(await overviewRes.json());
  }, []);

  useEffect(() => {
    (async () => {
      await load();
      setLoading(false);
    })();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const m = data?.metrics;
  const noPlatformData = !m || m.totalFollowers === 0 && m.totalEngagement === 0 && m.totalImpressions === 0;

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Track your content performance across all platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {["7d", "30d", "90d", "1y"].map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  dateRange === range
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "symphony-analytics.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4 mr-1" />
            Export Report
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border py-24 text-muted-foreground">
          Loading analytics…
        </div>
      ) : (
        <>
          {/* Overview Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Published Posts
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(m?.publishedPosts ?? 0).toLocaleString()}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(m?.scheduledPosts ?? 0).toLocaleString()} scheduled &middot; {(m?.draftPosts ?? 0).toLocaleString()} drafts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Connected Accounts
                </CardTitle>
                <Users className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(m?.connectedAccounts ?? 0).toLocaleString()}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Linked to this workspace
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Posts
                </CardTitle>
                <FileText className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(m?.totalPosts ?? 0).toLocaleString()}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  All-time in this workspace
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Followers
                </CardTitle>
                <Heart className="h-4 w-4 text-rose-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {m && m.totalFollowers > 0 ? m.totalFollowers.toLocaleString() : "—"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {noPlatformData ? "Awaiting platform sync" : "Across all platforms"}
                </p>
              </CardContent>
            </Card>
          </div>

          {noPlatformData && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium">Platform metrics are not syncing yet</p>
                <p className="mt-1 text-muted-foreground">
                  Followers, engagement, and impressions come from each platform&apos;s analytics API. Content stats
                  (posts, accounts, activity) below are live from your workspace. Platform metric sync is the next
                  integration on the roadmap.
                </p>
              </div>
            </div>
          )}

          {/* Platform Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platform Breakdown</CardTitle>
              <CardDescription>Accounts and posts per platform</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data && data.platformBreakdown.filter((p) => p.accounts > 0 || p.posts > 0).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No platform activity yet — connect accounts and create posts to see breakdowns here.
                </p>
              ) : (
                data?.platformBreakdown
                  .filter((p) => p.accounts > 0 || p.posts > 0)
                  .map((row) => {
                    const label = PLATFORM_LABELS[row.platform] ?? row.platform;
                    return (
                      <div key={row.platform} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white",
                            platformColors[label] ?? "bg-muted-foreground"
                          )}>
                            {label.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.accounts} account{row.accounts === 1 ? "" : "s"} connected
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-right">
                            <p className="font-medium">{row.posts}</p>
                            <p className="text-[10px] text-muted-foreground">posts</p>
                          </div>
                          <Badge variant={row.accounts > 0 ? "secondary" : "outline"}>
                            {row.accounts > 0 ? "Connected" : "No account"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>

          {/* Two-column: trend + recent posts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Activity Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Content Activity (last 7 days)</CardTitle>
                <CardDescription>Posts created per day</CardDescription>
              </CardHeader>
              <CardContent>
                {data && data.recentTrends.daily.every((d) => d.posts === 0) ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No posts created in the last 7 days.
                  </p>
                ) : (
                  <div className="flex h-40 items-end gap-2">
                    {data?.recentTrends.daily.map((d) => (
                      <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-xs font-medium">{d.posts}</span>
                        <div
                          className={cn(
                            "w-full rounded-t bg-primary/80",
                            d.posts === 0 && "bg-muted"
                          )}
                          style={{ height: `${Math.max(6, (d.posts / Math.max(1, ...data.recentTrends.daily.map((x) => x.posts))) * 120)}px` }}
                        />
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Posts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Posts</CardTitle>
                <CardDescription>Latest content in this workspace</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data && data.recentPosts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No posts yet — create your first post in Composer.
                  </p>
                ) : (
                  data?.recentPosts.map((post) => (
                    <div key={post.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-medium">{post.content ?? "(no text)"}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                          {post.platforms.map((p) => (
                            <Badge key={p} variant="outline" className="capitalize text-[10px]">
                              {PLATFORM_LABELS[p] ?? p}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Badge variant={post.status === "published" ? "default" : "secondary"} className="shrink-0 capitalize">
                        {post.status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
