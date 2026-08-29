"use client";

/**
 * Image Studio tab — Higgsfield-style pipeline for TikTok Shop creators.
 *
 * Stage 1 (Image): product image + custom prompt → Nano Banana Pro scene
 *   re-render. Model, aspect ratio, quality (1K/2K/4K), batch size 1-4.
 * Stage 2 (Video): approve an image → Kling video. Video 01 / Video 03,
 *   720p/1080p, ratio, output count 1-4, duration 3-10s.
 * Stage 3 (Final): approve a video → reverse loop (duplicate + play backward)
 *   + CapCut-style text overlay (drag boxes, font, colors, fill/stroke).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Repeat,
  CheckCircle2,
  Play,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StudioProduct {
  id: string;
  name: string;
  originalImageUrl: string | null;
  processedImageUrl: string | null;
  sceneImageUrl?: string | null;
}

interface BatchJob {
  id: string;
  jobType: string;
  status: string;
  sceneImageUrl: string | null;
  footageUrl: string | null;
  finalUrl: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
}

interface BatchDetail {
  id: string;
  status: string;
  jobs: BatchJob[];
}

type OverlayFont = "tiktok" | "snapchat" | "anton" | "montserrat" | "poppins" | "bebas";
type OverlayTreatment = "outline" | "inverse" | "box" | "box-inverse" | "plain";
type OverlayAlignment = "left" | "center" | "right";

interface OverlayBox {
  x: number;
  y: number;
  fontColor?: string;
  bgColor?: string;
  bgOpacity?: number;
  fontSize?: number;
  fontFamily?: OverlayFont;
  treatment?: OverlayTreatment;
  textAlign?: OverlayAlignment;
  width?: number;
  height?: number;
}

const defaultOverlayBox = (y: number): OverlayBox => ({
  x: 0.5,
  y,
  fontColor: "#ffffff",
  bgColor: "#000000",
  bgOpacity: 1,
  fontFamily: "tiktok",
  treatment: "outline",
  textAlign: "center",
  width: 0.8,
  height: 0.16,
});

const OVERLAY_COLORS = [
  "#ffffff", "#000000", "#3797f0", "#70c050", "#fdcb5c",
  "#fd8d32", "#ed4956", "#d10869", "#a307ba", "#ffd700",
] as const;

const OVERLAY_FONTS: Array<{ value: OverlayFont; label: string }> = [
  { value: "tiktok", label: "TikTok Sans" },
  { value: "snapchat", label: "Snapchat (Inter)" },
  { value: "anton", label: "Anton" },
  { value: "montserrat", label: "Montserrat" },
  { value: "poppins", label: "Poppins" },
  { value: "bebas", label: "Bebas Neue" },
];

const FONT_STACKS: Record<OverlayFont, string> = {
  tiktok: '"TikTok Sans", "TikTok Sans Render", Arial, sans-serif',
  snapchat: '"Snap Caption Inter", Inter, Arial, sans-serif',
  anton: "Anton, Impact, sans-serif",
  montserrat: "Montserrat, Arial, sans-serif",
  poppins: "Poppins, Arial, sans-serif",
  bebas: '"Bebas Neue", Impact, sans-serif',
};

const DEFAULT_PROMPT =
  "Only use the attached image as a reference for the scale and dimensions of the product. Put the products on a dark brown wood makeup vanity table with natural lighting and photorealistic, matching lighting.";

// ─── Polling helper ─────────────────────────────────────────────────────────

async function fetchBatch(batchId: string): Promise<BatchDetail> {
  const res = await fetch(`/api/batches/${batchId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`batch fetch failed: ${res.status}`);
  return res.json();
}

function useBatchPoll(batchId: string | null, donePredicate: (b: BatchDetail) => boolean, onDone: (b: BatchDetail) => void) {
  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const b = await fetchBatch(batchId);
        if (cancelled) return;
        if (donePredicate(b)) {
          onDone(b);
          return;
        }
        timer = setTimeout(tick, 3000);
      } catch (e) {
        if (!cancelled) {
          console.error("poll error", e);
          timer = setTimeout(tick, 5000);
        }
      }
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);
}

// ─── Main tab ───────────────────────────────────────────────────────────────

export function ImageStudioTab({
  workspaceId,
  products,
}: {
  workspaceId: string;
  products: StudioProduct[];
}) {
  // Stage 1 state
  const [productId, setProductId] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [imageSize, setImageSize] = useState<"1K" | "2K" | "4K">("2K");
  const [batchSize, setBatchSize] = useState(1);
  const [genBatchId, setGenBatchId] = useState<string | null>(null);
  const [genImages, setGenImages] = useState<BatchJob[]>([]);
  const [genBusy, setGenBusy] = useState(false);

  // Stage 2 state
  const [approvedImage, setApprovedImage] = useState<string | null>(null);
  const [videoType, setVideoType] = useState("03");
  const [videoQuality, setVideoQuality] = useState("720p");
  const [videoRatio, setVideoRatio] = useState("9:16");
  const [outputCount, setOutputCount] = useState(1);
  const [durationSec, setDurationSec] = useState(5);
  const [vidBatchId, setVidBatchId] = useState<string | null>(null);
  const [vidResults, setVidResults] = useState<BatchJob[]>([]);
  const [vidBusy, setVidBusy] = useState(false);

  // Stage 3 state
  const [approvedVideo, setApprovedVideo] = useState<string | null>(null);
  const [reverse, setReverse] = useState(true);
  const [overlayLines, setOverlayLines] = useState<string[]>(["Stop overthinking it — just tap the cart"]);
  const [overlayBoxes, setOverlayBoxes] = useState<OverlayBox[]>([defaultOverlayBox(0.12)]);
  const [selectedOverlay, setSelectedOverlay] = useState(0);
  const [overlayFontSize, setOverlayFontSize] = useState(72);
  const [asmBatchId, setAsmBatchId] = useState<string | null>(null);
  const [asmResult, setAsmResult] = useState<BatchJob | null>(null);
  const [asmBusy, setAsmBusy] = useState(false);

  const product = products.find((p) => p.id === productId);
  const sourceImage = product?.sceneImageUrl ?? product?.processedImageUrl ?? product?.originalImageUrl ?? null;

  // Poll stage 1 (images done when every job has a sceneImageUrl or failed)
  useBatchPoll(
    genBatchId,
    (b) => b.jobs.length > 0 && b.jobs.every((j) => j.status === "done" || j.status === "failed"),
    (b) => {
      setGenImages(b.jobs);
      setGenBusy(false);
      setGenBatchId(null);
    }
  );

  // Poll stage 2 (videos done)
  useBatchPoll(
    vidBatchId,
    (b) => b.jobs.length > 0 && b.jobs.every((j) => j.status === "done" || j.status === "failed"),
    (b) => {
      setVidResults(b.jobs);
      setVidBusy(false);
      setVidBatchId(null);
    }
  );

  // Poll stage 3 (assembly done)
  useBatchPoll(
    asmBatchId,
    (b) => b.jobs.length > 0 && b.jobs.every((j) => j.status === "done" || j.status === "failed"),
    (b) => {
      setAsmResult(b.jobs[0] ?? null);
      setAsmBusy(false);
      setAsmBatchId(null);
    }
  );

  const runImageGen = async () => {
    if (!sourceImage) {
      toast.error("Pick a product first (it needs an image)");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Enter a prompt");
      return;
    }
    setGenBusy(true);
    setGenImages([]);
    try {
      const res = await fetch("/api/image-studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          sourceImageUrl: sourceImage,
          prompt: prompt.trim(),
          aspectRatio,
          imageSize,
          batchSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Image generation failed");
      setGenBatchId(data.batchId);
      toast.success("Generating images…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed");
      setGenBusy(false);
    }
  };

  const runVideoGen = async () => {
    if (!approvedImage) {
      toast.error("Approve an image first");
      return;
    }
    setVidBusy(true);
    setVidResults([]);
    try {
      const res = await fetch("/api/image-studio/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          imageUrl: approvedImage,
          videoType,
          quality: videoQuality,
          aspectRatio: videoRatio,
          outputCount,
          durationSec,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Video generation failed");
      setVidBatchId(data.batchId);
      toast.success("Generating videos…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Video generation failed");
      setVidBusy(false);
    }
  };

  const runAssemble = async () => {
    if (!approvedVideo) {
      toast.error("Approve a video first");
      return;
    }
    setAsmBusy(true);
    setAsmResult(null);
    try {
      const res = await fetch("/api/image-studio/assemble", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          footageUrl: approvedVideo,
          reverse,
          overlayBlocks: overlayLines.map((l) => l.trim()).filter(Boolean),
          overlayLayout: overlayLines
            .map((l, i) => ({ line: l.trim(), box: overlayBoxes[i] ?? defaultOverlayBox(0.12) }))
            .filter((e) => e.line.length > 0)
            .map((e) => e.box),
          overlayFontSize,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Assembly failed");
      setAsmBatchId(data.batchId);
      toast.success("Assembling final video…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Assembly failed");
      setAsmBusy(false);
    }
  };

  const resetAll = () => {
    setGenBatchId(null);
    setGenImages([]);
    setApprovedImage(null);
    setVidBatchId(null);
    setVidResults([]);
    setApprovedVideo(null);
    setAsmBatchId(null);
    setAsmResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Stage 1: Image generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" /> 1 · Image — Nano Banana Pro
          </CardTitle>
          <CardDescription>
            Re-render the product into a custom scene. The product image is used only as a scale/dimension
            reference — the output is an original commercial scene.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Product</Label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Aspect ratio</Label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="9:16">9:16 (TikTok vertical)</option>
                <option value="1:1">1:1 (square)</option>
                <option value="16:9">16:9 (landscape)</option>
                <option value="4:5">4:5 (portrait)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Quality</Label>
              <select
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value as "1K" | "2K" | "4K")}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Batch size</Label>
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} image{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={runImageGen} disabled={genBusy || !sourceImage} className="w-full">
                {genBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {genBusy ? "Generating…" : "Generate images"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the scene…"
            />
          </div>

          {sourceImage && (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <img src={sourceImage} alt="" className="h-16 w-16 rounded object-cover" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">{product?.name}</p>
                <p>Used as reference only (scale + dimensions).</p>
              </div>
            </div>
          )}

          {/* Stage 1 results */}
          {genImages.length > 0 && (
            <div className="space-y-2">
              <Label>Generated images — pick one to animate</Label>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {genImages.map((j, i) => (
                  <div key={j.id} className="space-y-1.5">
                    {j.sceneImageUrl ? (
                      <>
                        <img
                          src={j.sceneImageUrl}
                          alt={`render ${i + 1}`}
                          className={cn(
                            "aspect-[9/16] w-full cursor-pointer rounded-md border-2 object-cover transition",
                            approvedImage === j.sceneImageUrl
                              ? "border-blue-600 ring-2 ring-blue-600/30"
                              : "border-border hover:border-blue-400"
                          )}
                          onClick={() => setApprovedImage(j.sceneImageUrl)}
                        />
                        <Button
                          size="sm"
                          variant={approvedImage === j.sceneImageUrl ? "default" : "outline"}
                          className="w-full"
                          onClick={() => setApprovedImage(j.sceneImageUrl)}
                        >
                          {approvedImage === j.sceneImageUrl && <CheckCircle2 className="h-3.5 w-3.5" />}
                          {approvedImage === j.sceneImageUrl ? "Approved" : "Use this"}
                        </Button>
                      </>
                    ) : (
                      <div className="flex aspect-[9/16] w-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                        {j.status === "failed" ? `Failed: ${j.error ?? "error"}` : "…"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage 2: Video generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-4 w-4 text-blue-600" /> 2 · Video — Kling AI
          </CardTitle>
          <CardDescription>
            Animate the approved image with Kling. Video 01 = Kling 1.0 (standard), Video 03 = Kling 3.0 (pro).
            ~$0.15–0.50 per clip.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!approvedImage ? (
            <p className="text-sm text-muted-foreground">Approve an image in step 1 to unlock video generation.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Video type</Label>
                  <select
                    value={videoType}
                    onChange={(e) => setVideoType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="03">Video 03 (Kling 3.0 Pro)</option>
                    <option value="01">Video 01 (Kling 1.0 Standard)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Quality</Label>
                  <select
                    value={videoQuality}
                    onChange={(e) => setVideoQuality(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="720p">720p (~$0.15)</option>
                    <option value="1080p">1080p (~$0.30)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Ratio</Label>
                  <select
                    value={videoRatio}
                    onChange={(e) => setVideoRatio(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="9:16">9:16</option>
                    <option value="1:1">1:1</option>
                    <option value="16:9">16:9</option>
                    <option value="4:5">4:5</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Outputs</Label>
                  <select
                    value={outputCount}
                    onChange={(e) => setOutputCount(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} video{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-end gap-4">
                <div className="w-40 space-y-2">
                  <Label>Duration</Label>
                  <select
                    value={durationSec}
                    onChange={(e) => setDurationSec(Number(e.target.value))}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}s
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={runVideoGen} disabled={vidBusy}>
                  {vidBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {vidBusy ? "Generating…" : "Generate videos"}
                </Button>
                {vidBusy && <Badge variant="outline">~1-3 min</Badge>}
              </div>

              {vidResults.length > 0 && (
                <div className="space-y-2">
                  <Label>Generated videos — pick one for final assembly</Label>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {vidResults.map((j, i) => (
                      <div key={j.id} className="space-y-1.5">
                        {j.footageUrl ? (
                          <>
                            <video
                              src={j.footageUrl}
                              className={cn(
                                "aspect-[9/16] w-full cursor-pointer rounded-md border-2 bg-black object-contain transition",
                                approvedVideo === j.footageUrl
                                  ? "border-blue-600 ring-2 ring-blue-600/30"
                                  : "border-border hover:border-blue-400"
                              )}
                              muted
                              loop
                              playsInline
                              preload="metadata"
                              onClick={() => setApprovedVideo(j.footageUrl)}
                            />
                            <Button
                              size="sm"
                              variant={approvedVideo === j.footageUrl ? "default" : "outline"}
                              className="w-full"
                              onClick={() => setApprovedVideo(j.footageUrl)}
                            >
                              {approvedVideo === j.footageUrl && <CheckCircle2 className="h-3.5 w-3.5" />}
                              {approvedVideo === j.footageUrl ? "Approved" : "Use this"}
                            </Button>
                          </>
                        ) : (
                          <div className="flex aspect-[9/16] w-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                            {j.status === "failed" ? `Failed: ${j.error ?? "error"}` : "…"}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Stage 3: Assembly — reverse + text overlay */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-blue-600" /> 3 · Final — reverse loop + text overlay
          </CardTitle>
          <CardDescription>
            Duplicate the clip and play it backward (2× length, $0), then burn CapCut-style text onto it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!approvedVideo ? (
            <p className="text-sm text-muted-foreground">Approve a video in step 2 to unlock final assembly.</p>
          ) : (
            <>
              <button
                onClick={() => setReverse((v) => !v)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-4 py-3 text-left text-sm transition",
                  reverse ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40" : "border-border"
                )}
              >
                <span className="flex items-center gap-2 font-medium">
                  <Repeat className="h-4 w-4" /> Reverse loop (duplicate + play backward)
                </span>
                {reverse && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
              </button>
              <p className="text-xs text-muted-foreground">
                {reverse ? "5s clip → 10s video (forward then reversed)." : "Keep the clip as generated."}
              </p>

              <OverlayEditor
                lines={overlayLines}
                setLines={setOverlayLines}
                boxes={overlayBoxes}
                setBoxes={setOverlayBoxes}
                selected={selectedOverlay}
                setSelected={setSelectedOverlay}
                fontSize={overlayFontSize}
                setFontSize={setOverlayFontSize}
                previewUrl={approvedVideo}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={runAssemble} disabled={asmBusy}>
                  {asmBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {asmBusy ? "Assembling…" : "Build final video"}
                </Button>
                <Button variant="ghost" onClick={resetAll}>
                  <X className="h-4 w-4" /> Start over
                </Button>
                {asmBusy && <Badge variant="outline">~30-60s</Badge>}
              </div>

              {asmResult?.finalUrl && (
                <div className="space-y-2">
                  <Label>Final video</Label>
                  <video
                    src={asmResult.finalUrl}
                    className="aspect-[9/16] w-64 rounded-md border bg-black object-contain"
                    controls
                    playsInline
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={asmResult.finalUrl} target="_blank" rel="noreferrer">
                        Open full size
                      </a>
                    </Button>
                  </div>
                </div>
              )}
              {asmResult?.status === "failed" && (
                <p className="text-sm text-red-600">Assembly failed: {asmResult.error}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CapCut-style overlay editor ─────────────────────────────────────────────

function OverlayEditor({
  lines,
  setLines,
  boxes,
  setBoxes,
  selected,
  setSelected,
  fontSize,
  setFontSize,
  previewUrl,
}: {
  lines: string[];
  setLines: (l: string[]) => void;
  boxes: OverlayBox[];
  setBoxes: React.Dispatch<React.SetStateAction<OverlayBox[]>>;
  selected: number;
  setSelected: (i: number) => void;
  fontSize: number;
  setFontSize: (n: number) => void;
  previewUrl: string;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragIndex = useRef<number | null>(null);

  const updateSelected = (patch: Partial<OverlayBox>) => {
    setBoxes(
      boxes.map((b, i) => (i === selected ? { ...b, ...patch } : b))
    );
  };

  const onPointerDown = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    dragIndex.current = i;
    setSelected(i);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const x = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
      const idx = dragIndex.current;
      if (idx === null) return;
      setBoxes(cur => cur.map((b, bi) => (bi === idx ? { ...b, x, y } : b)));
    };
    const up = () => {
      dragIndex.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const canvasScale = 0.55; // preview canvas shrink factor

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Canvas */}
      <div className="space-y-2">
        <Label>Text canvas (drag to position)</Label>
        <div
          ref={canvasRef}
          data-testid="overlay-canvas"
          className="relative w-full overflow-hidden rounded-md border bg-black"
          style={{ aspectRatio: "9/16" }}
        >
          <video
            src={previewUrl}
            className="absolute inset-0 h-full w-full object-cover opacity-80"
            muted
            loop
            playsInline
            preload="metadata"
          />
          {lines.map((line, i) => {
            const b = boxes[i] ?? defaultOverlayBox(0.12 + i * 0.14);
            const isSel = selected === i;
            const treatment = b.treatment ?? "outline";
            const isInverse = treatment === "inverse" || treatment === "box-inverse";
            const isBox = treatment === "box" || treatment === "box-inverse";
            const fill = isInverse ? "#000000" : (b.fontColor ?? "#ffffff");
            const stroke = treatment === "outline" ? "#000000" : treatment === "inverse" ? "#ffffff" : "transparent";
            const background = treatment === "box"
              ? `${b.bgColor ?? "#000000"}${Math.round((b.bgOpacity ?? 1) * 255).toString(16).padStart(2, "0")}`
              : treatment === "box-inverse"
                ? "#ffffff"
                : "transparent";
            const boxFontSize = Math.max(8, Math.round((b.fontSize ?? fontSize) * canvasScale));
            return (
              <div
                key={i}
                onPointerDown={(e) => onPointerDown(e, i)}
                onClick={() => setSelected(i)}
                className={cn(
                  "absolute flex cursor-move select-none items-center justify-center overflow-hidden rounded px-2 text-center",
                  isSel && "outline outline-2 outline-blue-500"
                )}
                style={{
                  left: `${((b.x ?? 0.5) - (b.width ?? 0.8) / 2) * 100}%`,
                  top: `${((b.y ?? 0.12) - (b.height ?? 0.16) / 2) * 100}%`,
                  width: `${(b.width ?? 0.8) * 100}%`,
                  height: `${(b.height ?? 0.16) * 100}%`,
                }}
              >
                <span
                  className="line-clamp-3 px-1"
                  style={{
                    fontSize: boxFontSize,
                    fontFamily: FONT_STACKS[b.fontFamily ?? "tiktok"],
                    fontWeight: b.fontFamily === "snapchat" ? 500 : 700,
                    lineHeight: 1.2,
                    color: fill,
                    background,
                    WebkitTextStroke: treatment === "plain" || isBox ? "0" : `${Math.max(1, boxFontSize / 48)}px ${stroke}`,
                    textAlign: b.textAlign ?? "center",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {line || "Overlay text…"}
                </span>
                {isSel && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLines(lines.filter((_, j) => j !== i));
                      setBoxes(boxes.filter((_, j) => j !== i));
                      setSelected(Math.max(0, i - 1));
                    }}
                    className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                    title="Delete line"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLines([...lines, ""]);
            setBoxes([...boxes, defaultOverlayBox(Math.min(0.84, 0.12 + boxes.length * 0.14))]);
            setSelected(lines.length);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add text
        </Button>
      </div>

      {/* Style panel */}
      <div className="space-y-4">
        {lines.map((line, i) => (
          <div key={i} className={cn("space-y-2 rounded-md border p-3", selected === i && "border-blue-600")}>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Text {i + 1}</Label>
              {i === selected && (
                <Badge variant="outline" className="text-[10px]">selected</Badge>
              )}
            </div>
            <Input
              value={line}
              onChange={(e) => setLines(lines.map((l, j) => (j === i ? e.target.value : l)))}
              onFocus={() => setSelected(i)}
              placeholder="Overlay text…"
            />
            {selected === i && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Font</Label>
                    <select
                      value={boxes[i]?.fontFamily ?? "tiktok"}
                      onChange={(e) => updateSelected({ fontFamily: e.target.value as OverlayFont })}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      {OVERLAY_FONTS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Style</Label>
                    <select
                      value={boxes[i]?.treatment ?? "outline"}
                      onChange={(e) => updateSelected({ treatment: e.target.value as OverlayTreatment })}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="outline">Outline (stroke)</option>
                      <option value="inverse">Inverse (fill)</option>
                      <option value="box">Box (fill)</option>
                      <option value="box-inverse">Box inverse</option>
                      <option value="plain">Plain</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fill color</Label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={boxes[i]?.fontColor ?? "#ffffff"}
                        onChange={(e) => updateSelected({ fontColor: e.target.value })}
                        className="h-8 w-10 cursor-pointer rounded border"
                      />
                      <span className="text-[10px] text-muted-foreground">{boxes[i]?.fontColor ?? "#ffffff"}</span>
                    </div>
                  </div>
                  {(boxes[i]?.treatment === "box" || boxes[i]?.treatment === "box-inverse") && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Box color</Label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={boxes[i]?.bgColor ?? "#000000"}
                          onChange={(e) => updateSelected({ bgColor: e.target.value })}
                          className="h-8 w-10 cursor-pointer rounded border"
                        />
                        <span className="text-[10px] text-muted-foreground">{boxes[i]?.bgColor ?? "#000000"}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Align</Label>
                    <select
                      value={boxes[i]?.textAlign ?? "center"}
                      onChange={(e) => updateSelected({ textAlign: e.target.value as OverlayAlignment })}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Size</Label>
                    <Input
                      type="number"
                      min={24}
                      max={240}
                      value={boxes[i]?.fontSize ?? fontSize}
                      onChange={(e) => updateSelected({ fontSize: Number(e.target.value) || undefined })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {OVERLAY_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateSelected({ fontColor: c })}
                      className="h-6 w-6 rounded-full border border-black/10"
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        <div className="space-y-1.5">
          <Label className="text-xs">Global text size</Label>
          <input
            type="range"
            min={24}
            max={240}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full"
          />
          <span className="text-[10px] text-muted-foreground">{fontSize}px</span>
        </div>
      </div>
    </div>
  );
}
