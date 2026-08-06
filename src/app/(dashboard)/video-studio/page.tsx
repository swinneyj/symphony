"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Link2,
  Wand2,
  Trash2,
  Play,
  Clapperboard,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MOTION_PRESETS } from "@/lib/video/presets";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  originalImageUrl: string | null;
  processedImageUrl: string | null;
  sourceType: "manual" | "link" | "tiktok_showcase";
  status: "raw" | "processing" | "ready" | "failed";
}

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
}

interface Voice {
  id: string;
  name: string;
  provider: string;
  isCloned: boolean;
  sampleUrl: string | null;
}

const STATUS_STYLE: Record<Product["status"], string> = {
  raw: "bg-zinc-100 text-zinc-600",
  processing: "bg-amber-100 text-amber-700",
  ready: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function VideoStudioPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspace = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    if (!res.ok) return;
    const workspaces = await res.json();
    if (workspaces.length > 0) setWorkspaceId(workspaces[0].id);
  }, []);

  const loadProducts = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/products?workspaceId=${wsId}`);
    if (res.ok) setProducts(await res.json());
  }, []);

  const loadFormulas = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/formulas?workspaceId=${wsId}`);
    if (res.ok) setFormulas(await res.json());
  }, []);

  const loadVoices = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/voices?workspaceId=${wsId}`);
    if (res.ok) setVoices(await res.json());
  }, []);

  useEffect(() => {
    (async () => {
      await loadWorkspace();
      setLoading(false);
    })();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!workspaceId) return;
    loadProducts(workspaceId);
    loadFormulas(workspaceId);
    loadVoices(workspaceId);
  }, [workspaceId, loadProducts, loadFormulas, loadVoices]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Video Studio</h1>
        <p className="text-sm text-muted-foreground">
          Products in → AI videos out. Import, process, and batch-generate TikTok
          Shop content.
        </p>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products" className="gap-1.5">
            <Package className="h-4 w-4" /> Products
          </TabsTrigger>
          <TabsTrigger value="formulas" className="gap-1.5">
            <Wand2 className="h-4 w-4" /> Formulas
          </TabsTrigger>
          <TabsTrigger value="voices" className="gap-1.5">
            <Clapperboard className="h-4 w-4" /> Voices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          <ProductsTab
            workspaceId={workspaceId!}
            products={products}
            onChanged={() => loadProducts(workspaceId!)}
          />
        </TabsContent>

        <TabsContent value="formulas" className="mt-4">
          <FormulasTab
            workspaceId={workspaceId!}
            formulas={formulas}
            products={products}
            onChanged={() => loadFormulas(workspaceId!)}
          />
        </TabsContent>

        <TabsContent value="voices" className="mt-4">
          <VoicesTab
            workspaceId={workspaceId!}
            voices={voices}
            onChanged={() => loadVoices(workspaceId!)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Products tab ───────────────────────────────────────────────────────────

function ProductsTab({
  workspaceId,
  products,
  onChanged,
}: {
  workspaceId: string;
  products: Product[];
  onChanged: () => void;
}) {
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", price: "", description: "", imageUrl: "" });
  const [creating, setCreating] = useState(false);

  const handleImport = async () => {
    if (!importUrl.trim()) {
      toast.error("Paste a product link first");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      toast.success("Product imported");
      setImportUrl("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const handleCreate = async () => {
    if (!manual.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: manual.name.trim(),
          price: manual.price.trim() || null,
          description: manual.description.trim() || null,
          originalImageUrl: manual.imageUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      toast.success("Product added");
      setManualOpen(false);
      setManual({ name: "", price: "", description: "", imageUrl: "" });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const handleProcess = async (product: Product) => {
    try {
      const res = await fetch(`/api/products/${product.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Queue failed");
      toast.success("Processing queued");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Queue failed");
    }
  };

  const handleDelete = async (product: Product) => {
    if (!confirm(`Delete "${product.name}"?`)) return;
    const res = await fetch(`/api/products/${product.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    if (res.ok) {
      toast.success("Deleted");
      onChanged();
    } else {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 min-w-[260px] items-center gap-2">
          <Input
            placeholder="Paste an Amazon / TikTok Shop / product link…"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleImport()}
          />
          <Button onClick={handleImport} disabled={importing}>
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Import
          </Button>
        </div>
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="h-4 w-4" /> Add manually
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add product manually</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input
                  value={manual.name}
                  onChange={(e) => setManual({ ...manual, name: e.target.value })}
                  placeholder="e.g. Ergonomic desk lamp"
                />
              </div>
              <div>
                <Label>Price</Label>
                <Input
                  value={manual.price}
                  onChange={(e) => setManual({ ...manual, price: e.target.value })}
                  placeholder="$49.99"
                />
              </div>
              <div>
                <Label>Image URL</Label>
                <Input
                  value={manual.imageUrl}
                  onChange={(e) => setManual({ ...manual, imageUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={manual.description}
                  onChange={(e) => setManual({ ...manual, description: e.target.value })}
                  placeholder="What is it? Materials, sizing, selling points…"
                  rows={4}
                />
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Add product
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">No products yet</p>
            <p className="text-sm text-muted-foreground">
              Import a link or add a product manually to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <Card key={product.id} className="overflow-hidden">
              <div className="aspect-square bg-zinc-100">
                {product.originalImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.originalImageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-medium">{product.name}</p>
                  <Badge className={cn("shrink-0", STATUS_STYLE[product.status])}>
                    {product.status}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  {product.price && <span className="font-medium">{product.price}</span>}
                  <span className="capitalize">{product.sourceType}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={product.status === "processing"}
                    onClick={() => handleProcess(product)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    Process
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => handleDelete(product)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Formulas tab ───────────────────────────────────────────────────────────

function FormulasTab({
  workspaceId,
  formulas,
  products,
  onChanged,
}: {
  workspaceId: string;
  formulas: Formula[];
  products: Product[];
  onChanged: () => void;
}) {
  const [previewFormula, setPreviewFormula] = useState<Formula | null>(null);
  const [previewProductId, setPreviewProductId] = useState<string>("");
  const [preview, setPreview] = useState<{ script: string; features: string[]; llm: boolean } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    category: "generic",
    scriptTemplate:
      "I just saw the same {product} at the store, but I found mine on TikTok Shop. Let me show you. {features} Tap the orange cart to check it out.",
    scenePromptTemplate: "",
    motionPreset: "none",
    durationSec: "6",
    quality: "standard",
  });
  const [creating, setCreating] = useState(false);

  const handleRender = async () => {
    if (!previewFormula || !previewProductId) return;
    setRendering(true);
    try {
      const res = await fetch("/api/formulas/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          formulaId: previewFormula.id,
          productId: previewProductId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Render failed");
      setPreview(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Render failed");
    } finally {
      setRendering(false);
    }
  };

  const handleCreate = async () => {
    if (!draft.name.trim() || !draft.scriptTemplate.trim()) {
      toast.error("Name and script template are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/formulas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: draft.name.trim(),
          category: draft.category,
          scriptTemplate: draft.scriptTemplate.trim(),
          scenePromptTemplate: draft.scenePromptTemplate.trim() || null,
          motionPreset: draft.motionPreset,
          durationSec: Number(draft.durationSec),
          quality: draft.quality,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      toast.success("Formula created");
      setCreateOpen(false);
      setDraft({ ...draft, name: "", scenePromptTemplate: "" });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (formula: Formula) => {
    if (formula.isSystem) return;
    if (!confirm(`Delete formula "${formula.name}"?`)) return;
    const res = await fetch(`/api/formulas/${formula.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Deleted");
      onChanged();
    } else {
      toast.error("Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {formulas.length} formulas · system templates plus your own
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> New formula
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create formula</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Unboxing Reveal"
                />
              </div>
              <div>
                <Label>Category</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {["generic", "furniture", "home", "beauty", "tech", "fashion"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Script template *</Label>
                <Textarea
                  rows={5}
                  value={draft.scriptTemplate}
                  onChange={(e) => setDraft({ ...draft, scriptTemplate: e.target.value })}
                  placeholder="Use {product} {price} {category} {features} {store} placeholders"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Placeholders: {"{product}"} {"{price}"} {"{category}"} {"{features}"} {"{store}"}
                </p>
              </div>
              <div>
                <Label>Scene prompt</Label>
                <Textarea
                  rows={2}
                  value={draft.scenePromptTemplate}
                  onChange={(e) => setDraft({ ...draft, scenePromptTemplate: e.target.value })}
                  placeholder="Optional video scene description"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Motion preset</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={draft.motionPreset}
                    onChange={(e) => setDraft({ ...draft, motionPreset: e.target.value })}
                  >
                    {MOTION_PRESETS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Duration (s)</Label>
                  <Input
                    type="number"
                    min={3}
                    max={60}
                    value={draft.durationSec}
                    onChange={(e) => setDraft({ ...draft, durationSec: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create formula
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {formulas.map((formula) => (
          <Card key={formula.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{formula.name}</CardTitle>
                  <CardDescription className="capitalize">
                    {formula.category} · {formula.durationSec}s · {formula.quality}
                  </CardDescription>
                </div>
                {formula.isSystem ? (
                  <Badge variant="secondary">system</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => handleDelete(formula)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="line-clamp-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                {formula.scriptTemplate}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setPreviewFormula(formula);
                  setPreviewProductId(products[0]?.id ?? "");
                  setPreview(null);
                }}
              >
                <Wand2 className="h-3.5 w-3.5" /> Preview with a product
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={previewFormula !== null}
        onOpenChange={(open) => !open && setPreviewFormula(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Script preview — {previewFormula?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a product first to preview scripts.
              </p>
            ) : (
              <>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={previewProductId}
                  onChange={(e) => {
                    setPreviewProductId(e.target.value);
                    setPreview(null);
                  }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button onClick={handleRender} disabled={rendering} className="w-full">
                  {rendering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4" />
                  )}
                  Render script
                </Button>
                {preview && (
                  <div className="space-y-2">
                    <p className="rounded-md border bg-muted p-3 text-sm leading-relaxed">
                      {preview.script}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {preview.llm
                        ? "Selling points generated by LLM"
                        : "Selling points extracted from description (no LLM key set)"}
                      {preview.features.length > 0 && (
                        <>
                          {" "}· <span className="font-medium">{preview.features.length}</span>{" "}
                          feature{preview.features.length === 1 ? "" : "s"}
                        </>
                      )}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Voices tab ─────────────────────────────────────────────────────────────

function VoicesTab({
  workspaceId,
  voices,
  onChanged,
}: {
  workspaceId: string;
  voices: Voice[];
  onChanged: () => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    provider: "elevenlabs",
    providerVoiceId: "",
    isCloned: false,
    sampleUrl: "",
  });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: draft.name.trim(),
          provider: draft.provider,
          providerVoiceId: draft.providerVoiceId.trim() || null,
          isCloned: draft.isCloned,
          sampleUrl: draft.sampleUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      toast.success("Voice added");
      setCreateOpen(false);
      setDraft({ name: "", provider: "elevenlabs", providerVoiceId: "", isCloned: false, sampleUrl: "" });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{voices.length} voices</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Add voice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add voice</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Reese (clone)"
                />
              </div>
              <div>
                <Label>Provider</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={draft.provider}
                  onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                >
                  <option value="openai_tts">OpenAI TTS</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="kokoro">Kokoro</option>
                </select>
              </div>
              <div>
                <Label>Provider voice ID</Label>
                <Input
                  value={draft.providerVoiceId}
                  onChange={(e) => setDraft({ ...draft, providerVoiceId: e.target.value })}
                  placeholder="Voice ID from provider"
                />
              </div>
              <div>
                <Label>Sample URL</Label>
                <Input
                  value={draft.sampleUrl}
                  onChange={(e) => setDraft({ ...draft, sampleUrl: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.isCloned}
                  onChange={(e) => setDraft({ ...draft, isCloned: e.target.checked })}
                />
                This is a cloned voice
              </label>
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Add voice
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {voices.map((voice) => (
          <Card key={voice.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">{voice.name}</p>
                <p className="text-xs text-muted-foreground">
                  {voice.provider}
                  {voice.isCloned && " · clone"}
                </p>
              </div>
              {voice.sampleUrl && (
                <a href={voice.sampleUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
