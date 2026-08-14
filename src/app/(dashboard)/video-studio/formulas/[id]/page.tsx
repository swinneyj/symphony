"use client";

// Formula run view — BatchBot-style flow page for one formula.
// Mirrors batchbot.io/app/formulas/<id>?view=run:
//   Product input → Video settings (mode/resolution) → Text overlay → Output (Run).
// Runs a batch through POST /api/batches (same path as the New batch form).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Play, Loader2, Package, Film, Type, CheckCircle2 } from "lucide-react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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

export default function FormulaRunPage() {
  const params = useParams<{ id: string }>();
  const formulaId = params.id;

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [formula, setFormula] = useState<Formula | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);

  // Run settings (BatchBot view=run controls).
  const [productId, setProductId] = useState("");
  const [mode, setMode] = useState<"fast" | "quality">("fast"); // Fast | Quality
  const [resolution, setResolution] = useState<"480p" | "720p">("480p");
  const [overlayText, setOverlayText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [engine, setEngine] = useState("seedance");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

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

  const loadFormula = useCallback(async (wsId: string) => {
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
    setOverlayText(f.overlayTemplate ?? "");
    if (f.boomerang) setMode("quality");
  }, [formulaId]);

  const loadProducts = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/products?workspaceId=${wsId}`);
    if (res.ok) {
      const rows: Product[] = await res.json();
      setProducts(rows);
      if (rows.length > 0) setProductId(rows[0].id);
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
      await Promise.all([loadFormula(active.id), loadProducts(active.id), loadVoices(active.id)]);
      setLoading(false);
    })();
  }, [loadFormula, loadProducts, loadVoices]);

  const run = async () => {
    if (!workspaceId || !formula) return;
    if (!productId) {
      toast.error("Select a product first");
      return;
    }
    setRunning(true);
    setDone(false);
    try {
      // Mode/resolution → quality (BatchBot Fast=480p, Quality=720p).
      const quality = mode === "quality" || resolution === "720p" ? "pro" : "standard";
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: `${formula.name} — ${products.find((p) => p.id === productId)?.name ?? "product"}`,
          formulaId: formula.id,
          voiceId: voiceId || null,
          quality,
          provider: engine,
          productIds: [productId],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to run");
      setDone(true);
      toast.success(`Queued — video rendering now`);
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
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {products.length === 0 && <option value="">No products yet</option>}
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {products.length === 0 && (
          <Link href="/video-studio" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
            Add a product first
          </Link>
        )}
      </section>

      {/* Video settings */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Video settings</p>
        <p className="mb-3 text-xs text-muted-foreground">Select the video settings you want.</p>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
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

      {/* Text overlay */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Text overlay</p>
        <p className="mb-2 text-xs text-muted-foreground">
          The text shown on top of the video. Leave it blank to add no overlay text. Variables: {"{product}"} {"{price}"}
        </p>
        <textarea
          className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          value={overlayText}
          onChange={(e) => setOverlayText(e.target.value)}
          placeholder="e.g. if u were gonna buy the {product}... tap the orange cart before they change the price 😭"
        />
      </section>

      {/* Output */}
      <section className="rounded-lg border p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Output</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Run the workflow to generate your finished video. {formula.durationSec ?? 6}s clip
          {formula.boomerang ? " · ↺ boomerang (doubles length)" : ""} · {mode === "quality" || resolution === "720p" ? "720p" : "480p"}
        </p>
        <Button onClick={run} disabled={running || !productId} className="w-full">
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
      </section>
    </main>
  );
}
