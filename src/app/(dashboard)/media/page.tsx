"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import {
  Image,
  Film,
  Upload,
  Search,
  Grid3X3,
  List,
  CheckCheck,
  Trash2,
  X,
  Calendar,
  FileImage,
  FileVideo,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type MediaType = "image" | "video" | "all";

interface MediaItem {
  id: string;
  fileName: string;
  mediaType: "image" | "video" | "audio" | "document";
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  alt: string | null;
  createdAt: string;
  url: string | null;
  thumbnailUrl: string | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function previewUrl(item: MediaItem): string | null {
  // Private Blob assets are served through the authenticated public proxy.
  if (item.mediaType === "image" && item.id) return `/api/media/${item.id}/public`;
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function MediaPage() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MediaType>("all");
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = useCallback(async (wsId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/media?workspaceId=${encodeURIComponent(wsId)}`);
      if (res.ok) {
        const items = (await res.json()) as MediaItem[];
        setMedia(items);
      } else {
        setError("Failed to load media");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const workspaces = await res.json();
      if (workspaces.length > 0) {
        const active = resolveActiveWorkspace(workspaces);
        if (active) {
          setWorkspaceId(active.id);
          loadMedia(active.id);
        }
      } else {
        setLoading(false);
      }
    })();
  }, [loadMedia]);

  const uploadFiles = async (files: FileList | File[]) => {
    if (!workspaceId || files.length === 0) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("workspaceId", workspaceId);
        const res = await fetch("/api/media/upload", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Failed to upload ${file.name}`);
          break;
        }
      }
      await loadMedia(workspaceId);
      setNotice(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const deleteMedia = async (item: MediaItem) => {
    if (!window.confirm(`Delete "${item.fileName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/media?id=${item.id}`, { method: "DELETE" });
    if (res.ok) {
      setMedia(media.filter((m) => m.id !== item.id));
      setSelectedMedia(null);
      setNotice(`Deleted ${item.fileName}`);
    } else {
      setError("Failed to delete media");
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected file(s)?`)) return;
    let ok = true;
    for (const id of selectedIds) {
      const res = await fetch(`/api/media?id=${id}`, { method: "DELETE" });
      if (!res.ok) ok = false;
    }
    setSelectedIds(new Set());
    setBulkMode(false);
    if (workspaceId) await loadMedia(workspaceId);
    setNotice(ok ? `Deleted ${selectedIds.size} file(s)` : "Some files failed to delete");
  };

  const filteredMedia = useMemo(() => {
    return media.filter((item) => {
      if (typeFilter !== "all" && item.mediaType !== typeFilter) return false;
      if (searchQuery && !item.fileName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [media, searchQuery, typeFilter]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const isVideo = (item: MediaItem) => item.mediaType === "video";
  const isAudio = (item: MediaItem) => item.mediaType === "audio";
  const ext = (item: MediaItem) =>
    item.fileName.includes(".") ? item.fileName.split(".").pop()!.toUpperCase() : "FILE";

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
          {notice && (
            <span className="text-sm text-emerald-600">{notice}</span>
          )}
          {error && (
            <span className="text-sm text-destructive">{error}</span>
          )}
          <Button
            variant={bulkMode ? "secondary" : "outline"}
            size="sm"
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedIds(new Set());
            }}
            disabled={media.length === 0}
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
            <Button variant="destructive" size="sm" onClick={deleteSelected}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          )}
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            {uploading ? "Uploading…" : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
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
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <div className="pointer-events-none">
            <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin mb-3" />
            <p className="text-sm font-medium text-primary">Uploading…</p>
          </div>
        ) : isDragging ? (
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
          </>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading media…</div>
      ) : filteredMedia.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {media.length === 0 ? "No media yet — upload your first file above" : "No files match your filters"}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredMedia.map((item) => {
            const preview = previewUrl(item);
            return (
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
                  <div className="aspect-square relative bg-muted">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={preview}
                        alt={item.alt ?? item.fileName}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {isVideo(item) ? (
                          <Film className="h-8 w-8 text-muted-foreground" />
                        ) : isAudio(item) ? (
                          <FileImage className="h-8 w-8 text-muted-foreground" />
                        ) : (
                          <Image className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                    )}
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
                      {ext(item)}
                    </Badge>
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{item.fileName}</p>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                      <Calendar className="h-2.5 w-2.5" />
                      {formatDate(item.createdAt)}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
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
              <div className="h-12 w-12 shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                {previewUrl(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl(item)!}
                    alt={item.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : isVideo(item) ? (
                  <Film className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Image className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{item.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.width && item.height ? `${item.width} × ${item.height} · ` : ""}
                  {formatBytes(item.fileSize)}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] capitalize">
                {item.mediaType}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        {selectedMedia && (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedMedia.fileName}</DialogTitle>
              <DialogDescription>Media file details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Preview */}
              <div className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                {previewUrl(selectedMedia) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl(selectedMedia)!}
                    alt={selectedMedia.alt ?? selectedMedia.fileName}
                    className="h-full w-full object-contain"
                  />
                ) : selectedMedia.mediaType === "video" ? (
                  <Film className="h-16 w-16 text-muted-foreground" />
                ) : (
                  <Image className="h-16 w-16 text-muted-foreground" />
                )}
              </div>
              {/* Details */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">File Name</p>
                  <p className="text-sm font-medium break-all">{selectedMedia.fileName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant="secondary" className="mt-1 capitalize">
                    {selectedMedia.mediaType}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dimensions</p>
                  <p className="text-sm">
                    {selectedMedia.width && selectedMedia.height
                      ? `${selectedMedia.width} × ${selectedMedia.height}`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">File Size</p>
                  <p className="text-sm">{formatBytes(selectedMedia.fileSize)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Uploaded</p>
                  <p className="text-sm">{formatDate(selectedMedia.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Alt Text</p>
                  <p className="text-sm">{selectedMedia.alt ?? "—"}</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => deleteMedia(selectedMedia)}
                  >
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
