"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Image,
  FileVideo,
  FileText,
  Hash,
  Sparkles,
  Clock,
  Send,
  Save,
  Calendar,
  X,
  Globe,
  Clapperboard,
  Music2,
  Camera,
  MessageCircle,
  Briefcase,
  ChevronDown,
  Upload,
  AlignLeft,
  Zap,
  Eye,
  Heart,
  ThumbsUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type Platform = "tiktok" | "youtube" | "instagram" | "facebook" | "x" | "linkedin";

interface PlatformInfo {
  id: Platform;
  name: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

// ─── Data ───────────────────────────────────────────────────────────────────

const platforms: PlatformInfo[] = [
  { id: "tiktok", name: "TikTok", icon: Music2, color: "text-white", bgColor: "bg-black dark:bg-white dark:text-black" },
  { id: "youtube", name: "YouTube", icon: Clapperboard, color: "text-white", bgColor: "bg-red-600" },
  { id: "instagram", name: "Instagram", icon: Camera, color: "text-white", bgColor: "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600" },
  { id: "facebook", name: "Facebook", icon: MessageCircle, color: "text-white", bgColor: "bg-blue-600" },
  { id: "x", name: "X (Twitter)", icon: Globe, color: "text-white", bgColor: "bg-neutral-900 dark:bg-white dark:text-black" },
  { id: "linkedin", name: "LinkedIn", icon: Briefcase, color: "text-white", bgColor: "bg-blue-700" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function ComposerPage() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["instagram"]);
  const [content, setContent] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCaptionDialog, setShowCaptionDialog] = useState(false);
  const [showHashtagDialog, setShowHashtagDialog] = useState(false);
  const [captionPrompt, setCaptionPrompt] = useState("");
  const [hashtagPrompt, setHashtagPrompt] = useState("");
  const [generatedCaptions, setGeneratedCaptions] = useState<string[]>([]);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [previewPlatform, setPreviewPlatform] = useState<Platform>("instagram");
  const [publishResults, setPublishResults] = useState<Record<string, { status: string; error?: string; externalId?: string }> | null>(null);
  // Connected social accounts for the workspace + per-platform selection
  const [accounts, setAccounts] = useState<Array<{ id: string; platform: string; accountName: string; accountUsername: string | null }>>([]);
  const [platformAccount, setPlatformAccount] = useState<Record<string, string>>({});
  // Attached media (composer → media_assets; IG requires at least one)
  const [attachedMedia, setAttachedMedia] = useState<Array<{ id: string; fileName: string; mediaType: string; url: string }>>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    if (!workspaceId || files.length === 0) return;
    setUploadingMedia(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("workspaceId", workspaceId);
        const res = await fetch("/api/media/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setAttachedMedia((cur) => [...cur, data]);
        toast.success(`${file.name} attached`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    // Load the user's first workspace so posts can be saved against it
    fetch("/api/workspaces")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((workspaces: Array<{ id: string }>) => {
        if (workspaces.length > 0) setWorkspaceId(workspaces[0].id);
      })
      .catch(() => toast.error("Could not load workspace"));
  }, []);

  // Load connected accounts so the composer can pick which page/account to use
  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/accounts?workspaceId=${workspaceId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: Array<{ id: string; platform: string; accountName: string; accountUsername: string | null; status: string }>) =>
        setAccounts(rows.filter((r) => r.status === "connected"))
      )
      .catch(() => {});
  }, [workspaceId]);

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platform)) return prev.filter((p) => p !== platform);
      // Default the account picker to the first connected account for this platform
      const candidates = accounts.filter((a) => a.platform === (platform === "x" ? "twitter" : platform));
      if (candidates.length > 0) {
        setPlatformAccount((cur) => (cur[platform] ? cur : { ...cur, [platform]: candidates[0].id }));
      }
      return [...prev, platform];
    });
  };

  const generate = async (type: "caption" | "hashtag", prompt: string) => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          prompt,
          platform: selectedPlatforms[0] || "default",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      return data.result.options as string[];
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateCaptions = async () => {
    const options = await generate("caption", captionPrompt);
    if (options) setGeneratedCaptions(options);
  };

  const handleGenerateHashtags = async () => {
    const options = await generate("hashtag", hashtagPrompt);
    if (options) setGeneratedHashtags(options);
  };

  const savePost = async (status: "draft" | "scheduled" | "published") => {
    if (!workspaceId) {
      toast.error("No workspace available");
      return;
    }
    if (!content.trim()) {
      toast.error("Write some content first");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Pick at least one platform");
      return;
    }
    setIsSaving(true);
    try {
      // New map convention: platformConfigs = { platform: perPlatformConfig }.
      // The composer-picked account (social_accounts.id) rides along.
      const platformConfigs = Object.fromEntries(
        selectedPlatforms.map((p) => [
          p,
          platformAccount[p] ? { accountId: platformAccount[p] } : {},
        ])
      );
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          content,
          mediaIds: attachedMedia.map((m) => m.id),
          platformConfigs,
          // Draft-first: "Publish now" saves a draft, then dispatches the
          // real cross-post (FB live; IG/TikTok report their media gap).
          status: status === "published" ? "draft" : status,
          scheduledFor:
            status === "scheduled"
              ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
              : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save post");

      if (status === "published") {
        const pub = await fetch(`/api/posts/${data.id}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const pubData = await pub.json();
        if (!pub.ok) throw new Error(pubData.error || "Failed to publish");
        setPublishResults(pubData.results ?? {});
        const ok = (Object.values(pubData.results ?? {}) as Array<{ status?: string }>).filter(
          (r) => r.status === "published"
        ).length;
        toast.success(
          ok > 0 ? `Published to ${ok} platform${ok > 1 ? "s" : ""} ✅` : "Publish attempted — check per-platform results"
        );
      } else if (status === "draft") {
        toast.success("Draft saved");
      } else {
        toast.success("Post scheduled — cross-post fires on schedule");
      }
      setContent("");
      setAttachedMedia([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save post");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content Composer</h1>
          <p className="text-sm text-muted-foreground">
            Create and schedule posts across your connected platforms
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Zap className="h-3 w-3" />
          Draft
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Platform Selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Publish To</CardTitle>
              <CardDescription>Select which platforms to publish this post to</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {platforms.map((platform) => {
                  const isSelected = selectedPlatforms.includes(platform.id);
                  const Icon = platform.icon;
                  return (
                    <button
                      key={platform.id}
                      onClick={() => togglePlatform(platform.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
                        isSelected
                          ? `${platform.bgColor} ${platform.color} shadow-sm`
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {platform.name}
                      {isSelected && <X className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 space-y-2">
                {selectedPlatforms.map((p) => {
                  const options = accounts.filter(
                    (a) => a.platform === (p === "x" ? "twitter" : p)
                  );
                  const platformName = platforms.find((x) => x.id === p)?.name ?? p;
                  if (options.length === 0) {
                    return (
                      <p key={p} className="text-xs text-amber-600">
                        {platformName}: no connected account — add one in Settings → Connected Accounts
                      </p>
                    );
                  }
                  return (
                    <div key={p} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{platformName}:</span>
                      <select
                        value={platformAccount[p] ?? ""}
                        onChange={(e) =>
                          setPlatformAccount((cur) => ({ ...cur, [p]: e.target.value }))
                        }
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                      >
                        {options.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountName}
                            {a.accountUsername ? ` (@${a.accountUsername})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Post Content</CardTitle>
              <CardDescription>Write your post or use AI to generate content</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="What would you like to share?"
                className="min-h-[200px] resize-y"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{content.length} characters</span>
                <span className="text-primary">{280 - content.length} remaining (X)</span>
              </div>
            </CardContent>
          </Card>

          {/* Media Attachment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Media</CardTitle>
              <CardDescription>Add images or videos to your post</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/mp4,video/quicktime"
                className="hidden"
                onChange={(e) => e.target.files && uploadFiles(e.target.files)}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
                }}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary/50 hover:bg-accent/50"
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">
                  {uploadingMedia ? "Uploading…" : "Drag & drop media here"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, GIF, MP4 up to 100MB
                </p>
                <Button variant="outline" size="sm" className="mt-4">
                  <Image className="h-4 w-4 mr-1" />
                  Browse Files
                </Button>
              </div>
              {attachedMedia.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachedMedia.map((m) => (
                    <div
                      key={m.id}
                      className="group relative flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5 pr-1.5 text-xs"
                    >
                      {m.mediaType === "image" ? (
                        <img
                          src={`/api/media/${m.id}/public`}
                          alt={m.fileName}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : m.mediaType === "video" ? (
                        <FileVideo className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span className="max-w-32 truncate">{m.fileName}</span>
                      <button
                        title="Remove"
                        onClick={() => setAttachedMedia((cur) => cur.filter((x) => x.id !== m.id))}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPublishNow(true)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                      publishNow
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <Send className="inline h-4 w-4 mr-1" />
                    Publish Now
                  </button>
                  <button
                    onClick={() => setPublishNow(false)}
                    className={cn(
                      "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                      !publishNow
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    <Calendar className="inline h-4 w-4 mr-1" />
                    Schedule
                  </button>
                </div>
                {!publishNow && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="w-40"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                    <Input
                      type="time"
                      className="w-28"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => savePost("draft")}
                disabled={isSaving || !content.trim()}
              >
                <Save className="h-4 w-4 mr-1" />
                {isSaving ? "Saving..." : "Save as Draft"}
              </Button>
              {!publishNow && (
                <Button
                  variant="secondary"
                  onClick={() => savePost("scheduled")}
                  disabled={isSaving || !content.trim()}
                >
                  <Calendar className="h-4 w-4 mr-1" />
                  {isSaving ? "Saving..." : "Schedule"}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 px-3 py-1.5">
                <Zap className="h-3 w-3 text-amber-500" />
                Approval required
              </Badge>
              <Button
                onClick={() => savePost(publishNow ? "published" : "scheduled")}
                disabled={isSaving || !content.trim()}
              >
                {publishNow ? (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    {isSaving ? "Publishing..." : "Publish Now"}
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-1" />
                    {isSaving ? "Saving..." : "Schedule"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Per-platform publish results */}
          {publishResults && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Publish results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(publishResults).map(([platform, r]) => (
                  <div key={platform} className="flex items-start justify-between gap-2 text-sm">
                    <span className="font-medium capitalize">{platform}</span>
                    <span
                      className={
                        r.status === "published"
                          ? "text-emerald-600"
                          : r.status === "skipped"
                            ? "text-muted-foreground"
                            : "text-red-500"
                      }
                    >
                      {r.status}
                      {r.error ? ` — ${r.error}` : ""}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* AI Tools */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-amber-500" />
                AI Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowCaptionDialog(true)}
              >
                <AlignLeft className="h-4 w-4 mr-2" />
                Generate Caption
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowHashtagDialog(true)}
              >
                <Hash className="h-4 w-4 mr-2" />
                Generate Hashtags
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Image className="h-4 w-4 mr-2" />
                Generate Image
              </Button>
              <Separator />
              <div className="rounded-lg border bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4 text-emerald-500" />
                  Best Time to Post
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Based on your audience, the best time to post on Instagram is{" "}
                  <span className="font-medium text-foreground">9:00 AM - 11:00 AM (EST)</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4 w-4" />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs
                value={previewPlatform}
                onValueChange={(v) => setPreviewPlatform(v as Platform)}
              >
                <TabsList className="w-full flex-wrap h-auto">
                  {selectedPlatforms.map((p) => {
                    const platform = platforms.find((pl) => pl.id === p)!;
                    const Icon = platform.icon;
                    return (
                      <TabsTrigger key={p} value={p} className="flex-1">
                        <Icon className="h-3.5 w-3.5" />
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
                {platforms.map((platform) => (
                  <TabsContent key={platform.id} value={platform.id} className="mt-3">
                    <div className="rounded-lg border bg-card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className={cn("flex h-7 w-7 items-center justify-center rounded-full", platform.bgColor)}>
                          <platform.icon className="h-3.5 w-3.5 text-white" />
                        </div>
                        <span className="text-xs font-medium">{platform.name} Preview</span>
                      </div>
                      <div className="rounded-lg bg-muted p-3 min-h-[120px]">
                        <p className="text-sm">
                          {content || "Your post content will appear here..."}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Heart className="h-3 w-3" />
                        <span>0</span>
                        <MessageCircle className="h-3 w-3 ml-2" />
                        <span>0</span>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Caption Generator Dialog */}
      <Dialog open={showCaptionDialog} onOpenChange={setShowCaptionDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Caption</DialogTitle>
            <DialogDescription>
              Describe the topic, tone, and style for your caption
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Topic / Description</Label>
              <Textarea
                placeholder="e.g., Product launch announcement, enthusiastic, professional..."
                value={captionPrompt}
                onChange={(e) => setCaptionPrompt(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleGenerateCaptions}
                disabled={!captionPrompt || isGenerating}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                {isGenerating ? "Generating..." : "Generate"}
              </Button>
            </div>
            {generatedCaptions.length > 0 && (
              <div className="space-y-2">
                <Label>Generated Captions</Label>
                {generatedCaptions.map((caption, i) => (
                  <div
                    key={i}
                    className="cursor-pointer rounded-lg border p-3 text-sm transition-colors hover:bg-accent"
                    onClick={() => {
                      setContent(caption);
                      setShowCaptionDialog(false);
                    }}
                  >
                    {caption}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hashtag Generator Dialog */}
      <Dialog open={showHashtagDialog} onOpenChange={setShowHashtagDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Hashtags</DialogTitle>
            <DialogDescription>
              Enter keywords to generate relevant hashtags
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Keywords</Label>
              <Input
                placeholder="e.g., social media, marketing, growth"
                value={hashtagPrompt}
                onChange={(e) => setHashtagPrompt(e.target.value)}
              />
            </div>
            <Button
              onClick={handleGenerateHashtags}
              disabled={!hashtagPrompt || isGenerating}
            >
              <Hash className="h-4 w-4 mr-1" />
              {isGenerating ? "Generating..." : "Generate"}
            </Button>
            {generatedHashtags.length > 0 && (
              <div className="space-y-2">
                <Label>Generated Hashtags</Label>
                <div className="flex flex-wrap gap-2">
                  {generatedHashtags.map((tag, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => {
                        setContent((prev) => `${prev} ${tag}`);
                      }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
