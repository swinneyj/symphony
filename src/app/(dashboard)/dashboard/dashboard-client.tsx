"use client";

import { useEffect, useState } from "react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import Link from "next/link";
import {
  CalendarClock,
  MessageSquare,
  Users,
  Heart,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  BarChart3,
  PenSquare,
  ArrowUpRight,
  MoreHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Summary {
  totalScheduledPosts: number;
  pendingInboxMessages: number;
  connectedAccounts: number;
  totalFollowers: number;
}

interface ActivityItem {
  id: string;
  type: "published" | "scheduled";
  content: string;
  platform: string;
  time: string;
  status: string;
}

interface AccountItem {
  id: string;
  name: string;
  platform: string;
  handle: string;
  status: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const platformColors: Record<string, string> = {
  instagram: "bg-pink-500",
  x: "bg-neutral-900 dark:bg-neutral-100",
  twitter: "bg-neutral-900 dark:bg-neutral-100",
  youtube: "bg-red-600",
  tiktok: "bg-black dark:bg-white",
  linkedin: "bg-blue-600",
  facebook: "bg-blue-500",
};

const platformIcons: Record<string, string> = {
  instagram: "IG",
  x: "X",
  twitter: "X",
  youtube: "YT",
  tiktok: "TT",
  linkedin: "LN",
  facebook: "FB",
};

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function DashboardClient({ userName }: { userName?: string | null }) {
  const [summary, setSummary] = useState<Summary>({
    totalScheduledPosts: 0,
    pendingInboxMessages: 0,
    connectedAccounts: 0,
    totalFollowers: 0,
  });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  useEffect(() => {
    (async () => {
      try {
        const wsRes = await fetch("/api/workspaces");
        if (!wsRes.ok) return;
        const workspaces = await wsRes.json();
        if (workspaces.length === 0) return;
        const active = resolveActiveWorkspace(workspaces);
        if (!active) return;
        const wsId = active.id;

        const [postsRes, inboxRes, accountsRes] = await Promise.all([
          fetch(`/api/posts?workspaceId=${encodeURIComponent(wsId)}&limit=6`),
          fetch(`/api/inbox?workspaceId=${encodeURIComponent(wsId)}&status=unread&limit=1`),
          fetch(`/api/accounts?workspaceId=${encodeURIComponent(wsId)}`),
        ]);

        const [postsData, inboxData, accountsData] = await Promise.all([
          postsRes.ok ? postsRes.json() : null,
          inboxRes.ok ? inboxRes.json() : null,
          accountsRes.ok ? accountsRes.json() : [],
        ]);

        const allPosts = postsData?.posts ?? [];
        const scheduled = allPosts.filter((p: { status: string }) => p.status === "scheduled");
        const published = allPosts.filter((p: { status: string }) => p.status === "published");

        setSummary({
          totalScheduledPosts: scheduled.length,
          pendingInboxMessages: inboxData?.pagination?.total ?? 0,
          connectedAccounts: accountsData.length,
          totalFollowers: 0,
        });

        setRecentActivity(
          allPosts.slice(0, 5).map((p: Record<string, unknown>) => {
            const platforms = Object.keys((p.platformConfigs as Record<string, unknown>) ?? {});
            const platform = platforms.length > 0 ? platforms[0] : "instagram";
            const isPublished = p.status === "published";
            return {
              id: p.id as string,
              type: isPublished ? "published" : "scheduled",
              content: (p.content as string) ?? "(no text)",
              platform,
              time: isPublished
                ? timeAgo(p.publishedAt as string) || "just now"
                : `Scheduled for ${new Date(p.scheduledFor as string).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
              status: (p.status as string) ?? "draft",
            };
          })
        );

        setAccounts(
          accountsData.map((a: Record<string, unknown>) => ({
            id: a.id as string,
            name: (a.accountName as string) ?? "Account",
            platform: ((a.platform as string) === "twitter" ? "x" : a.platform) as string,
            handle: a.accountUsername ? `@${a.accountUsername}` : "",
            status: (a.status as string) ?? "connected",
          }))
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, {userName || "there"}! 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with your social media today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/analytics">
              <BarChart3 className="h-4 w-4" />
              View Analytics
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/composer">
              <PenSquare className="h-4 w-4" />
              Create Post
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Scheduled Posts
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "…" : summary.totalScheduledPosts}</div>
            <p className="text-xs text-muted-foreground mt-1">Across your calendar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unread Messages
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "…" : summary.pendingInboxMessages}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <AlertCircle className="inline h-3 w-3 text-amber-500 mr-1" />
              Awaiting your reply
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
            <div className="text-2xl font-bold">{loading ? "…" : summary.connectedAccounts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? "" : summary.connectedAccounts === 1 ? "Across 1 platform" : `Across ${summary.connectedAccounts} platforms`}
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
            <div className="text-2xl font-bold">{summary.totalFollowers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendingUp className="inline h-3 w-3 text-emerald-500 mr-1" />
              Live analytics pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/composer">
            <PenSquare className="h-4 w-4" />
            Create Post
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/inbox">
            <MessageSquare className="h-4 w-4" />
            View Inbox
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/analytics">
            <BarChart3 className="h-4 w-4" />
            View Analytics
          </Link>
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : recentActivity.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No posts yet. Create your first post in the Composer.
              </div>
            ) : (
              recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                      platformColors[activity.platform]
                    )}
                  >
                    {platformIcons[activity.platform] ?? "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">
                      {activity.content}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{activity.time}</span>
                    </div>
                  </div>
                  <Badge
                    variant={activity.status === "published" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {activity.status === "published" ? (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    ) : (
                      <CalendarClock className="mr-1 h-3 w-3" />
                    )}
                    {activity.status}
                  </Badge>
                </div>
              ))
            )}
            <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
              <Link href="/calendar">
                <MoreHorizontal className="h-4 w-4" />
                View all activity
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Connected Accounts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Connected Accounts</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/settings">
                Manage
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : accounts.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No connected accounts yet.
              </div>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                      platformColors[account.platform]
                    )}
                  >
                    {platformIcons[account.platform] ?? "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{account.name}</p>
                    {account.handle && (
                      <p className="text-xs text-muted-foreground">{account.handle}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground capitalize">
                      {account.platform}
                    </span>
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full",
                        account.status === "connected" || account.status === "active"
                          ? "bg-emerald-500"
                          : "bg-destructive"
                      )}
                    />
                  </div>
                </div>
              ))
            )}
            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link href="/settings">
                <Send className="mr-2 h-4 w-4" />
                Connect another account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
