"use client";

import { useState, useMemo } from "react";
import {
  Image,
  Film,
  Upload,
  Search,
  Grid3X3,
  List,
  CheckCheck,
  Trash2,
  Download,
  X,
  Calendar,
  FileImage,
  FileVideo,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type MediaType = "image" | "video" | "all";

interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  thumbnailColor: string;
  dimensions: string;
  fileSize: string;
  dateUploaded: string;
  altText: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const mockMedia: MediaItem[] = [
  { id: "m1", name: "product-launch-banner.jpg", type: "image", url: "", thumbnailColor: "bg-gradient-to-br from-blue-400 to-purple-500", dimensions: "1920 × 1080", fileSize: "2.4 MB", dateUploaded: "Jul 22, 2025", altText: "Product launch banner with gradient background" },
  { id: "m2", name: "team-photo-2025.jpg", type: "image", url: "", thumbnailColor: "bg-gradient-to-br from-amber-400 to-orange-500", dimensions: "2400 × 1600", fileSize: "3.1 MB", dateUploaded: "Jul 21, 2025", altText: "Team photo 2025" },
  { id: "m3", name: "feature-tutorial.mp4", type: "video", url: "", thumbnailColor: "bg-gradient-to-br from-emerald-400 to-teal-500", dimensions: "1920 × 1080", fileSize: "45.2 MB", dateUploaded: "Jul 20, 2025", altText: "Feature tutorial video" },
  { id: "m4", name: "social-media-tips.png", type: "image", url: "", thumbnailColor: "bg-gradient-to-br from-pink-400 to-rose-500", dimensions: "1080 × 1080", fileSize: "1.8 MB", dateUploaded: "Jul 19, 2025", altText: "Social media tips infographic" },
  { id: "m5", name: "behind-the-scenes.mp4", type: "video", url: "", thumbnailColor: "bg-gradient-to-br from-violet-400 to-indigo-500", dimensions: "1920 × 1080", fileSize: "62.8 MB", dateUploaded: "Jul 18, 2025", altText: "Behind the scenes footage" },
  { id: "m6", name: "logo-white.png", type: "image", url: "", thumbnailColor: "bg-gradient-to-br from-slate-400 to-slate-600", dimensions: "512 × 512", fileSize: "0.4 MB", dateUploaded: "Jul 17, 2025", altText: "SEO Platform logo white" },
  { id: "m7", name: "summer-promo.jpg", type: "image", url: "", thumbnailColor: "bg-gradient-to-br from-yellow-300 to-yellow-500", dimensions: "1200 × 1200", fileSize: "1.2 MB", dateUploaded: "Jul 16, 2025", altText: "Summer promotion graphic" },
  { id: "m8", name: "customer-story.mp4", type: "video", url: "", thumbnailColor: "bg-gradient-to-br from-cyan-400 to-blue-500", dimensions: "1080 × 1920", fileSize: "38.5 MB", dateUploaded: "Jul 15, 2025", altText: "Customer success story video" },
  { id: "m9", name: "analytics-dashboard.png", type: "image", url: "", thumbnailColor: "bg-gradient-to-br from-green-400 to-emerald-500", dimensions: "1600 × 900", fileSize: "0.9 MB", dateUploaded: "Jul 14, 2025", altText: "Analytics dashboard screenshot" },
  { id: "m10", name: "holiday-card.jpg", type: "image", url: "", thumbnailColor: "bg-gradient-to-br from-red-400 to-rose-500", dimensions: "1200 × 800", fileSize: "1.5 MB", dateUploaded: "Jul 13, 2025", altText: "Holiday greeting card" },
  { id: "m11", name: "product-demo.mp4", type: "video", url: "", thumbnailColor: "bg-gradient-to-br from-purple-400 to-pink-500", dimensions: "1920 × 1080", fileSize: "85.1 MB", dateUploaded: "Jul 12, 2025", altText: "Product demonstration video" },
  { id: "m12", name: "banner-ad.jpg", type: "image", url: "", thumbnailColor: "bg-gradient-to-br from-indigo-400 to-purple-500", dimensions: "728 × 90", fileSize: "0.3 MB", dateUploaded: "Jul 11, 2025", altText: "Banner advertisement" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function MediaPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MediaType>("all");
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const filteredMedia = useMemo(() => {
    return mockMedia.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;
      if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [searchQuery, typeFilter]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Media Library</h1>
          <p className="text-sm text-muted-foreground">
            Manage your images and videos for social posts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={bulkMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedIds(new Set());
            }}
          >
            {bulkMode ? (
              <>
                <CheckCheck className="h-4 w-4 mr-1" />
                Done ({selectedIds.size})
              </>
            ) : (
              <>
                <CheckCheck className="h-4 w-4 mr-1" />
                Select
              </>
            )}
          </Button>
          {bulkMode && selectedIds.size > 0 && (
            <>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            </>
          )}
          <Button size="sm">
            <Upload className="h-4 w-4 mr-1" />
            Upload
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search media..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex rounded-lg border p-0.5">
          {(["all", "image", "video"] as MediaType[]).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={cn(
                "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                typeFilter === type
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {type === "image" && <FileImage className="h-3 w-3" />}
              {type === "video" && <FileVideo className="h-3 w-3" />}
              {type}
            </button>
          ))}
        </div>
        <div className="ml-auto flex rounded-lg border p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              viewMode === "grid" ? "bg-accent" : "text-muted-foreground"
            )}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              viewMode === "list" ? "bg-accent" : "text-muted-foreground"
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Upload Drop Zone */}
      <div
        className={cn(
          "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
      >
        {isDragging ? (
          <div className="pointer-events-none">
            <Upload className="mx-auto h-10 w-10 text-primary mb-3" />
            <p className="text-sm font-medium text-primary">Drop files here to upload</p>
          </div>
        ) : (
          <>
            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Drag & drop files or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">
              PNG, JPG, GIF, MP4, MOV up to 500MB
            </p>
            <Button variant="outline" size="sm" className="mt-4">
              <Upload className="h-4 w-4 mr-1" />
              Choose Files
            </Button>
          </>
        )}
      </div>

      {/* Media Grid */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredMedia.map((item) => (
            <div
              key={item.id}
              className={cn(
                "group relative overflow-hidden rounded-lg border transition-all hover:shadow-md",
                selectedIds.has(item.id) && "ring-2 ring-primary"
              )}
            >
              <button
                onClick={() => {
                  if (bulkMode) {
                    toggleSelect(item.id);
                  } else {
                    setSelectedMedia(item);
                  }
                }}
                className="w-full text-left"
              >
                <div className={cn("aspect-square relative", item.thumbnailColor)}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {item.type === "video" ? (
                      <Film className="h-8 w-8 text-white/80" />
                    ) : (
                      <Image className="h-8 w-8 text-white/80" />
                    )}
                  </div>
                  {bulkMode && (
                    <div className={cn(
                      "absolute top-2 left-2 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                      selectedIds.has(item.id)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-muted-foreground"
                    )}>
                      {selectedIds.has(item.id) && (
                        <CheckCheck className="h-3 w-3" />
                      )}
                    </div>
                  )}
                  <Badge
                    variant="secondary"
                    className="absolute top-2 right-2 text-[9px] px-1.5 py-0"
                  >
                    {item.type === "video" ? "MP4" : "JPG"}
                  </Badge>
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium">{item.name}</p>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                    <Calendar className="h-2.5 w-2.5" />
                    {item.dateUploaded}
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="rounded-lg border">
          {filteredMedia.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedMedia(item)}
              className="flex w-full items-center gap-4 border-b last:border-b-0 px-4 py-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className={cn("h-12 w-12 shrink-0 rounded-lg flex items-center justify-center", item.thumbnailColor)}>
                {item.type === "video" ? (
                  <Film className="h-5 w-5 text-white" />
                ) : (
                  <Image className="h-5 w-5 text-white" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.dimensions} &middot; {item.fileSize}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">
                {item.type}
              </Badge>
              <span className="text-xs text-muted-foreground">{item.dateUploaded}</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        {selectedMedia && (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedMedia.name}</DialogTitle>
              <DialogDescription>Media file details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Preview */}
              <div className={cn(
                "aspect-square rounded-lg flex items-center justify-center",
                selectedMedia.thumbnailColor
              )}>
                {selectedMedia.type === "video" ? (
                  <Film className="h-16 w-16 text-white/80" />
                ) : (
                  <Image className="h-16 w-16 text-white/80" />
                )}
              </div>
              {/* Details */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">File Name</p>
                  <p className="text-sm font-medium">{selectedMedia.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant="secondary" className="mt-1 capitalize">
                    {selectedMedia.type}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dimensions</p>
                  <p className="text-sm">{selectedMedia.dimensions}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">File Size</p>
                  <p className="text-sm">{selectedMedia.fileSize}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Uploaded</p>
                  <p className="text-sm">{selectedMedia.dateUploaded}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Alt Text</p>
                  <Input defaultValue={selectedMedia.altText} className="mt-1" />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1">
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  <Button size="sm" variant="destructive" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
