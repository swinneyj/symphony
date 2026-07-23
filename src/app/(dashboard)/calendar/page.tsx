"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Music2,
  Clapperboard,
  Camera,
  MessageCircle,
  Globe,
  Briefcase,
  Filter,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week" | "day";
type Platform = "tiktok" | "youtube" | "instagram" | "facebook" | "x" | "linkedin";
type PostStatus = "published" | "scheduled" | "draft" | "pending";

interface Post {
  id: string;
  content: string;
  platform: Platform;
  date: Date;
  status: PostStatus;
  time: string;
}

// ─── Data ───────────────────────────────────────────────────────────────────

const platformIcons: Record<Platform, React.ElementType> = {
  tiktok: Music2,
  youtube: Clapperboard,
  instagram: Camera,
  facebook: MessageCircle,
  x: Globe,
  linkedin: Briefcase,
};

const platformColors: Record<Platform, string> = {
  tiktok: "bg-black dark:bg-white",
  youtube: "bg-red-600",
  instagram: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600",
  facebook: "bg-blue-600",
  x: "bg-neutral-900 dark:bg-neutral-100",
  linkedin: "bg-blue-700",
};

const statusColors: Record<PostStatus, string> = {
  published: "bg-emerald-500",
  scheduled: "bg-blue-500",
  draft: "bg-muted-foreground",
  pending: "bg-amber-500",
};

const platforms: { id: Platform; name: string }[] = [
  { id: "tiktok", name: "TikTok" },
  { id: "youtube", name: "YouTube" },
  { id: "instagram", name: "Instagram" },
  { id: "facebook", name: "Facebook" },
  { id: "x", name: "X" },
  { id: "linkedin", name: "LinkedIn" },
];

const statuses: { id: PostStatus; name: string }[] = [
  { id: "published", name: "Published" },
  { id: "scheduled", name: "Scheduled" },
  { id: "draft", name: "Draft" },
  { id: "pending", name: "Pending" },
];

const mockPosts: Post[] = [
  { id: "1", content: "Behind the scenes of our latest shoot!", platform: "instagram", date: new Date(2025, 6, 23), status: "scheduled", time: "9:00 AM" },
  { id: "2", content: "New product launch coming soon 🚀", platform: "tiktok", date: new Date(2025, 6, 23), status: "scheduled", time: "2:00 PM" },
  { id: "3", content: "Thank you for 10K followers!", platform: "x", date: new Date(2025, 6, 22), status: "published", time: "11:30 AM" },
  { id: "4", content: "Check out our latest blog post", platform: "linkedin", date: new Date(2025, 6, 24), status: "scheduled", time: "10:00 AM" },
  { id: "5", content: "Weekly tips for better engagement", platform: "facebook", date: new Date(2025, 6, 25), status: "draft", time: "" },
  { id: "6", content: "Tutorial: How to use our analytics", platform: "youtube", date: new Date(2025, 6, 25), status: "scheduled", time: "3:00 PM" },
  { id: "7", content: "Summer sale announcement!", platform: "instagram", date: new Date(2025, 6, 26), status: "pending", time: "12:00 PM" },
  { id: "8", content: "Team spotlight: Meet our designers", platform: "linkedin", date: new Date(2025, 6, 21), status: "published", time: "9:00 AM" },
  { id: "9", content: "Feature highlight: AI Captions ✨", platform: "tiktok", date: new Date(2025, 6, 28), status: "scheduled", time: "4:00 PM" },
  { id: "10", content: "User testimonial of the week", platform: "instagram", date: new Date(2025, 6, 20), status: "published", time: "1:00 PM" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 6, 1));
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [platformFilter, setPlatformFilter] = useState<Platform | "all">("all");
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");

  const filteredPosts = useMemo(() => {
    return mockPosts.filter((post) => {
      if (platformFilter !== "all" && post.platform !== platformFilter) return false;
      if (statusFilter !== "all" && post.status !== statusFilter) return false;
      return true;
    });
  }, [platformFilter, statusFilter]);

  const postsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return filteredPosts.filter((post) => isSameDay(post.date, selectedDate));
  }, [filteredPosts, selectedDate]);

  // ─── Month Grid ───────────────────────────────────────────────────────────

  const renderMonthGrid = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    const days: Date[] = [];
    let d = calStart;
    while (d <= calEnd) {
      days.push(d);
      d = addDays(d, 1);
    }

    const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
      <div>
        <div className="grid grid-cols-7 mb-1">
          {dayHeaders.map((h) => (
            <div key={h} className="py-2 text-center text-xs font-medium text-muted-foreground">
              {h}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {days.map((day) => {
            const postsToday = filteredPosts.filter((p) => isSameDay(p.date, day));
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "min-h-[100px] bg-card p-1.5 text-left transition-colors hover:bg-accent/50",
                  !isCurrentMonth && "opacity-40",
                  isSelected && "ring-2 ring-primary ring-inset",
                  isToday(day) && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    isToday(day) && "bg-primary text-primary-foreground font-bold"
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="mt-1 space-y-1">
                  {postsToday.slice(0, 3).map((post) => {
                    const Icon = platformIcons[post.platform];
                    return (
                      <div
                        key={post.id}
                        className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate"
                        style={{
                          backgroundColor: post.status === "scheduled" ? "hsl(221, 83%, 53%)" :
                                          post.status === "published" ? "hsl(160, 84%, 39%)" :
                                          post.status === "pending" ? "hsl(38, 92%, 50%)" :
                                          "hsl(215, 16%, 47%)",
                          color: "white",
                        }}
                      >
                        <Icon className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{post.content}</span>
                      </div>
                    );
                  })}
                  {postsToday.length > 3 && (
                    <span className="text-[10px] text-muted-foreground pl-1">
                      +{postsToday.length - 3} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Plan and manage your content schedule
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/composer">
            <Plus className="h-4 w-4 mr-1" />
            Create Post
          </Link>
        </Button>
      </div>

      {/* View Toggle & Navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {(["month", "week", "day"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[180px] text-center text-lg font-semibold">
            {format(currentDate, "MMMM yyyy")}
          </h2>
          <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {/* Platform filter */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setPlatformFilter("all")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              platformFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            All
          </button>
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlatformFilter(p.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                platformFilter === p.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
        <Separator orientation="vertical" className="h-5" />
        {/* Status filter */}
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setStatusFilter("all")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            All
          </button>
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                statusFilter === s.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar + Side Panel */}
      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          {viewMode === "month" && renderMonthGrid()}
          {viewMode === "week" && (
            <div className="flex items-center justify-center rounded-lg border py-20 text-muted-foreground">
              <CalendarIcon className="h-8 w-8 mr-2" />
              Week view coming soon
            </div>
          )}
          {viewMode === "day" && (
            <div className="flex items-center justify-center rounded-lg border py-20 text-muted-foreground">
              <CalendarIcon className="h-8 w-8 mr-2" />
              Day view coming soon
            </div>
          )}
        </div>

        {/* Date Side Panel */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {selectedDate ? format(selectedDate, "MMMM d, yyyy") : "Select a date"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!selectedDate && (
                <p className="text-sm text-muted-foreground">
                  Click a date on the calendar to see its posts.
                </p>
              )}
              {selectedDate && postsForSelectedDate.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No posts scheduled for this day.
                </p>
              )}
              {postsForSelectedDate.map((post) => {
                const Icon = platformIcons[post.platform];
                return (
                  <div
                    key={post.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("flex h-6 w-6 items-center justify-center rounded-full", platformColors[post.platform])}>
                          <Icon className="h-3 w-3 text-white" />
                        </div>
                        <span className="text-xs font-medium capitalize">{post.platform}</span>
                      </div>
                      <div className={cn("h-2 w-2 rounded-full", statusColors[post.status])} />
                    </div>
                    <p className="text-xs line-clamp-2">{post.content}</p>
                    {post.time && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {post.time}
                      </div>
                    )}
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {post.status}
                    </Badge>
                  </div>
                );
              })}
              {selectedDate && (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/dashboard/composer">
                    <Plus className="h-4 w-4 mr-1" />
                    Schedule Post
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
