"use client";

import { useState } from "react";
import {
  Sparkles,
  AlignLeft,
  Hash,
  Image,
  Lightbulb,
  Clock,
  Copy,
  CheckCheck,
  ChevronRight,
  Zap,
  Star,
  History,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GenerationHistory {
  id: string;
  tool: "caption" | "hashtag" | "image" | "ideas";
  prompt: string;
  result: string;
  time: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const historyItems: GenerationHistory[] = [
  { id: "h1", tool: "caption", prompt: "Product launch enthusiastic professional", result: "Generated 3 caption options", time: "2 min ago" },
  { id: "h2", tool: "hashtag", prompt: "social media marketing", result: "Generated 12 hashtags", time: "15 min ago" },
  { id: "h3", tool: "image", prompt: "Modern office with diverse team collaborating", result: "Generated image", time: "1 hour ago" },
  { id: "h4", tool: "ideas", prompt: "Fitness industry", result: "Generated 8 content ideas", time: "3 hours ago" },
  { id: "h5", tool: "caption", prompt: "Thank you message to followers", result: "Generated 3 caption options", time: "1 day ago" },
];

// ─── Sub-components ─────────────────────────────────────────────────────────

function CaptionGenerator() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [generated, setGenerated] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const tones = ["professional", "casual", "humorous", "inspirational", "urgent"];
  const lengths = ["short", "medium", "long"];

  const handleGenerate = () => {
    setGenerated([
      `Ready to transform your social media presence? 🚀 Our latest update brings you powerful new tools to create, schedule, and analyze your content like never before.`,
      `Stop scrolling! This is the post you've been waiting for. Discover how SEO Platform can 10x your social media game in minutes. ✨`,
      `Big things are happening! We've been working around the clock to bring you features that will change how you manage social media. Here's what's new 👀`,
      `Your social media strategy is about to get a major upgrade. Introducing the new way to manage, create, and grow — all from one place.`,
    ]);
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Topic / Description</label>
        <Textarea
          placeholder="Describe what your post is about..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="min-h-[80px]"
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Tone</label>
          <div className="flex flex-wrap gap-1">
            {tones.map((t) => (
              <button
                key={t}
                onClick={() => setTone(t)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                  tone === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Length</label>
          <div className="flex gap-1">
            {lengths.map((l) => (
              <button
                key={l}
                onClick={() => setLength(l)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                  length === l ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Button onClick={handleGenerate} disabled={!topic}>
        <Sparkles className="h-4 w-4 mr-1" />
        Generate Captions
      </Button>
      {generated.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <p className="text-sm font-medium">Generated Captions</p>
          {generated.map((caption, i) => (
            <div
              key={i}
              className="group relative rounded-lg border p-4"
            >
              <p className="text-sm pr-8">{caption}</p>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => copyToClipboard(caption, i)}
              >
                {copiedIndex === i ? (
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HashtagGenerator() {
  const [keywords, setKeywords] = useState("");
  const [generated, setGenerated] = useState<{ tag: string; popularity: "high" | "medium" | "low" }[]>([]);

  const handleGenerate = () => {
    setGenerated([
      { tag: "#socialmediamanagement", popularity: "high" },
      { tag: "#contentcreator", popularity: "high" },
      { tag: "#digitalmarketing", popularity: "high" },
      { tag: "#socialmediatips", popularity: "medium" },
      { tag: "#growyouraccount", popularity: "medium" },
      { tag: "#marketingstrategy", popularity: "medium" },
      { tag: "#socialmediamarketing", popularity: "high" },
      { tag: "#contentstrategy", popularity: "medium" },
      { tag: "#smm", popularity: "low" },
      { tag: "#socialmedia", popularity: "high" },
      { tag: "#onlinemarketing", popularity: "medium" },
      { tag: "#brandingtips", popularity: "low" },
    ]);
  };

  const popularityColor = (p: string) => {
    switch (p) {
      case "high": return "bg-emerald-500";
      case "medium": return "bg-amber-500";
      case "low": return "bg-muted-foreground";
      default: return "bg-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Keywords</label>
        <Input
          placeholder="e.g., social media, marketing, growth"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
      </div>
      <Button onClick={handleGenerate} disabled={!keywords}>
        <Hash className="h-4 w-4 mr-1" />
        Generate Hashtags
      </Button>
      {generated.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Generated Hashtags</p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-emerald-500" /> High
              </span>
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-amber-500" /> Medium
              </span>
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-muted-foreground" /> Low
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {generated.map((item, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="cursor-pointer gap-1.5 px-3 py-1.5 text-sm"
                onClick={() => navigator.clipboard.writeText(item.tag)}
              >
                {item.tag}
                <div className={cn("h-2 w-2 rounded-full", popularityColor(item.popularity))} />
              </Badge>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            navigator.clipboard.writeText(generated.map(g => g.tag).join(" "));
          }}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy All
          </Button>
        </div>
      )}
    </div>
  );
}

function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("realistic");

  const styles = ["realistic", "illustration", "3d-render", "pixel-art", "anime"];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Image Prompt</label>
        <Textarea
          placeholder="Describe the image you want to generate..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[80px]"
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Style</label>
        <div className="flex flex-wrap gap-1">
          {styles.map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                style === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {s.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>
      <Button disabled={!prompt}>
        <Image className="h-4 w-4 mr-1" />
        Generate Image
      </Button>

      {/* Placeholder */}
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center">
        <Image className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-muted-foreground">
          Your generated image will appear here
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Enter a prompt and click generate to create an AI image
        </p>
      </div>
    </div>
  );
}

function ContentIdeas() {
  const [niche, setNiche] = useState("");
  const [generated, setGenerated] = useState<string[]>([]);

  const niches = ["Technology", "Fashion", "Fitness", "Food", "Travel", "Finance", "Education", "Entertainment"];

  const handleGenerate = () => {
    const templates = [
      "10 Tips to Boost Your Productivity with [Niche]-Specific Tools",
      "The Ultimate Beginner's Guide to [Niche] in 2025",
      "Behind the Scenes: A Day in the Life of a [Niche] Professional",
      "Top 5 [Niche] Trends You Need to Know This Month",
      "How We Built Our [Niche] Community from Scratch",
      "Myth vs. Reality: Debunking Common [Niche] Misconceptions",
      "Case Study: How [Company] Used [Niche] to Grow 300%",
      "The Future of [Niche]: Predictions from Industry Experts",
    ];
    setGenerated(templates.map((idea) => idea.replace("[Niche]", niche || "Your")));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Niche / Industry</label>
        <Input
          placeholder="e.g., Technology, Fitness, Food..."
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {niches.map((n) => (
          <button
            key={n}
            onClick={() => setNiche(n)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              niche === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <Button onClick={handleGenerate} disabled={!niche}>
        <Lightbulb className="h-4 w-4 mr-1" />
        Generate Ideas
      </Button>
      {generated.length > 0 && (
        <div className="space-y-3">
          <Separator />
          <p className="text-sm font-medium">Content Ideas</p>
          <div className="grid gap-2">
            {generated.map((idea, i) => (
              <div
                key={i}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <p className="text-sm">{idea}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AIStudioPage() {
  const [activeTab, setActiveTab] = useState("caption");

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Studio</h1>
          <p className="text-sm text-muted-foreground">
            Generate content, captions, hashtags, and more with AI
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Zap className="h-3 w-3 text-amber-500" />
          Powered by AI
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Main Content */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full flex-wrap h-auto justify-start mb-6">
                  <TabsTrigger value="caption" className="gap-1.5">
                    <AlignLeft className="h-4 w-4" />
                    Caption Generator
                  </TabsTrigger>
                  <TabsTrigger value="hashtag" className="gap-1.5">
                    <Hash className="h-4 w-4" />
                    Hashtag Generator
                  </TabsTrigger>
                  <TabsTrigger value="image" className="gap-1.5">
                    <Image className="h-4 w-4" />
                    Image Generator
                  </TabsTrigger>
                  <TabsTrigger value="ideas" className="gap-1.5">
                    <Lightbulb className="h-4 w-4" />
                    Content Ideas
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="caption">
                  <CaptionGenerator />
                </TabsContent>
                <TabsContent value="hashtag">
                  <HashtagGenerator />
                </TabsContent>
                <TabsContent value="image">
                  <ImageGenerator />
                </TabsContent>
                <TabsContent value="ideas">
                  <ContentIdeas />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Generation History */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                Generation History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {historyItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">No generation history yet</p>
              ) : (
                historyItems.map((item) => (
                  <button
                    key={item.id}
                    className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      {item.tool === "caption" && <AlignLeft className="h-3.5 w-3.5 text-blue-500" />}
                      {item.tool === "hashtag" && <Hash className="h-3.5 w-3.5 text-purple-500" />}
                      {item.tool === "image" && <Image className="h-3.5 w-3.5 text-pink-500" />}
                      {item.tool === "ideas" && <Lightbulb className="h-3.5 w-3.5 text-amber-500" />}
                      <span className="text-xs font-medium capitalize">{item.tool}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground line-clamp-1">{item.prompt}</p>
                    <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {item.time}
                    </div>
                  </button>
                ))
              )}
              {historyItems.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full text-xs">
                  View All History
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-amber-500" />
                Usage Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Today</span>
                <span className="font-medium">12 generations</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">This Week</span>
                <span className="font-medium">47 generations</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">This Month</span>
                <span className="font-medium">203 generations</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
