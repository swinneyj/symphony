"use client";

import { useState } from "react";
import {
  Image,
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
  const [showCaptionDialog, setShowCaptionDialog] = useState(false);
  const [showHashtagDialog, setShowHashtagDialog] = useState(false);
  const [captionPrompt, setCaptionPrompt] = useState("");
  const [hashtagPrompt, setHashtagPrompt] = useState("");
  const [generatedCaptions, setGeneratedCaptions] = useState<string[]>([]);
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [previewPlatform, setPreviewPlatform] = useState<Platform>("instagram");

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  const handleGenerateCaptions = () => {
    // Mock AI generation
    setGeneratedCaptions([
      "Ready to level up your social media game? 🚀 Our new feature is here and it's going to change everything!",
      "Big news! We've been working on something special for you. Swipe to see what's coming next! 👀",
      "Stop scrolling! This is the post you've been waiting for. Check out our latest update! ✨",
    ]);
  };

  const handleGenerateHashtags = () => {
    setGeneratedHashtags([
      "#socialmediamanagement",
      "#contentcreator",
      "#digitalmarketing",
      "#socialmediatips",
      "#growyouraccount",
      "#marketingstrategy",
      "#socialmediamarketing",
      "#contentstrategy",
    ]);
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
            </CardContent>
          </Card>

          {/* Content Editor */}
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
            <CardContent>
              <div className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary/50 hover:bg-accent/50">
                <Upload className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Drag & drop media here</p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, GIF, MP4 up to 100MB
                </p>
                <Button variant="outline" size="sm" className="mt-4">
                  <Image className="h-4 w-4 mr-1" />
                  Browse Files
                </Button>
              </div>
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
                    <Input type="date" className="w-40" defaultValue="2025-07-24" />
                    <Input type="time" className="w-28" defaultValue="09:00" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline">
                <Save className="h-4 w-4 mr-1" />
                Save as Draft
              </Button>
              {!publishNow && (
                <Button variant="secondary">
                  <Calendar className="h-4 w-4 mr-1" />
                  Schedule
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 px-3 py-1.5">
                <Zap className="h-3 w-3 text-amber-500" />
                Approval required
              </Badge>
              <Button>
                {publishNow ? (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Publish Now
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4 mr-1" />
                    Schedule
                  </>
                )}
              </Button>
            </div>
          </div>
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
              <Button onClick={handleGenerateCaptions} disabled={!captionPrompt}>
                <Sparkles className="h-4 w-4 mr-1" />
                Generate
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
            <Button onClick={handleGenerateHashtags} disabled={!hashtagPrompt}>
              <Hash className="h-4 w-4 mr-1" />
              Generate
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
