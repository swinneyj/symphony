"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import { toast } from "sonner";
import Link from "next/link";
import {
  Package,
  Plus,
  Link2,
  ShoppingBag,
  Wand2,
  Trash2,
  Play,
  Clapperboard,
  Loader2,
  ExternalLink,
  TrendingUp,
  Users,
  Star,
  Workflow,
  Send,
  Copy,
  Check,
  Share2,
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
  boomerang: boolean;
  overlayTemplate: string | null;
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
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorkspace = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    if (!res.ok) return;
    const workspaces = await res.json();
    const active = resolveActiveWorkspace(workspaces);
    if (active) setWorkspaceId(active.id);
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

  const loadBatches = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/batches?workspaceId=${wsId}`);
    if (res.ok) setBatches(await res.json());
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
    loadBatches(workspaceId);
  }, [workspaceId, loadProducts, loadFormulas, loadVoices, loadBatches]);

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
        <TabsList className="w-full justify-start overflow-x-auto md:w-auto md:justify-center">
          <TabsTrigger value="products" className="gap-1.5 shrink-0">
            <Package className="h-4 w-4" /> Products
          </TabsTrigger>
          <TabsTrigger value="formulas" className="gap-1.5 shrink-0">
            <Wand2 className="h-4 w-4" /> Formulas
          </TabsTrigger>
          <TabsTrigger value="voices" className="gap-1.5 shrink-0">
            <Clapperboard className="h-4 w-4" /> Voices
          </TabsTrigger>
          <TabsTrigger value="batches" className="gap-1.5 shrink-0">
            <Play className="h-4 w-4" /> Batch Studio
          </TabsTrigger>
          <TabsTrigger value="market" className="gap-1.5 shrink-0">
            <TrendingUp className="h-4 w-4" /> Market Research
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5 shrink-0">
            <Send className="h-4 w-4" /> Post Queue
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

        <TabsContent value="batches" className="mt-4">
          <BatchStudioTab
            workspaceId={workspaceId!}
            products={products}
            formulas={formulas}
            voices={voices}
            batches={batches}
            onBatchesChanged={() => loadBatches(workspaceId!)}
            onProductsChanged={() => loadProducts(workspaceId!)}
          />
        </TabsContent>

        <TabsContent value="market" className="mt-4">
          <MarketTab
            workspaceId={workspaceId!}
            onAdopted={() => loadProducts(workspaceId!)}
          />
        </TabsContent>

        <TabsContent value="queue" className="mt-4">
          <PostQueueTab workspaceId={workspaceId!} />
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
  const [syncingShop, setSyncingShop] = useState(false);

  const handleShopSync = async () => {
    setSyncingShop(true);
    try {
      const res = await fetch("/api/products/sync/shop-showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Shop sync failed");
      if (data.accounts && data.accounts.length > 1) {
        const lines = (data.accounts as ShopSyncAccount[])
          .map(
            (a) =>
              `${a.name}: +${a.added}/~${a.updated}/-${a.removed} (${a.total} products)`
          )
          .join(" · ");
        toast.success(`Shop synced — ${lines}`);
      } else {
        toast.success(
          data.removed > 0
            ? `Shop synced — ${data.added} added, ${data.updated} updated, ${data.removed} removed, ${data.total} total`
            : `Shop synced — ${data.added} added, ${data.updated} updated, ${data.total} total`
        );
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Shop sync failed");
    } finally {
      setSyncingShop(false);
    }
  };

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
        <Button
          variant="secondary"
          onClick={handleShopSync}
          disabled={syncingShop}
          title="Pull your full TikTok Shop product catalog"
        >
          {syncingShop ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShoppingBag className="h-4 w-4" />
          )}
          Sync from TikTok Shop
        </Button>
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
    boomerang: false,
    overlayTemplate: "",
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
          boomerang: draft.boomerang,
          overlayTemplate: draft.overlayTemplate.trim() || null,
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
        <div className="flex items-center gap-2">
          <Link href="/video-studio/builder">
            <Button size="sm" variant="outline">
              <Workflow className="h-4 w-4" /> Formula Studio
            </Button>
          </Link>
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
              <div>
                <Label>Text overlay (CTA)</Label>
                <Input
                  value={draft.overlayTemplate}
                  onChange={(e) => setDraft({ ...draft, overlayTemplate: e.target.value })}
                  placeholder='e.g. "So sorry to those that already got the {product}..."'
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Burned onto the video. Variables: {"{product}"} {"{price}"}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.boomerang}
                  onChange={(e) => setDraft({ ...draft, boomerang: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                Boomerang — play forward then reversed (doubles length, $0)
              </label>
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
                    {formula.boomerang && " · ↺ boomerang"}
                    {formula.overlayTemplate && " · TXT overlay"}
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
                <Button
                  size="sm"
                  variant="ghost"
                  title="Copy share link"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}/f/${formula.id}`);
                      toast.success("Share link copied");
                    } catch {
                      toast.error("Copy failed");
                    }
                  }}
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
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

// ─── Batch Studio tab ────────────────────────────────────────────────────────

type BatchJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

interface ShopSyncAccount {
  name: string;
  added: number;
  updated: number;
  removed: number;
  total: number;
}

interface BatchSummary {
  id: string;
  name: string;
  status: "queued" | "running" | "done" | "partial" | "failed";
  quality: string;
  provider: string | null;
  createdAt: string;
  jobsTotal: number;
  jobsDone: number;
  jobsFailed: number;
}

interface BatchDetailJob {
  id: string;
  jobType: string;
  status: BatchJobStatus;
  script: string | null;
  footageUrl: string | null;
  finalUrl: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  productName: string;
  productImage: string | null;
  productOriginalImage: string | null;
}

const ENGINES = ["sora", "seedance", "veo", "kling"];
const BATCH_STATUS_STYLE: Record<string, string> = {
  queued: "bg-yellow-100 text-yellow-700",
  running: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  partial: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
};

function BatchStudioTab({
  workspaceId,
  products,
  formulas,
  voices,
  batches,
  onBatchesChanged,
}: {
  workspaceId: string;
  products: Product[];
  formulas: Formula[];
  voices: Voice[];
  batches: BatchSummary[];
  onBatchesChanged: () => void;
  onProductsChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [formulaId, setFormulaId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [quality, setQuality] = useState("standard");
  const [engine, setEngine] = useState("sora");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<BatchDetailJob[] | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [postingJobId, setPostingJobId] = useState<string | null>(null);
  const [tiktokAccounts, setTiktokAccounts] = useState<
    Array<{ id: string; accountName: string; accountUsername?: string | null }>
  >([]);
  const [tiktokAccountId, setTiktokAccountId] = useState("");

  // Load connected TikTok accounts so batches can pick which one to publish to.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/accounts?workspaceId=${workspaceId}`);
      if (!res.ok) return;
      const all = (await res.json()) as Array<{
        id: string;
        platform: string;
        accountName: string;
        accountUsername?: string | null;
      }>;
      if (cancelled) return;
      const tts = all.filter((a) => a.platform === "tiktok");
      setTiktokAccounts(tts);
      setTiktokAccountId((prev) => prev || tts[0]?.id || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const toggleProduct = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const postToTikTok = async (batchId: string, job: BatchDetailJob) => {
    setPostingJobId(job.id);
    try {
      const res = await fetch(`/api/batches/${batchId}/jobs/${job.id}/post`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ privacyLevel: "SELF_ONLY" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post");
      toast.success(
        data.dryRun
          ? `Dry-run posted (publish_id ${data.publishId})`
          : `Posted to TikTok — ${data.status}`
      );
      onBatchesChanged();
      await loadDetail(batchId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post");
    } finally {
      setPostingJobId(null);
    }
  };

  const createBatch = async () => {
    if (!name.trim() || !formulaId || selected.length === 0) {
      toast.error("Name, formula and at least one product are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name,
          formulaId,
          voiceId: voiceId || null,
          quality,
          provider: engine,
          productIds: selected,
          tiktokAccountId: tiktokAccountId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create batch");
      toast.success(`Batch "${name}" created — ${selected.length} video(s) queued`);
      setName("");
      setSelected([]);
      onBatchesChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create batch");
    } finally {
      setCreating(false);
    }
  };

  const loadDetail = async (batchId: string) => {
    setDetailsError(null);
    try {
      const res = await fetch(`/api/batches/${batchId}`);
      if (!res.ok) throw new Error("Failed to load batch detail");
      const data = await res.json();
      setDetail(data.jobs);
      // Poll while anything is still queued/running.
      const active = data.jobs.some((j: BatchDetailJob) => j.status === "queued" || j.status === "running");
      if (active) {
        setTimeout(() => {
          onBatchesChanged();
          loadDetail(batchId);
        }, 4000);
      }
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Failed to load batch detail");
    }
  };

  const toggleDetail = async (batchId: string) => {
    if (expanded === batchId) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(batchId);
    setDetail(null);
    await loadDetail(batchId);
  };

  return (
    <div className="space-y-6">
      {/* Create batch */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New batch</CardTitle>
          <CardDescription>
            Pick a formula, select products, and queue AI videos for all of them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="batch-name">Batch name</Label>
              <Input
                id="batch-name"
                placeholder="Summer drop batch"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-formula">Formula</Label>
              <select
                id="batch-formula"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={formulaId}
                onChange={(e) => setFormulaId(e.target.value)}
              >
                <option value="">Select…</option>
                {formulas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.isSystem ? " (system)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-quality">Quality</Label>
              <select
                id="batch-quality"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="fast">Fast · 480p · 4s</option>
                <option value="standard">Standard · 720p · 6-8s</option>
                <option value="pro">Pro · 1080p · 8-12s</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-engine">Engine</Label>
              <select
                id="batch-engine"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
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
            <div className="space-y-1.5">
              <Label htmlFor="batch-tiktok-account">TikTok account</Label>
              <select
                id="batch-tiktok-account"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={tiktokAccountId}
                onChange={(e) => setTiktokAccountId(e.target.value)}
              >
                <option value="">Default (first connected)</option>
                {tiktokAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName}
                    {a.accountUsername ? ` (@${a.accountUsername})` : ""}
                  </option>
                ))}
              </select>
              {tiktokAccounts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No TikTok account connected — add one in Settings → Accounts.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Products ({selected.length} selected)</Label>
            <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
              {products.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground">
                  No products yet — add or import one in the Products tab first.
                </p>
              )}
              {products.map((p) => (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
                    selected.includes(p.id)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => toggleProduct(p.id)}
                    className="h-4 w-4"
                  />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={createBatch} disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Queue batch
          </Button>
        </CardContent>
      </Card>

      {/* Batch list */}
      <div className="space-y-3">
        {batches.length === 0 && (
          <p className="text-sm text-muted-foreground">No batches yet.</p>
        )}
        {batches.map((batch) => (
          <Card key={batch.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{batch.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {batch.quality} · {batch.provider} ·{" "}
                    {batch.jobsDone}/{batch.jobsTotal} done
                    {batch.jobsFailed > 0 && ` · ${batch.jobsFailed} failed`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={BATCH_STATUS_STYLE[batch.status]}>{batch.status}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => toggleDetail(batch.id)}>
                    {expanded === batch.id ? "Hide" : "Details"}
                  </Button>
                </div>
              </div>

              {expanded === batch.id && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {detailsError && (
                    <p className="text-sm text-red-600">{detailsError}</p>
                  )}
                  {detail === null && !detailsError && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </p>
                  )}
                  {detail?.map((job) => (
                    <div key={job.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <img
                        src={job.productImage ?? job.productOriginalImage ?? ""}
                        alt=""
                        className="h-10 w-10 rounded-md border object-cover"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                      />
                      <span className="min-w-0 flex-1 truncate">{job.productName}</span>
                      <Badge className={BATCH_STATUS_STYLE[job.status]}>{job.status}</Badge>
                      {(job.footageUrl || job.finalUrl) && (
                        <a
                          href={job.finalUrl ?? job.footageUrl!}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          Watch video
                        </a>
                      )}
                      {job.finalUrl &&
                        job.status === "done" &&
                        !Boolean(job.metadata?.tiktokPublishId) && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={postingJobId === job.id}
                            onClick={() => postToTikTok(batch.id, job)}
                          >
                            {postingJobId === job.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                            Post to TikTok
                          </Button>
                        )}
                      {Boolean(job.metadata?.tiktokPublishId) && job.metadata && (
                        <Badge className="bg-violet-100 text-violet-700">
                          posted{job.metadata.tiktokStatus
                            ? ` · ${String(job.metadata.tiktokStatus)}`
                            : ""}
                          {job.metadata.dryRun ? " (dry-run)" : ""}
                        </Badge>
                      )}
                      {job.error && (
                        <span className="truncate text-xs text-red-600" title={job.error}>
                          {job.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Market Research tab ────────────────────────────────────────────────────

interface MarketRow {
  id?: string;
  source: string;
  sourceProductId: string;
  name: string;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  categoryL1: string | null;
  rank: number | null;
  rankPeriod: string;
  sales7d: number | null;
  sales30d: number | null;
  gmv30d: number | null;
  growthRate: number | null;
  commissionRate: number | null;
  videoCount: number | null;
  creatorCount: number | null;
  isHot: boolean;
  momentumScore: number | null;
  productId: string | null;
}

interface MarketCreatorRow {
  id?: string;
  source: string;
  name: string;
  avatarUrl: string | null;
  followers: number | null;
  engagementRate: number | null;
  region: string | null;
  rating: number | null;
  videoCount: number | null;
  salesForProduct: number | null;
}

interface WatchedRow {
  id: string;
  source: string;
  sourceProductId: string;
  name: string;
  imageUrl: string | null;
  currentRank: number | null;
  spotChange: number | null;
  momentumScore: number | null;
  sales7d: number | null;
  lastSnapshot: string | null;
}

function MarketTab({
  workspaceId,
  onAdopted,
}: {
  workspaceId: string;
  onAdopted: () => void;
}) {
  const [source, setSource] = useState("echotik");
  const [period, setPeriod] = useState("week");
  const [sort, setSort] = useState("rank");
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adopting, setAdopting] = useState<string | null>(null);
  const [creatorsFor, setCreatorsFor] = useState<string | null>(null);
  const [creators, setCreators] = useState<Record<string, MarketCreatorRow[]>>({});
  const [creatorsLoading, setCreatorsLoading] = useState<string | null>(null);
  const [creatorsNotice, setCreatorsNotice] = useState<string | null>(null);
  const [view, setView] = useState<"discover" | "watched">("discover");
  const [watched, setWatched] = useState<WatchedRow[]>([]);
  const [watchedKeys, setWatchedKeys] = useState<Set<string>>(new Set());
  const [watching, setWatching] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/market/products?workspaceId=${workspaceId}&source=${source}&period=${period}&sort=${sort}&refresh=1&limit=50`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load market data");
      setRows(data.rows ?? []);
      if (data.notice) setNotice(data.notice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load market data");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, source, period, sort]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadWatched = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/watchlist?workspaceId=${workspaceId}`);
      if (!res.ok) return;
      const data = await res.json();
      setWatched(data.rows ?? []);
      setWatchedKeys(new Set((data.rows ?? []).map((w: WatchedRow) => `${w.source}:${w.sourceProductId}`)));
    } catch {
      /* non-fatal */
    }
  }, [workspaceId]);

  useEffect(() => {
    loadWatched();
  }, [loadWatched]);

  const toggleWatch = async (row: MarketRow) => {
    if (!row.id) return;
    const key = `${row.source}:${row.sourceProductId}`;
    const isWatched = watchedKeys.has(key);
    setWatching(key);
    try {
      if (isWatched) {
        const res = await fetch(
          `/api/market/watchlist?workspaceId=${workspaceId}&source=${row.source}&sourceProductId=${row.sourceProductId}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error("Failed to unwatch");
      } else {
        const res = await fetch(`/api/market/watchlist`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, source: row.source, sourceProductId: row.sourceProductId, name: row.name, imageUrl: row.imageUrl }),
        });
        if (!res.ok) throw new Error("Failed to watch");
      }
      toast.success(isWatched ? "Removed from watchlist" : `Watching "${row.name}"`);
      await loadWatched();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Watchlist error");
    } finally {
      setWatching(null);
    }
  };

  const adopt = async (row: MarketRow) => {
    if (!row.id) return;
    setAdopting(row.id);
    try {
      const res = await fetch(`/api/market/products/${row.id}/adopt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to adopt");
      toast.success(`"${data.product.name}" added to Products`);
      onAdopted();
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to adopt");
    } finally {
      setAdopting(null);
    }
  };

  const toggleCreators = async (row: MarketRow) => {
    if (!row.id) return;
    if (creatorsFor === row.id) {
      setCreatorsFor(null);
      return;
    }
    setCreatorsFor(row.id);
    setCreatorsLoading(row.id);
    setCreatorsNotice(null);
    try {
      const res = await fetch(
        `/api/market/products/${row.id}/creators?refresh=1&workspaceId=${workspaceId}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load creators");
      setCreators((prev) => ({ ...prev, [row.id!]: data.rows ?? [] }));
      if (data.notice) setCreatorsNotice(data.notice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load creators");
      setCreatorsFor(null);
    } finally {
      setCreatorsLoading(null);
    }
  };

  const fmt = (n: number | null, suffix = "") =>
    n === null ? "—" : `${Math.round(n).toLocaleString()}${suffix}`;
  const money = (n: number | null) =>
    n === null ? "—" : `$${Math.round(n).toLocaleString()}`;
  const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(1)}%`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="echotik">EchoTik</option>
          <option value="fastmoss">FastMoss</option>
        </select>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="rank">Sort: Rank</option>
          <option value="momentum">Sort: Momentum</option>
          <option value="gmv">Sort: GMV 30d</option>
        </select>
        <Button size="sm" variant={view === "watched" ? "default" : "outline"} onClick={() => setView(view === "watched" ? "discover" : "watched")}>
          <Star className="h-4 w-4" /> Watched ({watched.length})
        </Button>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
          {loading ? "Fetching…" : "Refresh"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Winning products — who climbed fastest this {period}.
        </span>
      </div>

      {notice && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {notice}
        </p>
      )}

      <Card>
        {view === "watched" ? (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Spot change</th>
                    <th className="px-3 py-2">Momentum</th>
                    <th className="px-3 py-2">Sales 7d</th>
                    <th className="px-3 py-2">Last snapshot</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {watched.map((w) => (
                    <tr key={w.id} className="border-b last:border-0">
                      <td className="max-w-[280px] px-3 py-2">
                        <div className="flex items-center gap-2">
                          {w.imageUrl ? (
                            <img src={w.imageUrl} alt="" className="h-9 w-9 rounded-md border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <p className="truncate font-medium">{w.name}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{w.currentRank ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {w.spotChange !== null && w.spotChange !== 0 && (
                          <Badge className={w.spotChange > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                            {w.spotChange > 0 ? "▲" : "▼"} {Math.abs(w.spotChange)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {w.momentumScore !== null && (
                          <span className={w.momentumScore >= 0 ? "text-green-600" : "text-red-600"}>
                            {w.momentumScore >= 0 ? "↑" : "↓"} {Math.abs(Math.round(w.momentumScore))}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{w.sales7d != null ? w.sales7d.toLocaleString() : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                        {w.lastSnapshot ? new Date(w.lastSnapshot).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={watching === `${w.source}:${w.sourceProductId}`}
                          onClick={() => toggleWatch({ id: undefined, source: w.source, sourceProductId: w.sourceProductId, name: w.name, imageUrl: w.imageUrl } as MarketRow)}
                        >
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" /> Unwatch
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {watched.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        Nothing watched yet — hit ☆ on products in Discover to start monitoring their trajectory.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        ) : (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Sales 7d</th>
                  <th className="px-3 py-2">GMV 30d</th>
                  <th className="px-3 py-2">Growth</th>
                  <th className="px-3 py-2">Momentum</th>
                  <th className="px-3 py-2">Commission</th>
                  <th className="px-3 py-2">Videos</th>
                  <th className="px-3 py-2">Creators</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.sourceProductId}>
                  <tr className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {row.rank ?? "—"}
                      {row.isHot && <span className="ml-1 text-orange-500">🔥</span>}
                    </td>
                    <td className="max-w-[260px] px-3 py-2">
                      <div className="flex items-center gap-2">
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt=""
                            className="h-9 w-9 rounded-md border object-cover"
                            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.name}</p>
                          {row.categoryL1 && (
                            <p className="truncate text-xs text-muted-foreground">{row.categoryL1}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.priceMin ? `$${row.priceMin}` : "—"}
                      {row.priceMax && row.priceMax !== row.priceMin ? `–$${row.priceMax}` : ""}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(row.sales7d)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{money(row.gmv30d)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.growthRate !== null && (
                        <Badge className={row.growthRate >= 0.2 ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
                          {row.growthRate >= 0 ? "+" : ""}
                          {pct(row.growthRate)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {row.momentumScore !== null && (
                        <Badge
                          className={
                            row.momentumScore >= 10
                              ? "bg-green-100 text-green-700"
                              : row.momentumScore <= -10
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-100 text-slate-600"
                          }
                        >
                          {row.momentumScore >= 0 ? "↑" : "↓"} {Math.abs(Math.round(row.momentumScore))}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{pct(row.commissionRate)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(row.videoCount)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(row.creatorCount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          disabled={watching === `${row.source}:${row.sourceProductId}`}
                          onClick={() => toggleWatch(row)}
                          title={watchedKeys.has(`${row.source}:${row.sourceProductId}`) ? "Unwatch" : "Watch"}
                        >
                          {watching === `${row.source}:${row.sourceProductId}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Star className={`h-3.5 w-3.5 ${watchedKeys.has(`${row.source}:${row.sourceProductId}`) ? "fill-amber-400 text-amber-500" : ""}`} />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() => toggleCreators(row)}
                          disabled={creatorsLoading === row.id}
                        >
                          {creatorsLoading === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Users className="h-3.5 w-3.5" />
                          )}
                          Creators
                        </Button>
                        {row.productId ? (
                          <Badge className="bg-green-100 text-green-700">in Products</Badge>
                        ) : row.id ? (
                          <Button size="sm" variant="outline" disabled={adopting === row.id} onClick={() => adopt(row)}>
                            {adopting === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            Add
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {creatorsFor === row.id && (
                    <tr className="border-b bg-muted/30">
                      <td colSpan={11} className="px-4 py-3">
                        {creatorsNotice && (
                          <p className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                            {creatorsNotice}
                          </p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {(creators[row.id] ?? []).map((c) => (
                            <div
                              key={c.id ?? c.name}
                              className="flex items-center gap-3 rounded-md border bg-background p-2.5"
                            >
                              {c.avatarUrl ? (
                                <img
                                  src={c.avatarUrl}
                                  alt=""
                                  className="h-9 w-9 rounded-full object-cover"
                                  onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                                  <Users className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{c.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {c.followers != null ? `${(c.followers / 1000).toFixed(0)}k followers` : "—"}
                                  {c.engagementRate != null && ` · ${(c.engagementRate * 100).toFixed(1)}% eng`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {c.videoCount != null ? `${c.videoCount} videos` : "—"}
                                  {c.salesForProduct != null && ` · ${c.salesForProduct.toLocaleString()} sales`}
                                </p>
                              </div>
                              {c.rating != null && (
                                <Badge className="bg-slate-100 text-slate-700">★ {c.rating}</Badge>
                              )}
                            </div>
                          ))}
                          {(creators[row.id] ?? []).length === 0 && !creatorsLoading && (
                            <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
                              No creator data yet — hit refresh once source credentials are set.
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No market data yet — hit Refresh (dry-run shows sample data).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
        )}
      </Card>
    </div>
  );
}

// ─── Post Queue tab ────────────────────────────────────────────────────────
// Finished batch videos + captions, ready to post manually anywhere
// (TikTok Studio, IG, FB…). Mark posted to track what's left.

interface QueueItem {
  id: string;
  batchId: string;
  batchName: string;
  productName: string;
  script: string | null;
  posted: boolean;
  postedAt: string | null;
  createdAt: string | null;
}

function PostQueueTab({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [filter, setFilter] = useState<"ready" | "posted" | "all">("ready");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const batches = await (await fetch(`/api/batches?workspaceId=${workspaceId}`)).json();
      const all: QueueItem[] = [];
      for (const b of batches) {
        const detail = await (await fetch(`/api/batches/${b.id}`)).json();
        for (const j of detail.jobs ?? []) {
          if (j.jobType === "batch_video" && j.status === "done" && j.finalUrl) {
            all.push({
              id: j.id,
              batchId: b.id,
              batchName: detail.name ?? b.name ?? "Batch",
              productName: j.productName ?? "Product",
              script: j.script ?? null,
              posted: j.posted,
              postedAt: j.postedAt ?? null,
              createdAt: j.createdAt ?? null,
            });
          }
        }
      }
      all.sort((a, b) =>
        a.posted === b.posted
          ? String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
          : a.posted
            ? 1
            : -1
      );
      setItems(all);
    } catch {
      setItems([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePosted = async (item: QueueItem) => {
    const res = await fetch(`/api/batches/${item.batchId}/jobs/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posted: !item.posted }),
    });
    if (res.ok) {
      toast.success(item.posted ? "Marked as unposted" : "Marked as posted 🎉");
      load();
    } else {
      toast.error("Update failed");
    }
  };

  const copyCaption = async (item: QueueItem) => {
    const text = item.script ?? item.productName;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const shown = items?.filter((i) =>
    filter === "all" ? true : filter === "posted" ? i.posted : !i.posted
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Finished videos ready to post anywhere — TikTok Studio, IG, FB, YT. You post, we track.
          </p>
          <p className="text-xs text-muted-foreground">
            {items ? `${items.filter((i) => !i.posted).length} ready · ${items.filter((i) => i.posted).length} posted` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {(["ready", "posted", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={load}>
            <Loader2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {shown && shown.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No finished videos in this filter — run a batch to fill the queue.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {shown?.map((item) => (
          <Card key={item.id}>
            <CardContent className="flex gap-4 pt-4">
              <video
                src={`/api/videos/${item.id}`}
                controls
                preload="metadata"
                className="aspect-[9/16] w-32 shrink-0 rounded-md bg-black object-contain"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.productName}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.batchName}</p>
                  </div>
                  {item.posted ? (
                    <Badge variant="secondary">posted ✓</Badge>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-700">ready</Badge>
                  )}
                </div>
                <p className="line-clamp-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  {item.script ?? item.productName}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyCaption(item)}>
                    {copiedId === item.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Caption
                  </Button>
                  <a href={`/api/videos/${item.id}`} download>
                    <Button size="sm" variant="outline">
                      Download
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant={item.posted ? "ghost" : "default"}
                    className={item.posted ? "text-muted-foreground" : ""}
                    onClick={() => togglePosted(item)}
                  >
                    {item.posted ? "Unmark" : "Posted ✓"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
