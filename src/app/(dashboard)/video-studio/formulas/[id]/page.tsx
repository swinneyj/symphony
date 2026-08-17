"use client";

// Formula run view — mirrors batchbot.io/app/formulas/<id>?view=run exactly:
//   Product input
//   Video settings (Mode / Resolution / Length)
//   Image settings (Resolution applied to AI images)
//   Final video settings (Reverse playback toggle + Text Overlay with Style)
//   Output (Run)
// Runs a batch through POST /api/batches; run-view overrides (duration,
// boomerang, overlay text/style, image resolution) beat formula defaults.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Loader2,
  Package,
  CheckCircle2,
  Plus,
  X,
  Search,
  Repeat,
  Type,
  Image as ImageIcon,
  Film,
} from "lucide-react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import { estimateMediaCost, formatUsd, formatTokens, type MediaCostBreakdown } from "@/lib/usage-core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Per-line overlay box — position (canvas fractions, box center) plus the
 *  style burned into the final video (font + background color). The canvas
 *  below renders these 1:1 with what video-worker's drawtext produces. */
interface OverlayBox {
  x: number;
  y: number;
  fontColor?: string; // hex #RRGGBB — default white
  bgColor?: string; // hex #RRGGBB — default black
  bgOpacity?: number; // 0..1 — 0 = transparent (no box)
}

const defaultOverlayBox = (y: number): OverlayBox => ({
  x: 0.5,
  y,
  fontColor: "#ffffff",
  bgColor: "#000000",
  bgOpacity: 0.55,
});

/** Composition grid the boxes snap to: rule-of-thirds lines + exact center. */
const SNAP_GRID = [1 / 3, 1 / 2, 2 / 3];
const SNAP_THRESHOLD = 0.04;
const snapAxis = (v: number): number => {
  for (const g of SNAP_GRID) {
    if (Math.abs(v - g) <= SNAP_THRESHOLD) return g;
  }
  return v;
};

/** "#RRGGBB" + opacity 0..1 → "rgba(r,g,b,a)" for the editor preview. */
const hexToRgba = (hex: string, opacity: number): string => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${opacity})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
};

interface Formula {
  id: string;
  name: string;
  category: string | null;
  scriptTemplate: string;
  scenePromptTemplate: string | null;
  motionPreset: string | null;
  durationSec: number | null;
  quality: string | null;
  isSystem: boolean;
  boomerang: boolean;
  overlayTemplate: string | null;
  overlayLayout: OverlayBox[] | null;
  nodeGraph: unknown;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  originalImageUrl: string | null;
  status: string;
}

interface Voice {
  id: string;
  name: string;
  provider: string;
}

const ENGINES = ["sora", "seedance", "veo", "kling"];
const LENGTH_OPTIONS = [4, 5, 6, 8, 10, 15];
const IMAGE_RES_OPTIONS = ["480p", "720p", "1080p"];

export default function FormulaRunPage() {
  const params = useParams<{ id: string }>();
  const formulaId = params.id;

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [formula, setFormula] = useState<Formula | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Run settings (BatchBot view=run controls) ────────────────────────────
  const [productIds, setProductIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  // Video settings
  const [mode, setMode] = useState<"fast" | "quality">("fast"); // Fast | Quality
  const [resolution, setResolution] = useState<"480p" | "720p">("480p");
  const [lengthSec, setLengthSec] = useState(4);
  // Image settings
  const [imageResolution, setImageResolution] = useState("720p");
  // Final video settings
  const [reversePlayback, setReversePlayback] = useState(false);
  // BatchBot Text Overlay = a LIST of draggable text lines (Text 1, Text 2, ...)
  // saved as part of the formula: overlay_template = newline-separated text,
  // overlay_layout = per-line boxes {x,y,fontColor,bgColor,bgOpacity} aligned
  // by index. The canvas below is a WYSIWYG preview — boxes render with the
  // exact colors that get burned into the video.
  const [overlayLines, setOverlayLines] = useState<string[]>([""]);
  const [overlayBoxes, setOverlayBoxes] = useState<OverlayBox[]>([defaultOverlayBox(0.12)]);
  const dragIndex = useRef<number | null>(null);
  const [overlayStyle, setOverlayStyle] = useState(62); // BatchBot default style
  // Voice / engine (Symphony-specific, kept below the mirrored sections)
  const [voiceId, setVoiceId] = useState("");
  const [engine, setEngine] = useState("seedance");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  // Usage tracking: estimate before Run, actuals after (from the usage ledger).
  const [batchId, setBatchId] = useState<string | null>(null);
  const [actual, setActual] = useState<{
    llm: { inputTokens: number; outputTokens: number; costUsd: number; estimatedCostUsd: number; calls: number };
    media: MediaCostBreakdown;
  } | null>(null);

  /** Live pre-flight estimate of the AI spend for this run. */
  const estimate = useMemo(() => {
    const quality = mode === "fast" && resolution === "480p" ? "fast" : "standard";
    const voice = voices.find((v) => v.id === voiceId);
    return estimateMediaCost({
      productCount: productIds.length,
      quality,
      durationSec: lengthSec,
      engine,
      voiceProvider: voice?.provider ?? null,
    });
  }, [productIds.length, mode, resolution, lengthSec, engine, voices, voiceId]);

  // Poll the batch while it renders so the "actual spend" panel stays real.
  useEffect(() => {
    if (!done || !batchId) return;
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/batches/${batchId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped && data.usage) setActual(data.usage);
      } catch {
        // transient — keep polling
      }
    };
    load();
    const t = setInterval(load, 20_000);
    const stop = setTimeout(() => clearInterval(t), 4 * 60 * 1000);
    return () => {
      stopped = true;
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [done, batchId]);

  // Flow chain for display (from nodeGraph when present, else flat fields).
  const chain = useMemo(() => {
    const g = formula?.nodeGraph as
      | { nodes?: Array<{ type?: string }>; edges?: Array<{ source: string; target: string }> }
      | null;
    if (g?.nodes?.length) {
      const targets = new Set(g.edges?.map((e) => e.target) ?? []);
      const byId = new Map(
        (g.nodes as Array<{ id: string; type: string }>).map((n) => [n.id, n])
      );
      const next = new Map((g.edges ?? []).map((e) => [e.source, e.target]));
      const start = g.nodes.find((n) => !targets.has((n as { id: string }).id)) ?? g.nodes[0];
      const out: string[] = [];
      let cur = (start as { id: string }).id;
      for (let i = 0; i < g.nodes.length && cur; i++) {
        const node = byId.get(cur);
        if (!node) break;
        out.push(node.type);
        cur = next.get(cur) ?? "";
      }
      return out;
    }
    // Flat fallback.
    const flat: string[] = ["product", "sceneRender", "footage"];
    if (formula?.scriptTemplate?.trim()) flat.push("script", "voice");
    if (formula?.overlayTemplate?.trim()) flat.push("overlay");
    if (formula?.boomerang) flat.push("boomerang");
    flat.push("output");
    return flat;
  }, [formula]);

  const NODE_LABELS: Record<string, string> = {
    product: "📦 Product",
    sceneRender: "🖼️ AI Image",
    footage: "🎬 AI Video",
    script: "✍️ Script",
    voice: "🎙️ Voiceover",
    overlay: "💬 Text Overlay",
    boomerang: "↺ Boomerang",
    output: "▶️ Output",
    real_image: "🖼️ Image",
    real_video: "🎞️ Clip",
    ai_image: "🖼️ AI Image",
    ai_video: "🎬 AI Video",
    text_overlay: "💬 Text Overlay",
    composition: "🎛️ Composition",
    avatar: "🧍 Avatar",
    choice: "🔀 Choice",
    video_preset_bundle: "🎞️ Clip Bundle",
    text_preset_bundle: "💬 Caption Presets",
    variable: "🔢 Variable",
    text: "💬 Text",
  };

  const loadFormula = useCallback(async () => {
    const res = await fetch(`/api/formulas/${formulaId}`);
    if (!res.ok) {
      toast.error("Formula not found");
      return;
    }
    const f: Formula = await res.json();
    setFormula(f);
    // Prefill run settings from the formula's own flow.
    setMode(f.quality === "pro" ? "quality" : "fast");
    setResolution(f.quality === "pro" ? "720p" : "480p");
    setLengthSec(f.durationSec ?? 4);
    const lines = f.overlayTemplate ? f.overlayTemplate.split("\n") : [""];
    setOverlayLines(lines);
    // Boxes: user-dragged layout + styles (localStorage, per formula) beat the
    // formula's saved layout beats the default stacked-top. Legacy saved
    // layouts may be plain {x,y} — style keys fall back to defaults.
    const normalize = (rows: unknown[]): OverlayBox[] =>
      rows.map((r) => {
        const p = (r ?? {}) as Record<string, unknown>;
        return {
          x: Number(p.x) || 0.5,
          y: Number(p.y) || 0.5,
          fontColor: typeof p.fontColor === "string" ? p.fontColor : "#ffffff",
          bgColor: typeof p.bgColor === "string" ? p.bgColor : "#000000",
          bgOpacity: p.bgOpacity != null ? Math.min(1, Math.max(0, Number(p.bgOpacity) || 0)) : 0.55,
        };
      });
    let boxes: OverlayBox[] | null = null;
    try {
      const saved = localStorage.getItem(`vs-overlay-pos:${formulaId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === lines.length) boxes = normalize(parsed);
      }
    } catch {
      /* ignore corrupt localStorage */
    }
    if (!boxes && Array.isArray(f.overlayLayout) && f.overlayLayout.length === lines.length) {
      boxes = normalize(f.overlayLayout);
    }
    setOverlayBoxes(boxes ?? lines.map((_, i) => defaultOverlayBox(0.12 + i * 0.14)));
    setReversePlayback(f.boomerang);
  }, [formulaId]);

  const loadProducts = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/products?workspaceId=${wsId}`);
    if (res.ok) {
      const rows: Product[] = await res.json();
      setProducts(rows);
      if (rows.length > 0) setProductIds((cur) => (cur.length > 0 ? cur : [rows[0].id]));
    }
  }, []);

  const loadVoices = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/voices?workspaceId=${wsId}`);
    if (res.ok) {
      const rows: Voice[] = await res.json();
      setVoices(rows);
      if (rows.length > 0) setVoiceId(rows[0].id);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/workspaces");
      if (!res.ok) return;
      const workspaces = await res.json();
      const active = resolveActiveWorkspace(workspaces);
      if (!active) return;
      setWorkspaceId(active.id);
      await Promise.all([loadFormula(), loadProducts(active.id), loadVoices(active.id)]);
      setLoading(false);
    })();
  }, [loadFormula, loadProducts, loadVoices]);

  const run = async () => {
    if (!workspaceId || !formula) return;
    if (productIds.length === 0) {
      toast.error("Select at least one product first");
      return;
    }
    setRunning(true);
    setDone(false);
    try {
      // Persist the dragged layout + styles for this formula (system formulas
      // are read-only, so the browser keeps the user's arrangement).
      try {
        localStorage.setItem(`vs-overlay-pos:${formula.id}`, JSON.stringify(overlayBoxes));
      } catch {
        /* storage full/blocked — non-fatal */
      }
      // Mode/resolution → quality. BatchBot: Fast=480p, Quality=720p.
      // 480p ≈ $0.22/s vs 720p ≈ $0.47/s on fal — fast must stay 480p.
      const quality = mode === "fast" && resolution === "480p" ? "fast" : "standard";
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: `${formula.name} — ${productIds.length} product(s)`,
          formulaId: formula.id,
          voiceId: voiceId || null,
          quality,
          provider: engine,
          productIds,
          // Run-view overrides (BatchBot view=run controls)
          durationSec: lengthSec,
          boomerang: reversePlayback,
          overlayTemplate: overlayLines.map((l) => l.trim()).filter(Boolean).join("\n") || null,
          overlayFontSize: overlayStyle,
          overlayLayout: overlayLines
            .map((l, i) => ({ line: l.trim(), box: overlayBoxes[i] ?? defaultOverlayBox(0.12) }))
            .filter((e) => e.line.length > 0)
            .map((e) => e.box),
          imageResolution,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to run");
      setBatchId(data.id ?? null);
      setDone(true);
      toast.success(`Queued — ${productIds.length} video(s) rendering now`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!formula) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Formula not found.</p>
        <Link href="/video-studio" className="mt-2 inline-block text-sm hover:underline">
          ← Back to Video Studio
        </Link>
      </main>
    );
  }

  const toggle = (on: boolean, set: (v: boolean) => void) =>
    `flex items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
      on ? "border-blue-500 bg-blue-50" : "hover:bg-muted/50"
    }`;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <Link href="/video-studio" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to formulas
        </Link>
        <div className="flex items-center gap-3 pt-2">
          <h1 className="text-2xl font-semibold">{formula.name}</h1>
          <Badge variant="secondary">{formula.isSystem ? "system" : formula.category ?? "formula"}</Badge>
        </div>
        {formula.scenePromptTemplate && (
          <p className="text-sm text-muted-foreground">{formula.scenePromptTemplate}</p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
          {chain.map((t, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="rounded bg-muted px-2 py-0.5">{NODE_LABELS[t] ?? t}</span>
              {i < chain.length - 1 && <span className="text-muted-foreground">→</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Product input */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Product input</p>
        <p className="mb-2 text-xs text-muted-foreground">Choose the product used in the formula.</p>
        {productIds.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {productIds.map((id) => {
              const p = products.find((x) => x.id === id);
              if (!p) return null;
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-md border bg-muted/40 py-1 pl-1 pr-2 text-sm"
                >
                  {p.originalImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.originalImageUrl}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                  )}
                  <span className="max-w-40 truncate">{p.name}</span>
                  <button
                    onClick={() => setProductIds((cur) => cur.filter((x) => x !== id))}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${p.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add products
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="w-full justify-start" onClick={() => setPickerOpen(true)}>
            <Package className="h-4 w-4" /> Select products
          </Button>
        )}

        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Select products</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search your products…"
                  className="pl-8"
                />
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {products.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No products yet — add them from the Products tab first.
                  </p>
                )}
                {products
                  .filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                  .map((p) => {
                    const checked = productIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() =>
                          setProductIds((cur) =>
                            checked ? cur.filter((x) => x !== p.id) : [...cur, p.id]
                          )
                        }
                        className={`flex w-full items-center gap-3 rounded-md border p-2 text-left text-sm transition-colors ${
                          checked ? "border-blue-500 bg-blue-50" : "hover:bg-muted/50"
                        }`}
                      >
                        {p.originalImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.originalImageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {checked && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />}
                      </button>
                    );
                  })}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  setPickerOpen(false);
                  setProductSearch("");
                }}
                disabled={productIds.length === 0}
              >
                {productIds.length > 0 ? `Add ${productIds.length} product(s)` : "No products selected"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {products.length === 0 && (
          <Link href="/video-studio" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
            Add a product first
          </Link>
        )}
      </section>

      {/* Video settings — AI Video */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Film className="mr-1 inline h-3.5 w-3.5" /> Video settings
        </p>
        <p className="mb-3 text-xs text-muted-foreground">Select the video settings you want.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <div className="flex gap-1 rounded-md border p-0.5">
              {(["fast", "quality"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded px-3 py-1.5 text-sm capitalize ${
                    mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Resolution</Label>
            <div className="flex gap-1 rounded-md border p-0.5">
              {(["480p", "720p"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`flex-1 rounded px-3 py-1.5 text-sm ${
                    resolution === r ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Length</Label>
            <div className="flex flex-wrap gap-1 rounded-md border p-0.5">
              {LENGTH_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setLengthSec(s)}
                  className={`flex-1 rounded px-2 py-1.5 text-sm ${
                    lengthSec === s ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Image settings */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <ImageIcon className="mr-1 inline h-3.5 w-3.5" /> Image settings
        </p>
        <p className="mb-3 text-xs text-muted-foreground">
          Quality applied to every generated AI Image.
        </p>
        <div className="space-y-1.5">
          <Label>Resolution</Label>
          <div className="flex gap-1 rounded-md border p-0.5">
            {IMAGE_RES_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setImageResolution(r)}
                className={`flex-1 rounded px-3 py-1.5 text-sm ${
                  imageResolution === r ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Final video settings — Composition */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Repeat className="mr-1 inline h-3.5 w-3.5" /> Final video settings
        </p>
        <p className="mb-3 text-xs text-muted-foreground">Options applied to your finished video.</p>

        {/* Reverse playback */}
        <button onClick={() => setReversePlayback((v) => !v)} className={`w-full ${toggle(reversePlayback, setReversePlayback)}`}>
          <Repeat className={`h-4 w-4 ${reversePlayback ? "text-blue-600" : "text-muted-foreground"}`} />
          <span className="flex-1 text-left">
            <span className="block font-medium">Reverse playback</span>
            <span className="block text-xs text-muted-foreground">
              Plays your video forward, then in reverse back to the start. Doubles the length at no
              extra credit cost.
            </span>
          </span>
          {reversePlayback && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />}
        </button>

        {/* Text overlay */}
        <div className="mt-3 space-y-2">
          <p className="text-sm font-medium">Text Overlay</p>
          <p className="text-xs text-muted-foreground">
            The text shown on top of the video. Drag each box to position it — the
            layout is saved with the formula and burned into the final video.
          </p>

          {/* 9:16 canvas with draggable text boxes — WYSIWYG of the final
              burn. Grid overlay (thirds + center) with snap-to-grid while
              dragging; boxes render with the exact font/bg colors that get
              burned into the video. */}
          <div
            className="relative aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-md border bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#f9fafb_0%_50%)] bg-[length:12px_12px] select-none"
            onPointerMove={(e) => {
              if (dragIndex.current === null) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const rawX = (e.clientX - rect.left) / rect.width;
              const rawY = (e.clientY - rect.top) / rect.height;
              // Snap the box CENTER to the composition grid (thirds + center).
              const x = Math.min(0.95, Math.max(0.05, snapAxis(rawX)));
              const y = Math.min(0.92, Math.max(0.05, snapAxis(rawY)));
              setOverlayBoxes((cur) => {
                const next = [...cur];
                next[dragIndex.current!] = { ...next[dragIndex.current!], x, y };
                return next;
              });
            }}
            onPointerUp={() => (dragIndex.current = null)}
            onPointerLeave={() => (dragIndex.current = null)}
          >
            {/* Composition grid: thirds (subtle) + center crosshair (bold).
                Snapped boxes land on these lines so the canvas center and
                symmetric splits are always visible. */}
            <div className="pointer-events-none absolute inset-0 z-0">
              <div className="absolute left-1/3 top-0 h-full w-px bg-slate-400/25" />
              <div className="absolute left-2/3 top-0 h-full w-px bg-slate-400/25" />
              <div className="absolute left-0 top-1/3 h-px w-full bg-slate-400/25" />
              <div className="absolute left-0 top-2/3 h-px w-full bg-slate-400/25" />
              <div className="absolute left-1/2 top-0 h-full w-px border-l border-dashed border-blue-400/60" />
              <div className="absolute left-0 top-1/2 h-px w-full border-t border-dashed border-blue-400/60" />
            </div>

            {overlayLines.map((line, i) => {
              const b = overlayBoxes[i] ?? defaultOverlayBox(0.12 + i * 0.14);
              const dragging = dragIndex.current === i;
              const opacity = b.bgOpacity ?? 0.55;
              return (
                <div
                  key={i}
                  className={`absolute z-10 flex cursor-grab items-center gap-1.5 rounded px-2 py-1 font-bold shadow-sm active:cursor-grabbing ${
                    dragging ? "outline outline-2 outline-blue-500" : ""
                  }`}
                  style={{
                    left: `${b.x * 100}%`,
                    top: `${b.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    color: b.fontColor ?? "#ffffff",
                    background: opacity > 0 ? hexToRgba(b.bgColor ?? "#000000", opacity) : "transparent",
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    dragIndex.current = i;
                    e.currentTarget.setPointerCapture?.(e.pointerId);
                  }}
                >
                  {dragging && (
                    <>
                      {/* Center crosshair on the active box's anchor + label */}
                      <span className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
                        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-blue-500" />
                        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-blue-500" />
                      </span>
                      <span className="absolute -top-4 left-0 rounded bg-blue-600 px-1 text-[9px] font-semibold text-white">
                        Text {i + 1}
                      </span>
                    </>
                  )}
                  <input
                    value={line}
                    onChange={(e) => {
                      const next = [...overlayLines];
                      next[i] = e.target.value;
                      setOverlayLines(next);
                    }}
                    placeholder={i === 0 ? "@product" : "Deal of the Day"}
                    className="w-28 bg-transparent text-xs font-bold outline-none placeholder:opacity-50"
                    style={{ color: "inherit" }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    title="Remove"
                    className="rounded-full bg-black/40 p-0.5 text-white/80 hover:text-red-300"
                    onClick={() => {
                      setOverlayLines((cur) => cur.filter((_, j) => j !== i));
                      setOverlayBoxes((cur) => cur.filter((_, j) => j !== i));
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Per-line style: font + background colors, exactly as burned. */}
          {overlayLines.length > 0 && (
            <div className="space-y-1.5">
              {overlayLines.map((line, i) => {
                const b = overlayBoxes[i] ?? defaultOverlayBox(0.12 + i * 0.14);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs"
                  >
                    <span className="w-12 shrink-0 font-medium text-muted-foreground">
                      {line.trim() ? `Text ${i + 1}` : `Text ${i + 1} · empty`}
                    </span>
                    <label className="flex items-center gap-1" title="Font color">
                      <span className="font-bold text-muted-foreground">A</span>
                      <input
                        type="color"
                        value={b.fontColor ?? "#ffffff"}
                        onChange={(e) =>
                          setOverlayBoxes((cur) => {
                            const next = [...cur];
                            next[i] = { ...next[i], fontColor: e.target.value };
                            return next;
                          })
                        }
                        className="h-6 w-8 cursor-pointer rounded border bg-transparent"
                      />
                    </label>
                    <label className="flex items-center gap-1" title="Background color">
                      <span
                        className="h-3.5 w-3.5 rounded-sm border border-black/20"
                        style={{ background: b.bgColor ?? "#000000" }}
                      />
                      <input
                        type="color"
                        value={b.bgColor ?? "#000000"}
                        onChange={(e) =>
                          setOverlayBoxes((cur) => {
                            const next = [...cur];
                            next[i] = { ...next[i], bgColor: e.target.value };
                            return next;
                          })
                        }
                        className="h-6 w-8 cursor-pointer rounded border bg-transparent"
                      />
                    </label>
                    <label className="flex items-center gap-1.5" title="Background opacity">
                      <span className="text-muted-foreground">bg</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((b.bgOpacity ?? 0.55) * 100)}
                        onChange={(e) =>
                          setOverlayBoxes((cur) => {
                            const next = [...cur];
                            next[i] = { ...next[i], bgOpacity: Number(e.target.value) / 100 };
                            return next;
                          })
                        }
                        className="h-1.5 w-16"
                      />
                      <span className="w-8 text-right tabular-nums text-muted-foreground">
                        {Math.round((b.bgOpacity ?? 0.55) * 100)}%
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setOverlayLines((cur) => [...cur, ""]);
                setOverlayBoxes((cur) => [...cur, defaultOverlayBox(0.12 + cur.length * 0.14)]);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Add text
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Label>Style</Label>
              <Input
                type="number"
                min={20}
                max={120}
                value={overlayStyle}
                onChange={(e) => setOverlayStyle(Number(e.target.value) || 62)}
                className="h-8 w-20"
              />
              <span className="text-xs text-muted-foreground">font size</span>
            </div>
          </div>
        </div>
      </section>

      {/* Voice / engine (Symphony extras below the mirrored sections) */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Voice &amp; engine</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Voiceover</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
            >
              <option value="">No voiceover</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Engine</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
            >
              {ENGINES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Output */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Output</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Run the workflow to generate your finished video. {lengthSec}s clip
          {reversePlayback ? " · ↺ reverse playback (doubles length)" : ""} ·{" "}
          {mode === "quality" || resolution === "720p" ? "720p" : "480p"}
        </p>

        {/* Estimated AI cost — before Run */}
        <div className="mb-3 rounded-md border border-dashed p-3 text-sm">
          <p className="flex items-center justify-between">
            <span className="font-medium">Estimated AI cost</span>
            <span className="font-semibold">
              {productIds.length === 0 ? "—" : formatUsd(estimate.totalUsd)}
            </span>
          </p>
          {productIds.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              <li className="flex justify-between">
                <span>Scene renders ({productIds.length} × ${0.04.toFixed(2)})</span>
                <span>{formatUsd(estimate.sceneImagesUsd)}</span>
              </li>
              <li className="flex justify-between">
                <span>
                  Footage ({productIds.length} × {lengthSec}s @{" "}
                  {mode === "quality" || resolution === "720p" ? "720p" : "480p"} · {engine})
                </span>
                {estimate.footageCreditBased ? (
                  <span className="text-amber-500">credit-based</span>
                ) : (
                  <span>{formatUsd(estimate.footageUsd)}</span>
                )}
              </li>
              {voiceId && (
                <li className="flex justify-between">
                  <span>Voiceover TTS</span>
                  <span>{formatUsd(estimate.ttsUsd)}</span>
                </li>
              )}
              <li className="flex justify-between">
                <span>AI tokens (script fill)</span>
                <span>$0.00 — runs locally</span>
              </li>
            </ul>
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">
            List prices (fal/Gemini/OpenAI), Aug 2026. Actuals shown after Run.
          </p>
        </div>

        <Button onClick={run} disabled={running || productIds.length === 0} className="w-full">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {running ? "Running…" : "Run"}
        </Button>
        {done && (
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Queued — track it in the Batches tab.
            <Link href="/video-studio" className="text-blue-600 hover:underline">
              View batches
            </Link>
          </p>
        )}

        {/* Actual spend — after Run (updates as jobs finish) */}
        {done && actual && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-50/40 p-3 text-sm">
            <p className="flex items-center justify-between">
              <span className="font-medium">Actual AI spend</span>
              <span className="font-semibold">
                {formatUsd(Number(actual.llm.costUsd) + Number(actual.media.totalUsd))}
              </span>
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              {actual.llm.calls > 0 && (
                <li className="flex justify-between">
                  <span>
                    LLM tokens ({actual.llm.calls} call{actual.llm.calls > 1 ? "s" : ""} ·{" "}
                    {formatTokens(actual.llm.inputTokens)} in /{" "}
                    {formatTokens(actual.llm.outputTokens)} out)
                  </span>
                  <span>{formatUsd(Number(actual.llm.costUsd))}</span>
                </li>
              )}
              <li className="flex justify-between">
                <span>Scene renders</span>
                <span>{formatUsd(actual.media.sceneImagesUsd)}</span>
              </li>
              <li className="flex justify-between">
                <span>Footage</span>
                {actual.media.footageCreditBased ? (
                  <span className="text-amber-500">credit-based</span>
                ) : (
                  <span>{formatUsd(actual.media.footageUsd)}</span>
                )}
              </li>
              {actual.media.ttsUsd > 0 && (
                <li className="flex justify-between">
                  <span>Voiceover</span>
                  <span>{formatUsd(actual.media.ttsUsd)}</span>
                </li>
              )}
              <li className="text-[11px] text-muted-foreground/70">
                Updates while videos render (≤4 min). Media billed at list prices.
              </li>
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
