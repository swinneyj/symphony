"use client";

import { useState } from "react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// ─── Mock Data ──────────────────────────────────────────────────────────────

const summaryData = {
  totalScheduledPosts: 24,
  pendingInboxMessages: 12,
  connectedAccounts: 6,
  totalFollowers: 45231,
};

const recentActivity = [
  {
    id: "1",
    type: "published",
    content: "Behind the scenes of our latest product launch! 🚀",
    platform: "instagram",
    time: "2 hours ago",
    status: "published",
  },
  {
    id: "2",
    type: "scheduled",
    content: "Check out our new blog post about social media trends for 2025",
    platform: "linkedin",
    time: "Scheduled for tomorrow at 9:00 AM",
    status: "scheduled",
  },
  {
    id: "3",
    type: "published",
    content: "Quick tip: How to boost your engagement rate in 3 easy steps",
    platform: "tiktok",
    time: "5 hours ago",
    status: "published",
  },
  {
    id: "4",
    type: "published",
    content: "We hit 10K followers! Thank you all for the support 🙏",
    platform: "x",
    time: "1 day ago",
    status: "published",
  },
  {
    id: "5",
    type: "scheduled",
    content: "Product feature spotlight: Analytics Dashboard",
    platform: "facebook",
    time: "Scheduled for Friday at 2:00 PM",
    status: "scheduled",
  },
];

const connectedAccounts = [
  { id: "1", name: "SEO Platform Official", platform: "instagram", handle: "@symphony", followers: 15200, status: "connected" },
  { id: "2", name: "SEO Platform", platform: "x", handle: "@symphonyapp", followers: 8900, status: "connected" },
  { id: "3", name: "SEO Platform", platform: "youtube", handle: "SEO Platform", followers: 12300, status: "connected" },
  { id: "4", name: "SEO Platform", platform: "tiktok", handle: "@symphony", followers: 5400, status: "connected" },
  { id: "5", name: "SEO Platform", platform: "linkedin", handle: "SEO Platform Inc.", followers: 3200, status: "connected" },
  { id: "6", name: "SEO Platform", platform: "facebook", handle: "SEO Platform", followers: 4231, status: "error" },
];

const platformColors: Record<string, string> = {
  instagram: "bg-pink-500",
  x: "bg-neutral-900 dark:bg-neutral-100",
  youtube: "bg-red-600",
  tiktok: "bg-black dark:bg-white",
  linkedin: "bg-blue-600",
  facebook: "bg-blue-500",
};

const platformIcons: Record<string, string> = {
  instagram: "IG",
  x: "X",
  youtube: "YT",
  clapperboard: "CB",
  tiktok: "TT",
  linkedin: "LN",
  facebook: "FB",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  });

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Welcome Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, Alex! 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with your social media today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/analytics">
              <BarChart3 className="h-4 w-4" />
              View Analytics
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/dashboard/composer">
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
            <div className="text-2xl font-bold">{summaryData.totalScheduledPosts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendingUp className="inline h-3 w-3 text-emerald-500 mr-1" />
              <span className="text-emerald-500">+3</span> from last week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Messages
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryData.pendingInboxMessages}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <AlertCircle className="inline h-3 w-3 text-amber-500 mr-1" />
              5 require immediate response
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
            <div className="text-2xl font-bold">{summaryData.connectedAccounts}</div>
            <p className="text-xs text-muted-foreground mt-1">Across 6 platforms</p>
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
              {summaryData.totalFollowers.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendingUp className="inline h-3 w-3 text-emerald-500 mr-1" />
              <span className="text-emerald-500">+1,247</span> this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/dashboard/composer">
            <PenSquare className="h-4 w-4" />
            Create Post
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/dashboard/inbox">
            <MessageSquare className="h-4 w-4" />
            View Inbox
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/analytics">
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
            {recentActivity.map((activity) => (
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
                  {platformIcons[activity.platform]}
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
                  variant={
                    activity.status === "published" ? "default" : "secondary"
                  }
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
            ))}
            <Button variant="ghost" size="sm" className="w-full mt-2">
              <MoreHorizontal className="h-4 w-4" />
              View all activity
            </Button>
          </CardContent>
        </Card>

        {/* Connected Accounts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Connected Accounts</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/settings">
                Manage
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {connectedAccounts.map((account) => (
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
                  {platformIcons[account.platform]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{account.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.handle} &middot;{" "}
                    {account.followers.toLocaleString()} followers
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground capitalize">
                    {account.platform}
                  </span>
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      account.status === "connected"
                        ? "bg-emerald-500"
                        : "bg-destructive"
                    )}
                  />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full mt-2" asChild>
              <Link href="/dashboard/settings">
                <Users className="mr-2 h-4 w-4" />
                Connect another account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
