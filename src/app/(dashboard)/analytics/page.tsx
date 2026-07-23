"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Heart,
  Eye,
  MessageSquare,
  BarChart3,
  Download,
  Calendar,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Mock Data ──────────────────────────────────────────────────────────────

const overviewMetrics = {
  followers: { value: 45231, change: 8.2 },
  engagement: { value: 8921, change: 12.5 },
  impressions: { value: 284567, change: -3.1 },
  posts: { value: 187, change: 5.7 },
};

const engagementOverTime = [
  { date: "Jun 16", rate: 3.2 },
  { date: "Jun 17", rate: 3.8 },
  { date: "Jun 18", rate: 4.1 },
  { date: "Jun 19", rate: 3.5 },
  { date: "Jun 20", rate: 4.5 },
  { date: "Jun 21", rate: 4.9 },
  { date: "Jun 22", rate: 4.2 },
  { date: "Jun 23", rate: 5.1 },
  { date: "Jun 24", rate: 4.8 },
  { date: "Jun 25", rate: 5.3 },
  { date: "Jun 26", rate: 5.7 },
  { date: "Jun 27", rate: 6.2 },
  { date: "Jun 28", rate: 5.9 },
  { date: "Jun 29", rate: 6.5 },
  { date: "Jun 30", rate: 6.8 },
];

const platformBreakdown = [
  { platform: "Instagram", followers: 15200, engagement: 3400, impressions: 89200 },
  { platform: "YouTube", followers: 12300, engagement: 2100, impressions: 74500 },
  { platform: "X", followers: 8900, engagement: 1800, impressions: 52300 },
  { platform: "TikTok", followers: 5400, engagement: 1100, impressions: 42100 },
  { platform: "LinkedIn", followers: 3200, engagement: 421, impressions: 18467 },
  { platform: "Facebook", followers: 4231, engagement: 300, impressions: 8000 },
];

const topPosts = [
  { id: "1", content: "Behind the scenes of our latest product launch! 🚀", platform: "instagram", likes: 2341, comments: 189, shares: 456, date: "Jun 25" },
  { id: "2", content: "Quick tip: How to boost your engagement rate", platform: "tiktok", likes: 1800, comments: 95, shares: 320, date: "Jun 23" },
  { id: "3", content: "We hit 10K followers! Thank you all 🙏", platform: "x", likes: 1200, comments: 67, shares: 210, date: "Jun 22" },
  { id: "4", content: "New feature announcement: Analytics Dashboard", platform: "linkedin", likes: 890, comments: 45, shares: 134, date: "Jun 20" },
  { id: "5", content: "Tutorial: Getting started with SEO Platform", platform: "youtube", likes: 760, comments: 82, shares: 98, date: "Jun 18" },
];

// Heatmap data - hours x days
const timeHeatmap = [
  { hour: "12AM", mon: 1, tue: 0, wed: 2, thu: 0, fri: 1, sat: 3, sun: 2 },
  { hour: "3AM", mon: 0, tue: 1, wed: 0, thu: 0, fri: 0, sat: 1, sun: 0 },
  { hour: "6AM", mon: 2, tue: 3, wed: 1, thu: 2, fri: 3, sat: 4, sun: 2 },
  { hour: "9AM", mon: 8, tue: 7, wed: 9, thu: 8, fri: 10, sat: 6, sun: 5 },
  { hour: "12PM", mon: 6, tue: 5, wed: 7, thu: 6, fri: 8, sat: 4, sun: 3 },
  { hour: "3PM", mon: 4, tue: 3, wed: 5, thu: 4, fri: 6, sat: 2, sun: 1 },
  { hour: "6PM", mon: 5, tue: 6, wed: 4, thu: 7, fri: 5, sat: 8, sun: 7 },
  { hour: "9PM", mon: 3, tue: 4, wed: 3, thu: 5, fri: 4, sat: 6, sun: 8 },
];

const platformColors = {
  Instagram: "bg-pink-500",
  YouTube: "bg-red-600",
  X: "bg-neutral-900 dark:bg-neutral-100",
  TikTok: "bg-black dark:bg-white",
  LinkedIn: "bg-blue-700",
  Facebook: "bg-blue-600",
};

const chartColors = {
  instagram: "#e1306c",
  youtube: "#ff0000",
  x: "#000000",
  tiktok: "#000000",
  linkedin: "#0077b5",
  facebook: "#1877f2",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("30d");

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Track your social media performance across all platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date Range Selector */}
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
          <Button variant="outline" size="sm">
            <Calendar className="h-4 w-4 mr-1" />
            Custom
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Followers
            </CardTitle>
            <Heart className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewMetrics.followers.value.toLocaleString()}</div>
            <div className="mt-1 flex items-center text-xs">
              {overviewMetrics.followers.change >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive mr-1" />
              )}
              <span className={overviewMetrics.followers.change >= 0 ? "text-emerald-500" : "text-destructive"}>
                {overviewMetrics.followers.change}%
              </span>
              <span className="text-muted-foreground ml-1">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Engagement
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewMetrics.engagement.value.toLocaleString()}</div>
            <div className="mt-1 flex items-center text-xs">
              {overviewMetrics.engagement.change >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive mr-1" />
              )}
              <span className={overviewMetrics.engagement.change >= 0 ? "text-emerald-500" : "text-destructive"}>
                {overviewMetrics.engagement.change}%
              </span>
              <span className="text-muted-foreground ml-1">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Impressions
            </CardTitle>
            <Eye className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewMetrics.impressions.value.toLocaleString()}</div>
            <div className="mt-1 flex items-center text-xs">
              {overviewMetrics.impressions.change >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive mr-1" />
              )}
              <span className={overviewMetrics.impressions.change >= 0 ? "text-emerald-500" : "text-destructive"}>
                {overviewMetrics.impressions.change}%
              </span>
              <span className="text-muted-foreground ml-1">vs last period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Posts
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewMetrics.posts.value}</div>
            <div className="mt-1 flex items-center text-xs">
              {overviewMetrics.posts.change >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive mr-1" />
              )}
              <span className={overviewMetrics.posts.change >= 0 ? "text-emerald-500" : "text-destructive"}>
                {overviewMetrics.posts.change}%
              </span>
              <span className="text-muted-foreground ml-1">vs last period</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Engagement Rate Over Time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement Rate Over Time</CardTitle>
            <CardDescription>Daily engagement rate across all platforms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={engagementOverTime}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Platform Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform Breakdown</CardTitle>
            <CardDescription>Followers and engagement by platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="platform" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="followers" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="engagement" fill="var(--primary)" opacity={0.5} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Performing Posts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Performing Posts</CardTitle>
            <CardDescription>Posts with the highest engagement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topPosts.map((post, i) => (
              <div key={post.id} className="flex items-start gap-3 rounded-lg border p-3">
                <span className="mt-0.5 text-xs font-bold text-muted-foreground w-5">
                  #{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm">{post.content}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="capitalize">{post.platform}</span>
                    <span>{post.date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3 text-rose-500" />
                    {post.likes.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3 text-blue-500" />
                    {post.comments}
                  </span>
                  <span className="flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                    {post.shares}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Best Time to Post Heatmap */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Best Time to Post</CardTitle>
            <CardDescription>Engagement heatmap by hour and day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="p-1.5 text-left text-muted-foreground font-medium">Time</th>
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                      <th key={day} className="p-1.5 text-center text-muted-foreground font-medium">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeHeatmap.map((row) => (
                    <tr key={row.hour}>
                      <td className="p-1.5 text-muted-foreground">{row.hour}</td>
                      {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => {
                        const val = row[day as keyof typeof row] as number;
                        const intensity = Math.min(val / 10, 1);
                        return (
                          <td key={day} className="p-1">
                            <div
                              className="h-8 w-full rounded"
                              style={{
                                backgroundColor: `color-mix(in srgb, var(--primary) ${intensity * 100}%, transparent)`,
                                opacity: intensity > 0 ? 0.3 + intensity * 0.7 : 0.1,
                              }}
                              title={`${val} engagements`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Low</span>
                <div className="flex gap-0.5">
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map((o) => (
                    <div
                      key={o}
                      className="h-3 w-3 rounded"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--primary) ${o * 100}%, transparent)`,
                        opacity: 0.3 + o * 0.7,
                      }}
                    />
                  ))}
                </div>
                <span>High</span>
              </div>
              <span>Best times highlighted in darkest shade</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
