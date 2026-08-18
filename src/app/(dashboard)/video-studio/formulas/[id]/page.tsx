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
  AlignLeft,
  AlignCenter,
  AlignRight,
  Volume2,
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
type OverlayFont = "tiktok" | "snapchat" | "anton" | "montserrat" | "poppins" | "bebas";
type OverlayTreatment = "outline" | "inverse" | "box" | "box-inverse" | "plain";
type OverlayAlignment = "left" | "center" | "right";

interface OverlayBox {
  x: number;
  y: number;
  fontColor?: string; // hex #RRGGBB — default white
  bgColor?: string; // hex #RRGGBB — default black
  bgOpacity?: number; // 0..1 — 0 = transparent (no box)
  fontSize?: number; // px at output resolution — undefined = global Style size
  fontFamily?: OverlayFont;
  treatment?: OverlayTreatment;
  textAlign?: OverlayAlignment;
  width?: number; // canvas fraction
  height?: number; // canvas fraction
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

const OVERLAY_PRESETS = [
  ["POV Relief Hook", "POV: you finally stop overcomplicating this."],
  ["Things I Wish I Knew", "Things I wish I knew before I wasted so much time."],
  ["Nobody Tells You", "Nobody tells you this part until you are already in it."],
  ["Lazy Version", "The lazy version that still gets the result."],
  ["Save This", "Save this before you need it later."],
  ["Quiet Upgrade", "A quiet upgrade that made everything feel easier."],
  ["Seven Day Test", "I tried this for 7 days and the difference was obvious."],
  ["Tiny Rule", "One tiny rule that changed the whole routine."],
  ["Stop Doing This", "Stop doing this if you want the process to feel lighter."],
  ["Hidden Bottleneck", "The hidden bottleneck was not motivation. It was setup."],
  ["Before You Buy", "Before you buy anything else, fix this first."],
  ["Main Character Reset", "A main character reset, but actually practical."],
] as const;

const OVERLAY_COLORS = [
  "#ffffff",
  "#000000",
  "#3797f0",
  "#70c050",
  "#fdcb5c",
  "#fd8d32",
  "#ed4956",
  "#d10869",
  "#a307ba",
] as const;
const OVERLAY_EMOJIS = ["🔥", "✨", "😍", "😱", "🚀", "💥", "✅", "🛍️", "🎉", "⚡", "❤️", "😂"];

const OVERLAY_FONTS: Array<{ value: OverlayFont; label: string; group: string }> = [
  { value: "tiktok", label: "TikTok Sans", group: "Batchbot" },
  { value: "snapchat", label: "Snapchat Caption (Inter)", group: "Batchbot" },
  { value: "anton", label: "Anton", group: "Sales-focused" },
  { value: "montserrat", label: "Montserrat ExtraBold", group: "Sales-focused" },
  { value: "poppins", label: "Poppins ExtraBold", group: "Sales-focused" },
  { value: "bebas", label: "Bebas Neue", group: "Sales-focused" },
];

const FONT_STACKS: Record<OverlayFont, string> = {
  tiktok: '"TikTok Sans", "TikTok Sans Render", Arial, sans-serif',
  snapchat: '"Snap Caption Inter", Inter, Arial, sans-serif',
  anton: 'Anton, Impact, sans-serif',
  montserrat: 'Montserrat, Arial, sans-serif',
  poppins: 'Poppins, Arial, sans-serif',
  bebas: '"Bebas Neue", Impact, sans-serif',
};

const TREATMENT_ORDER: OverlayTreatment[] = ["outline", "inverse", "box", "box-inverse"];

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
  providerVoiceId?: string | null;
}

const ENGINES = [
  { value: "sora", label: "Sora" },
  { value: "seedance", label: "Seedance 2.5" },
  { value: "veo", label: "Veo 3.1" },
  { value: "kling_v1", label: "Kling 1.0" },
  { value: "kling_v3", label: "Kling 3.0" },
];
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
  const [resolution, setResolution] = useState<"480p" | "720p" | "1080p">("480p");
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
  const [selectedOverlay, setSelectedOverlay] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<string>("Custom");
  const dragIndex = useRef<number | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Resize (bottom-right handle): adjusts the selected block's canvas bounds.
  // Font size remains the dedicated Batchbot slider control.
  const resizeIndex = useRef<number | null>(null);
  const [overlayStyle, setOverlayStyle] = useState(72); // BatchBot Overlay Studio default
  // Voice / engine (Symphony-specific, kept below the mirrored sections)
  const [voiceId, setVoiceId] = useState("");
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
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
    const quality = resolution === "480p" ? "fast" : resolution === "1080p" ? "pro" : "standard";
    const voice = voices.find((v) => v.id === voiceId);
    return estimateMediaCost({
      productCount: productIds.length,
      quality,
      durationSec: lengthSec,
      engine,
      voiceProvider: voice?.provider ?? null,
    });
  }, [productIds.length, mode, resolution, lengthSec, engine, voices, voiceId]);

  const previewVoice = async () => {
    const voice = voices.find((v) => v.id === voiceId);
    if (!voice?.providerVoiceId) return;
    setPreviewingVoice(voice.id);
    try {
      const res = await fetch("/api/voices/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: voice.provider, providerVoiceId: voice.providerVoiceId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Preview failed");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewingVoice(null); };
      await audio.play();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
      setPreviewingVoice(null);
    }
  };

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
    setSelectedOverlay(0);
    setSelectedPreset(OVERLAY_PRESETS.find((preset) => preset[1] === lines[0])?.[0] ?? "Custom");
    // Editor state (lines + boxes + style) auto-saves to localStorage on every
    // edit, so navigating away never loses work. New shape = {lines, boxes,
    // style}; legacy saves are a bare array of {x,y} boxes — style keys and
    // font size fall back to defaults.
    const normalize = (rows: unknown[]): OverlayBox[] =>
      rows.map((r) => {
        const p = (r ?? {}) as Record<string, unknown>;
        const fontFamily = OVERLAY_FONTS.some((font) => font.value === p.fontFamily)
          ? (p.fontFamily as OverlayFont)
          : "tiktok";
        const treatment = (["outline", "inverse", "box", "box-inverse", "plain"] as const).includes(
          p.treatment as OverlayTreatment
        )
          ? (p.treatment as OverlayTreatment)
          : "outline";
        const textAlign = (["left", "center", "right"] as const).includes(
          p.textAlign as OverlayAlignment
        )
          ? (p.textAlign as OverlayAlignment)
          : "center";
        return {
          x: Number(p.x) || 0.5,
          y: Number(p.y) || 0.5,
          fontColor: typeof p.fontColor === "string" ? p.fontColor : "#ffffff",
          bgColor: typeof p.bgColor === "string" ? p.bgColor : "#000000",
          bgOpacity: p.bgOpacity != null ? Math.min(1, Math.max(0, Number(p.bgOpacity) || 0)) : 1,
          fontSize: typeof p.fontSize === "number" ? p.fontSize : undefined,
          fontFamily,
          treatment,
          textAlign,
          width: p.width != null ? Math.min(0.92, Math.max(0.2, Number(p.width) || 0.8)) : 0.8,
          height: p.height != null ? Math.min(0.5, Math.max(0.08, Number(p.height) || 0.16)) : 0.16,
        };
      });
    let boxes: OverlayBox[] | null = null;
    let savedStyle: number | null = null;
    try {
      const saved = localStorage.getItem(`vs-overlay-pos:${formulaId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          if (Array.isArray(parsed.lines) && parsed.lines.length > 0) setOverlayLines(parsed.lines);
          if (Array.isArray(parsed.boxes)) boxes = normalize(parsed.boxes);
          if (typeof parsed.style === "number") savedStyle = parsed.style;
        } else if (Array.isArray(parsed) && parsed.length === lines.length) {
          boxes = normalize(parsed); // legacy bare-array save
        }
      }
    } catch {
      /* ignore corrupt localStorage */
    }
    if (!boxes && Array.isArray(f.overlayLayout) && f.overlayLayout.length === lines.length) {
      boxes = normalize(f.overlayLayout);
    }
    setOverlayBoxes(boxes ?? lines.map((_, i) => defaultOverlayBox(0.12 + i * 0.14)));
    setOverlayStyle(savedStyle ?? 72);
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
      // Layout + styles already auto-saved on every edit (see autoSaveLayout
      // effect below) — nothing to persist here.
      // Mode/resolution → quality. BatchBot: Fast=480p, Quality=720p.
      // 480p ≈ $0.22/s vs 720p ≈ $0.47/s on fal — fast must stay 480p.
      const quality = resolution === "480p" ? "fast" : resolution === "1080p" ? "pro" : "standard";
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
          overlayBlocks: overlayLines.map((l) => l.trim()).filter(Boolean),
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

  // Auto-save the whole overlay editor state (lines + boxes + style) to
  // localStorage, per formula, so navigating away never loses edits. Debounced
  // 300ms, plus a pagehide flush for instant navigation. Skipped until the
  // formula finishes loading (otherwise the pre-load defaults would overwrite
  // the user's saved layout).
  useEffect(() => {
    if (loading || !formula) return;
    const persist = () => {
      try {
        localStorage.setItem(
          `vs-overlay-pos:${formula.id}`,
          JSON.stringify({ lines: overlayLines, boxes: overlayBoxes, style: overlayStyle })
        );
      } catch {
        /* storage full/blocked — non-fatal */
      }
    };
    const t = setTimeout(persist, 300);
    const flush = () => persist();
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pagehide", flush);
    };
  }, [overlayLines, overlayBoxes, overlayStyle, loading, formula]);

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
        <Link href="/video-studio?tab=formulas" className="mt-2 inline-block text-sm hover:underline">
          ← Back to Video Studio
        </Link>
      </main>
    );
  }

  const toggle = (on: boolean) =>
    `flex items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
      on ? "border-blue-500 bg-blue-50" : "hover:bg-muted/50"
    }`;

  // Editor canvas preview scale. The burn uses raw px font sizes; the canvas
  // is a compact approximation of the frame — a constant 1/3 keeps the default
  // boxes at BatchBot's modest start look instead of blowing up the small
  // preview (72px default → ~24px on canvas, matching Batchbot Overlay Studio).
  const canvasScale = 1 / 3;
  const activeOverlayBox = overlayBoxes[selectedOverlay] ?? defaultOverlayBox(0.12);
  const updateSelectedOverlayBox = (patch: Partial<OverlayBox>) => {
    setOverlayBoxes((cur) => {
      const next = [...cur];
      next[selectedOverlay] = { ...(next[selectedOverlay] ?? defaultOverlayBox(0.12)), ...patch };
      return next;
    });
  };

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="space-y-1">
        <Link href="/video-studio?tab=formulas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
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
          <DialogContent className="min-w-0 max-w-md overflow-hidden">
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
              <div className="min-w-0 max-h-72 space-y-1 overflow-x-hidden overflow-y-auto">
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
                        className={`flex min-w-0 w-full max-w-full items-center gap-3 overflow-hidden rounded-md border p-2 text-left text-sm transition-colors ${
                          checked ? "border-blue-500 bg-blue-50" : "hover:bg-muted/50"
                        }`}
                        style={{ minWidth: 0 }}
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
                        <span
                          className="block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{ minWidth: 0 }}
                          title={p.name}
                        >
                          {p.name}
                        </span>
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
              {(["480p", "720p", "1080p"] as const).map((r) => (
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
        <button onClick={() => setReversePlayback((v) => !v)} className={`w-full ${toggle(reversePlayback)}`}>
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
        <div className="mt-4 border-t pt-5">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-orange-700" />
            <p className="text-sm font-semibold">Text Overlay</p>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Text overlay
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            The text shown on top of the video. Leave it blank to add no overlay text.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-start">
            <div className="mx-auto w-full max-w-[15rem]">
              <div
                ref={canvasRef}
                data-testid="overlay-canvas"
                className="relative aspect-[9/16] w-full overflow-hidden rounded-[14px] border border-slate-900/10 bg-[#bcc4cd] shadow-[0_10px_32px_rgba(16,24,40,0.20)] select-none"
                style={{
                  backgroundImage:
                    "repeating-conic-gradient(#9aa4b1 0% 25%, #bcc4cd 0% 50%)",
                  backgroundSize: "16px 16px",
                }}
                onPointerMove={(e) => {
                  if (dragIndex.current === null) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rawX = (e.clientX - rect.left) / rect.width;
                  const rawY = (e.clientY - rect.top) / rect.height;
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
                {overlayLines.map((line, i) => {
                  const b = overlayBoxes[i] ?? defaultOverlayBox(0.12 + i * 0.14);
                  const treatment = b.treatment ?? "outline";
                  const selected = selectedOverlay === i;
                  const isInverse = treatment === "inverse" || treatment === "box-inverse";
                  const isBox = treatment === "box" || treatment === "box-inverse";
                  const fill = isInverse ? "#000000" : (b.fontColor ?? "#ffffff");
                  const stroke = treatment === "outline" ? "#000000" : treatment === "inverse" ? "#ffffff" : "transparent";
                  const background = treatment === "box"
                    ? hexToRgba(b.bgColor ?? "#000000", b.bgOpacity ?? 1)
                    : treatment === "box-inverse"
                      ? hexToRgba("#ffffff", b.bgOpacity ?? 1)
                      : "transparent";
                  const fontSize = Math.max(8, Math.round((b.fontSize ?? overlayStyle) * canvasScale));
                  const width = b.width ?? 0.8;
                  const height = b.height ?? 0.16;
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      aria-label={`Text ${i + 1}: ${line || "empty"}`}
                      className={`absolute z-10 flex touch-none cursor-grab items-center px-2 py-1 active:cursor-grabbing ${
                        selected ? "border border-[#0d99ff] ring-2 ring-[#0d99ff]/30" : "border border-transparent"
                      }`}
                      style={{
                        left: `${(b.x - width / 2) * 100}%`,
                        top: `${(b.y - height / 2) * 100}%`,
                        width: `${width * 100}%`,
                        height: `${height * 100}%`,
                        justifyContent: b.textAlign === "left" ? "flex-start" : b.textAlign === "right" ? "flex-end" : "center",
                        textAlign: b.textAlign ?? "center",
                        fontFamily: FONT_STACKS[b.fontFamily ?? "tiktok"],
                        fontSize,
                        lineHeight: b.fontFamily === "snapchat" ? 1.18 : 1.2,
                        fontWeight: b.fontFamily === "snapchat" ? 500 : 700,
                        WebkitFontSmoothing: "antialiased",
                        color: fill,
                        WebkitTextStroke: treatment === "plain" || isBox ? "0" : `1.5px ${stroke}`,
                      }}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest("button")) return;
                        e.preventDefault();
                        setSelectedOverlay(i);
                        setSelectedPreset(
                          OVERLAY_PRESETS.find((preset) => preset[1] === line)?.[0] ?? "Custom"
                        );
                        dragIndex.current = i;
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                      }}
                    >
                      <span
                        className="block max-h-full max-w-full overflow-hidden whitespace-pre-line break-words rounded px-1.5 py-0.5"
                        style={{ background }}
                      >
                        {line || "Overlay text..."}
                      </span>
                      {overlayLines.length > 1 && selected && (
                        <button
                          type="button"
                          aria-label={`Remove Text ${i + 1}`}
                          className="absolute -right-2 -top-2 rounded-full bg-slate-800 p-0.5 text-white shadow"
                          onClick={() => {
                            setOverlayLines((cur) => cur.filter((_, j) => j !== i));
                            setOverlayBoxes((cur) => cur.filter((_, j) => j !== i));
                            setSelectedOverlay(Math.max(0, i - 1));
                            setSelectedPreset("Custom");
                          }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                      {selected && (
                        <span
                          role="slider"
                          aria-label={`Resize Text ${i + 1}`}
                          aria-valuemin={20}
                          aria-valuemax={92}
                          aria-valuenow={Math.round(width * 100)}
                          className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-se-resize rounded-full border-2 border-white bg-[#0d99ff] shadow"
                          style={{ touchAction: "none" }}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            resizeIndex.current = i;
                            e.currentTarget.setPointerCapture?.(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            if (resizeIndex.current !== i) return;
                            const rect = canvasRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            const box = overlayBoxes[i] ?? defaultOverlayBox(0.12);
                            const pointerX = (e.clientX - rect.left) / rect.width;
                            const pointerY = (e.clientY - rect.top) / rect.height;
                            const nextWidth = Math.min(0.92, Math.max(0.2, Math.abs(pointerX - box.x) * 2));
                            const nextHeight = Math.min(0.5, Math.max(0.08, Math.abs(pointerY - box.y) * 2));
                            setOverlayBoxes((cur) => {
                              const next = [...cur];
                              next[i] = { ...next[i], width: nextWidth, height: nextHeight };
                              return next;
                            });
                          }}
                          onPointerUp={() => (resizeIndex.current = null)}
                          onPointerCancel={() => (resizeIndex.current = null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1 rounded-full border bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                  onClick={() => {
                    const index = overlayLines.length;
                    setOverlayLines((cur) => [...cur, ""]);
                    setOverlayBoxes((cur) => [...cur, defaultOverlayBox(Math.min(0.84, 0.12 + cur.length * 0.14))]);
                    setSelectedOverlay(index);
                    setSelectedPreset("Custom");
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add text
                </button>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Text input</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={selectedPreset === "Custom"}
                    className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
                      selectedPreset === "Custom" ? "border-blue-500 bg-blue-50 text-blue-600" : "bg-white text-slate-500 hover:text-blue-600"
                    }`}
                    onClick={() => setSelectedPreset("Custom")}
                  >
                    Custom
                  </button>
                  {OVERLAY_PRESETS.map(([label, text]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={selectedPreset === label}
                      title={`TikTok Text Overlays: ${label}`}
                      className={`h-8 rounded-full border px-3 text-xs font-semibold transition ${
                        selectedPreset === label ? "border-blue-500 bg-blue-50 text-blue-600" : "bg-white text-slate-500 hover:text-blue-600"
                      }`}
                      onClick={() => {
                        setSelectedPreset(label);
                        setOverlayLines((cur) => {
                          const next = [...cur];
                          next[selectedOverlay] = text;
                          return next;
                        });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={overlayLines[selectedOverlay] ?? ""}
                  onChange={(e) => {
                    setSelectedPreset("Custom");
                    setOverlayLines((cur) => {
                      const next = [...cur];
                      next[selectedOverlay] = e.target.value;
                      return next;
                    });
                  }}
                  placeholder="Overlay text..."
                  className="mt-1.5 min-h-24 w-full resize-y rounded-[10px] border bg-white px-3 py-3 text-sm leading-relaxed text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] font-medium text-slate-500">Emojis</span>
                  {OVERLAY_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`Add ${emoji}`}
                      className="grid h-8 w-8 place-items-center rounded-md border bg-white text-base hover:bg-blue-50"
                      onClick={() => {
                        setSelectedPreset("Custom");
                        setOverlayLines((cur) => {
                          const next = [...cur];
                          next[selectedOverlay] = `${next[selectedOverlay] ?? ""}${emoji}`;
                          return next;
                        });
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </label>

              <div className="space-y-3 rounded-xl border bg-slate-50/60 p-3">
                <span className="text-xs font-semibold text-slate-700">Style</span>
                <div className="grid grid-cols-2 overflow-hidden rounded-lg border bg-white">
                  <button
                    type="button"
                    aria-pressed={(activeOverlayBox.fontFamily ?? "tiktok") !== "snapchat"}
                    className={`h-9 text-xs font-medium ${
                      (activeOverlayBox.fontFamily ?? "tiktok") !== "snapchat" ? "bg-blue-50 text-blue-600" : "text-slate-500"
                    }`}
                    onClick={() => updateSelectedOverlayBox({
                      fontFamily: "tiktok",
                      treatment: activeOverlayBox.treatment === "plain" ? "outline" : activeOverlayBox.treatment,
                    })}
                  >
                    TikTok captions
                  </button>
                  <button
                    type="button"
                    aria-pressed={activeOverlayBox.fontFamily === "snapchat"}
                    className={`border-l h-9 text-xs font-medium ${
                      activeOverlayBox.fontFamily === "snapchat" ? "bg-blue-50 text-blue-600" : "text-slate-500"
                    }`}
                    onClick={() => updateSelectedOverlayBox({ fontFamily: "snapchat", treatment: "plain" })}
                  >
                    Snapchat caption
                  </button>
                </div>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium text-slate-500">Font</span>
                  <select
                    aria-label="Caption font"
                    value={activeOverlayBox.fontFamily ?? "tiktok"}
                    onChange={(e) => {
                      const fontFamily = e.target.value as OverlayFont;
                      updateSelectedOverlayBox({
                        fontFamily,
                        treatment: fontFamily === "snapchat"
                          ? "plain"
                          : activeOverlayBox.treatment === "plain" ? "outline" : activeOverlayBox.treatment,
                      });
                    }}
                    className="h-9 w-full rounded-lg border bg-white px-3 text-xs"
                  >
                    {["Batchbot", "Sales-focused"].map((group) => (
                      <optgroup key={group} label={group}>
                        {OVERLAY_FONTS.filter((font) => font.group === group).map((font) => (
                          <option key={font.value} value={font.value}>{font.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-3 overflow-hidden rounded-lg border bg-white">
                  {([
                    ["left", AlignLeft, "Align left"],
                    ["center", AlignCenter, "Align center"],
                    ["right", AlignRight, "Align right"],
                  ] as const).map(([alignment, Icon, label]) => (
                    <button
                      key={alignment}
                      type="button"
                      aria-label={label}
                      aria-pressed={(activeOverlayBox.textAlign ?? "center") === alignment}
                      className={`flex h-9 items-center justify-center border-l first:border-l-0 ${
                        (activeOverlayBox.textAlign ?? "center") === alignment ? "bg-blue-50 text-blue-600" : "text-slate-500"
                      }`}
                      onClick={() => updateSelectedOverlayBox({ textAlign: alignment })}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3rem] items-center gap-2 rounded-lg border bg-white p-3">
                  <Type className="h-4 w-4 text-slate-500" />
                  <input
                    aria-label="Font size"
                    type="range"
                    min={18}
                    max={120}
                    value={activeOverlayBox.fontSize ?? overlayStyle}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setOverlayStyle(value);
                      updateSelectedOverlayBox({ fontSize: value });
                    }}
                    className="w-full accent-blue-600"
                  />
                  <span className="text-right font-mono text-xs text-slate-500">
                    {activeOverlayBox.fontSize ?? overlayStyle}
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-lg border bg-white p-2">
                  {(activeOverlayBox.fontFamily ?? "tiktok") !== "snapchat" && (
                    <button
                      type="button"
                      title={`Text style: ${activeOverlayBox.treatment ?? "outline"}`}
                      aria-label={`Cycle text style (current: ${activeOverlayBox.treatment ?? "outline"})`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-700 text-xs font-bold text-white ring-1 ring-black/10 active:scale-95"
                      onClick={() => {
                        const current = activeOverlayBox.treatment === "plain" ? "outline" : (activeOverlayBox.treatment ?? "outline");
                        const index = TREATMENT_ORDER.indexOf(current);
                        updateSelectedOverlayBox({ treatment: TREATMENT_ORDER[(index + 1) % TREATMENT_ORDER.length] });
                      }}
                    >
                      Aa
                    </button>
                  )}
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-1">
                    {OVERLAY_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Text color ${color}`}
                        aria-pressed={(activeOverlayBox.fontColor ?? "#ffffff").toLowerCase() === color}
                        className={`h-7 w-7 shrink-0 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(16,24,40,0.15)] active:scale-95 ${
                          (activeOverlayBox.fontColor ?? "#ffffff").toLowerCase() === color ? "scale-110 ring-2 ring-blue-500" : ""
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => updateSelectedOverlayBox({ fontColor: color })}
                      />
                    ))}
                    <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(16,24,40,0.15)]" title="Custom text color">
                      <input
                        aria-label="Custom text color"
                        type="color"
                        value={activeOverlayBox.fontColor ?? "#ffffff"}
                        onChange={(e) => updateSelectedOverlayBox({ fontColor: e.target.value })}
                        className="absolute -inset-2 h-12 w-12 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border bg-white p-2">
                  <span className="text-[11px] font-medium text-slate-500">Background</span>
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-600">
                    <input
                      aria-label="Custom background color"
                      type="color"
                      value={activeOverlayBox.bgColor ?? "#000000"}
                      onChange={(e) => updateSelectedOverlayBox({ bgColor: e.target.value, treatment: "box" })}
                      className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <span>{activeOverlayBox.bgColor ?? "#000000"}</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-slate-500">
                    Opacity
                    <input
                      aria-label="Background opacity"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((activeOverlayBox.bgOpacity ?? 1) * 100)}
                      onChange={(e) => updateSelectedOverlayBox({ bgOpacity: Number(e.target.value) / 100, treatment: "box" })}
                      className="w-20 accent-blue-600"
                    />
                  </label>
                </div>
              </div>
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
            <div className="flex gap-2">
              <select
                className="flex h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
              >
                <option value="">No voiceover</option>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              {voiceId && (
                <Button type="button" variant="outline" size="icon" onClick={previewVoice} disabled={previewingVoice === voiceId} title="Preview voice">
                  {previewingVoice === voiceId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Engine</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
            >
              {ENGINES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
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
          {resolution}
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
                  {resolution} · {engine})
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
