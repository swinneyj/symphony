"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  UserRound,
  Loader2,
  ExternalLink,
  TrendingUp,
  Users,
  Star,
  Workflow,
  Send,
  Search,
  Waves,
  Copy,
  Check,
  Share2,
  Download,
  SlidersHorizontal,
  ImageIcon,
  Eye,
  Heart,
  ShoppingCart,
  DollarSign,
  Store,
  User,
  Megaphone,
  Info,
  Clock,
  Bookmark,
  BookmarkCheck,
  X,
} from "lucide-react";
import type { MarketProductVideo } from "@/lib/market/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { MOTION_PRESETS } from "@/lib/video/presets";
import { formatUsd } from "@/lib/usage-core";
import { ImageStudioTab } from "@/components/image-studio-tab";
import { PersonasTab, type Persona } from "@/components/personas-tab";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  originalImageUrl: string | null;
  processedImageUrl: string | null;
  sceneImageUrl?: string | null;
  sourceType: "manual" | "link" | "tiktok_showcase";
  status: "raw" | "processing" | "ready" | "failed";
}

interface Formula {
  id: string;
  name: string;
  category: string | null;
  format: string | null;
  scriptTemplate: string;
  scenePromptTemplate: string | null;
  motionPreset: string | null;
  durationSec: number | null;
  quality: string | null;
  isSystem: boolean;
  boomerang: boolean;
  overlayTemplate: string | null;
  coverImageUrl: string | null;
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

const VIDEO_STUDIO_TABS = new Set([
  "products",
  "discover",
  "formulas",
  "voices",
  "personas",
  "batches",
  "market",
  "clone",
  "downloader",
  "queue",
]);

// ─── Page ───────────────────────────────────────────────────────────────────

export default function VideoStudioPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("products");
  // Product ids pre-checked in the Batch tab (Market → "Generate videos for these").
  const [batchPreselect, setBatchPreselect] = useState<string[] | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (!requested || !VIDEO_STUDIO_TABS.has(requested)) return;
    const frame = window.requestAnimationFrame(() => setActiveTab(requested));
    return () => window.cancelAnimationFrame(frame);
  }, []);

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

  const loadPersonas = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/personas?workspaceId=${wsId}`);
    if (res.ok) setPersonas(await res.json());
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
    loadPersonas(workspaceId);
    loadBatches(workspaceId);
  }, [workspaceId, loadProducts, loadFormulas, loadVoices, loadPersonas, loadBatches]);

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

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          const url = new URL(window.location.href);
          url.searchParams.set("tab", value);
          window.history.replaceState(window.history.state, "", url);
        }}
      >
        <TabsList className="w-full justify-start overflow-x-auto md:w-auto md:justify-center">
          <TabsTrigger value="products" className="gap-1.5 shrink-0">
            <Package className="h-4 w-4" /> Products
          </TabsTrigger>
          <TabsTrigger value="discover" className="gap-1.5 shrink-0">
            <Waves className="h-4 w-4" /> Swell
          </TabsTrigger>
          <TabsTrigger value="formulas" className="gap-1.5 shrink-0">
            <Wand2 className="h-4 w-4" /> Formulas
          </TabsTrigger>
          <TabsTrigger value="voices" className="gap-1.5 shrink-0">
            <Clapperboard className="h-4 w-4" /> Voices
          </TabsTrigger>
          <TabsTrigger value="personas" className="gap-1.5 shrink-0">
            <UserRound className="h-4 w-4" /> Personas
          </TabsTrigger>
          <TabsTrigger value="batches" className="gap-1.5 shrink-0">
            <Play className="h-4 w-4" /> Batch Studio
          </TabsTrigger>
          <TabsTrigger value="market" className="gap-1.5 shrink-0">
            <TrendingUp className="h-4 w-4" /> Market Research
          </TabsTrigger>
          <TabsTrigger value="clone" className="gap-1.5 shrink-0">
            <Copy className="h-4 w-4" /> Clone
          </TabsTrigger>
          <TabsTrigger value="image-studio" className="gap-1.5 shrink-0">
            <ImageIcon className="h-4 w-4" /> Image Studio
          </TabsTrigger>
          <TabsTrigger value="downloader" className="gap-1.5 shrink-0">
            <Download className="h-4 w-4" /> Downloader
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5 shrink-0">
            <Send className="h-4 w-4" /> Post Queue
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          <ProductsTab
            workspaceId={workspaceId!}
            products={products}
            formulas={formulas}
            onChanged={() => loadProducts(workspaceId!)}
          />
        </TabsContent>

        <TabsContent value="discover" className="mt-4">
          <DiscoverTab
            workspaceId={workspaceId!}
            onAdded={() => loadProducts(workspaceId!)}
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

        <TabsContent value="personas" className="mt-4">
          <PersonasTab
            workspaceId={workspaceId!}
            personas={personas}
            voices={voices}
            onChanged={() => loadPersonas(workspaceId!)}
          />
        </TabsContent>

        <TabsContent value="batches" className="mt-4">
          <BatchStudioTab
            workspaceId={workspaceId!}
            products={products}
            formulas={formulas}
            voices={voices}
            personas={personas}
            batches={batches}
            onBatchesChanged={() => loadBatches(workspaceId!)}
            onProductsChanged={() => loadProducts(workspaceId!)}
            preselectProductIds={batchPreselect}
            onPreselectConsumed={() => setBatchPreselect(null)}
          />
        </TabsContent>

        <TabsContent value="market" className="mt-4">
          <MarketTab
            workspaceId={workspaceId!}
            formulas={formulas}
            onAdopted={() => loadProducts(workspaceId!)}
            onGenerate={(ids) => {
              setBatchPreselect(ids);
              setActiveTab("batches");
            }}
          />
        </TabsContent>

        <TabsContent value="clone" className="mt-4">
          <CloneTab workspaceId={workspaceId!} />
        </TabsContent>

        <TabsContent value="image-studio" className="mt-4">
          <ImageStudioTab workspaceId={workspaceId!} products={products} />
        </TabsContent>

        <TabsContent value="downloader" className="mt-4">
          <DownloaderTab workspaceId={workspaceId!} />
        </TabsContent>

        <TabsContent value="queue" className="mt-4">
          <PostQueueTab workspaceId={workspaceId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Products tab ───────────────────────────────────────────────────────────

function QcBadge({ qc }: { qc: { flag: string; reasons?: string[] } }) {
  const flag = qc.flag ?? "pass";
  const styles: Record<string, string> = {
    pass: "bg-green-100 text-green-700",
    review: "bg-amber-100 text-amber-700",
    fail: "bg-red-100 text-red-700",
  };
  const label = flag === "pass" ? "QC pass" : flag === "review" ? "QC review" : "QC fail";
  return (
    <span
      title={(qc.reasons ?? []).join(" · ") || "Automated border/motion QC"}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[flag] ?? styles.pass}`}
    >
      {label}
    </span>
  );
}

function ProductsTab({
  workspaceId,
  products,
  formulas,
  onChanged,
}: {
  workspaceId: string;
  products: Product[];
  formulas: Formula[];
  onChanged: () => void;
}) {
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ name: "", price: "", description: "", imageUrl: "" });
  const [creating, setCreating] = useState(false);
  const [syncingShop, setSyncingShop] = useState(false);
  // Per-product image view toggle: false = imported image, true = scene render.
  const [sceneView, setSceneView] = useState<Record<string, boolean>>({});
  // Per-product selected scene formula (dropdown on the card).
  const [sceneFormula, setSceneFormula] = useState<Record<string, string>>({});

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
    const urls = importUrl
      .split(/\n/)
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast.error("Paste a product link first");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, urls }),
      });
      const data = await res.json();
      if (!res.ok && !data.imported) throw new Error(data.error || "Import failed");
      const added = data.importedCount ?? (data.imported ? data.imported.length : 1);
      const failedCount = data.failedCount ?? 0;
      if (failedCount > 0) {
        toast.error(
          `${added} imported, ${failedCount} failed${
            data.failed?.[0] ? ` — ${data.failed[0].url}: ${data.failed[0].error}` : ""
          }`
        );
      } else {
        toast.success(`${added} product${added === 1 ? "" : "s"} imported`);
      }
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

  const handleGenerateScene = async (product: Product, formulaId: string) => {
    if (!formulaId) return;
    try {
      const res = await fetch(`/api/products/${product.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, formulaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Queue failed");
      toast.success("Scene generation queued");
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
            placeholder="Paste product links — one per line (up to 20)…"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleImport()}
            className="min-h-[2.5rem]"
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
        <div className="space-y-2">
          {products.map((product) => (
            <div key={product.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-background p-2.5 transition hover:border-primary/40">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-zinc-100">
                {product.originalImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/products/${product.id}/image${sceneView[product.id] ? "?variant=scene" : ""}`}
                    alt={product.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                )}
                {product.sceneImageUrl && (
                  <button
                    type="button"
                    onClick={() => setSceneView((v) => ({ ...v, [product.id]: !v[product.id] }))}
                    className={`absolute top-1 right-1 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold shadow-sm transition-colors ${
                      sceneView[product.id] ? "bg-primary text-primary-foreground" : "bg-white/90 text-zinc-700 hover:bg-white"
                    }`}
                    title={sceneView[product.id] ? "Showing AI scene" : "Show AI scene"}
                  >
                    <Wand2 className="h-2.5 w-2.5" />
                    {sceneView[product.id] ? "Scene" : "AI"}
                  </button>
                )}
              </div>
              <div className="min-w-0 flex-1 basis-40">
                <div className="flex items-center gap-2">
                  <p className="line-clamp-1 text-sm font-medium">{product.name}</p>
                  <Badge className={cn("shrink-0", STATUS_STYLE[product.status])}>{product.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {product.price && <span className="font-medium">{product.price}</span>}
                  {product.price && product.sourceType ? " · " : ""}
                  {product.sourceType && <span className="capitalize">{product.sourceType}</span>}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <select
                  value={sceneFormula[product.id] ?? ""}
                  onChange={(e) => setSceneFormula((v) => ({ ...v, [product.id]: e.target.value }))}
                  className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-xs text-foreground outline-none"
                  title="Scene (formula) for AI regeneration"
                >
                  <option value="">Scene…</option>
                  {formulas.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" disabled={product.status === "processing"} onClick={() => handleProcess(product)}>
                  <Play className="h-3.5 w-3.5" />
                  Process
                </Button>
                <Button size="sm" variant="outline" disabled={!sceneFormula[product.id]} onClick={() => handleGenerateScene(product, sceneFormula[product.id])}>
                  <Wand2 className="h-3.5 w-3.5" />
                  Scene
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(product)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Discover tab ───────────────────────────────────────────────────────────

type DiscoverProduct = {
  id: string;
  name: string;
  description?: string | null;
  price?: string | null;
  currency?: string | null;
  mainImageUrl?: string | null;
  detailLink?: string | null;
  addedStatus?: string | null;
  sellerName?: string | null;
};

type DiscoverError = {
  kind: "not_connected" | "app_blocked" | "token" | "other";
  message: string;
} | null;

// ─── Swell meter ─────────────────────────────────────────────────────────────

type SwellMover = {
  sourceProductId: string;
  name: string;
  imageUrl?: string | null;
  price?: string | null;
  currency?: string | null;
  rank: number | null;
  prevRank: number | null;
  delta: number | null;
  watched: boolean;
};

function SwellMeter({
  workspaceId,
  onAdd,
}: {
  workspaceId: string;
  onAdd: (p: DiscoverProduct) => Promise<void>;
}) {
  const [movers, setMovers] = useState<SwellMover[]>([]);
  const [state, setState] = useState<"loading" | "warming" | "ready" | "error">(
    "loading"
  );
  const [watching, setWatching] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/market/swell?workspaceId=${workspaceId}&limit=8`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Swell meter failed");
        if (cancelled) return;
        setMovers((data.rows ?? []) as SwellMover[]);
        setState(data.ready ? "ready" : "warming");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const toggleWatch = async (m: SwellMover) => {
    setWatching(m.sourceProductId);
    try {
      if (m.watched) {
        await fetch(
          `/api/market/watchlist?workspaceId=${workspaceId}&source=tiktok_shop&sourceProductId=${m.sourceProductId}`,
          { method: "DELETE" }
        );
      } else {
        await fetch("/api/market/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            source: "tiktok_shop",
            sourceProductId: m.sourceProductId,
            name: m.name,
            imageUrl: m.imageUrl,
          }),
        });
      }
      setMovers((prev) =>
        prev.map((x) =>
          x.sourceProductId === m.sourceProductId
            ? { ...x, watched: !m.watched }
            : x
        )
      );
    } catch {
      toast.error("Watch update failed");
    } finally {
      setWatching(null);
    }
  };

  const handleAdd = async (m: SwellMover) => {
    setAdding(m.sourceProductId);
    try {
      await onAdd({
        id: m.sourceProductId,
        name: m.name,
        price: m.price,
        currency: m.currency,
        mainImageUrl: m.imageUrl,
      });
    } finally {
      setAdding(null);
    }
  };

  const fmtPrice = (m: SwellMover) => {
    if (!m.price) return "—";
    return m.currency === "USD" || !m.currency
      ? `$${m.price}`
      : `${m.price} ${m.currency}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Waves className="h-4 w-4 text-sky-500" /> Swell meter
        </CardTitle>
        <CardDescription>
          Biggest movers in the TikTok Shop SALE rankings — spot them before
          they blow up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {state === "loading" && (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the swell…
          </div>
        )}
        {state === "warming" && (
          <p className="py-2 text-sm text-muted-foreground">
            Swell is warming up — daily SALE-rank snapshots start the moment
            your TikTok Shop account is connected, and movers appear after two
            snapshots.
          </p>
        )}
        {state === "error" && (
          <p className="py-2 text-sm text-muted-foreground">
            Swell meter is unavailable right now.
          </p>
        )}
        {state === "ready" && movers.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            No movement detected in the latest snapshot — check back tomorrow.
          </p>
        )}
        {state === "ready" && movers.length > 0 && (
          <ul className="space-y-1.5">
            {movers.map((m) => (
              <li
                key={m.sourceProductId}
                className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2"
              >
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-zinc-100">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Package className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtPrice(m)}
                    {m.rank != null ? ` · rank #${m.rank}` : ""}
                  </p>
                </div>
                {m.delta != null && m.delta !== 0 ? (
                  <Badge
                    variant="outline"
                    className={
                      m.delta > 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }
                  >
                    {m.delta > 0 ? "▲" : "▼"} {Math.abs(m.delta)}
                  </Badge>
                ) : (
                  <Badge variant="outline">—</Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => toggleWatch(m)}
                  disabled={watching === m.sourceProductId}
                  title={m.watched ? "Unwatch" : "Watch trajectory"}
                >
                  <Star
                    className={`h-4 w-4 ${
                      m.watched
                        ? "fill-amber-400 text-amber-500"
                        : "text-muted-foreground"
                    }`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleAdd(m)}
                  disabled={adding === m.sourceProductId}
                  title="Add to products"
                >
                  {adding === m.sourceProductId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DiscoverTab({
  workspaceId,
  onAdded,
}: {
  workspaceId: string;
  onAdded: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [sortField, setSortField] = useState<"SALE" | "PRICE" | "PRODUCT_ID">(
    "SALE"
  );
  const [sortOrder, setSortOrder] = useState<"DESC" | "ASC">("DESC");
  const [results, setResults] = useState<DiscoverProduct[]>([]);
  const [pageToken, setPageToken] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<DiscoverError>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = async (pageTokenArg?: string) => {
    setSearching(!pageTokenArg);
    setLoadingMore(!!pageTokenArg);
    setError(null);
    try {
      const res = await fetch("/api/products/shop-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          keyword: keyword.trim() || undefined,
          sortField,
          sortOrder,
          pageToken: pageTokenArg ?? undefined,
          pageSize: 24,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const kind =
          res.status === 501
            ? "not_connected"
            : res.status === 502 && /app|publish|approve/i.test(data.error ?? "")
              ? "app_blocked"
              : res.status === 502 && /token|reconnect/i.test(data.error ?? "")
                ? "token"
                : "other";
        setError({ kind, message: data.error || "Search failed" });
        if (res.status === 501 || res.status === 502) {
          setResults([]);
          setPageToken(null);
        }
        return;
      }
      const page = (data.products ?? []) as DiscoverProduct[];
      setResults((prev) => (pageTokenArg ? [...prev, ...page] : page));
      setPageToken(data.nextPageToken || null);
      setSearched(true);
    } catch (err) {
      setError({
        kind: "other",
        message: err instanceof Error ? err.message : "Search failed",
      });
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  };

  const handleAdd = async (p: DiscoverProduct) => {
    try {
      const res = await fetch("/api/products/shop-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          product: {
            id: p.id,
            name: p.name,
            description: p.description,
            price: p.price,
            currency: p.currency,
            mainImageUrl: p.mainImageUrl,
            detailLink: p.detailLink,
            addedStatus: p.addedStatus,
            sellerName: p.sellerName,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Add failed");
      setAddedIds((prev) => new Set(prev).add(p.id));
      toast.success(
        data.alreadyExists
          ? `"${p.name.slice(0, 40)}" is already in your products`
          : `"${p.name.slice(0, 40)}" added to products`
      );
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Waves className="h-5 w-5 text-sky-500" /> Swell
        </h2>
        <p className="text-sm text-muted-foreground">
          Catch the wave before it breaks — find rising products, watch their
          momentum, grab the best link.
        </p>
      </div>

      <SwellMeter workspaceId={workspaceId} onAdd={handleAdd} />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search TikTok Shop products… e.g. stadium chair, cooling towel"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          className="min-h-[2.5rem] flex-1 min-w-[240px]"
        />
        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value as typeof sortField)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          title="Sort results"
        >
          <option value="SALE">Sort: Top sales</option>
          <option value="PRICE">Sort: Price</option>
          <option value="PRODUCT_ID">Sort: Newest</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSortOrder(sortOrder === "DESC" ? "ASC" : "DESC")}
          title={sortOrder === "DESC" ? "Descending" : "Ascending"}
          className="h-10 w-10 shrink-0"
        >
          <TrendingUp
            className={`h-4 w-4 transition-transform ${
              sortOrder === "ASC" ? "rotate-180" : ""
            }`}
          />
        </Button>
        <Button onClick={() => runSearch()} disabled={searching}>
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Search
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="flex-1">{error.message}</span>
          {error.kind === "not_connected" && (
            <Link
              href="/settings"
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Open Settings
            </Link>
          )}
        </div>
      )}

      {results.length === 0 && searched && !searching && !error && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No products found{keyword ? ` for "${keyword}"` : ""} — try a
          different keyword.
        </p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {results.map((p) => {
            const added = addedIds.has(p.id);
            return (
              <div
                key={p.id}
                className="flex flex-col overflow-hidden rounded-xl border bg-card"
              >
                <div className="aspect-square w-full overflow-hidden bg-zinc-100">
                  {p.mainImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.mainImageUrl}
                      alt={p.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {p.name}
                  </p>
                  <p className="text-sm font-semibold">
                    {p.price ? `$${p.price}` : "—"}
                    {p.sellerName ? (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        {p.sellerName}
                      </span>
                    ) : null}
                  </p>
                  <div className="mt-auto flex items-center gap-1.5 pt-1">
                    {p.addedStatus ? (
                      <Badge
                        variant={
                          p.addedStatus === "ADDABLE" ? "default" : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {p.addedStatus}
                      </Badge>
                    ) : null}
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      variant={added ? "secondary" : "default"}
                      disabled={added}
                      onClick={() => handleAdd(p)}
                    >
                      {added ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Added
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" /> Add
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pageToken && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => runSearch(pageToken)}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Load more
          </Button>
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
  // Library filters (mirror batchbot.io: search + All formats + All categories)
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [draft, setDraft] = useState({
    name: "",
    category: "generic",
    format: "ai",
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

  // Client-side filtering: search by name + format + category (like batchbot.io).
  const filteredFormulas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return formulas.filter((f) => {
      if (formatFilter !== "all" && (f.format ?? "ai") !== formatFilter) return false;
      if (categoryFilter !== "all" && (f.category ?? "generic") !== categoryFilter) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [formulas, query, formatFilter, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of formulas) if (f.category) set.add(f.category);
    return [...set].sort();
  }, [formulas]);

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
          format: draft.format,
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
      {/* Library toolbar — mirrors batchbot.io: search + All formats + All categories */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search formulas"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
          >
            <option value="all">All formats</option>
            <option value="ai">AI</option>
            <option value="no_ai">No AI</option>
            <option value="hybrid">Hybrid</option>
          </select>
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
                <Label>Format</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={draft.format}
                  onChange={(e) => setDraft({ ...draft, format: e.target.value })}
                >
                  <option value="ai">AI</option>
                  <option value="no_ai">No AI</option>
                  <option value="hybrid">Hybrid</option>
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

      {filteredFormulas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <Search className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No formulas match your search or filters.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setQuery("");
              setFormatFilter("all");
              setCategoryFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {filteredFormulas.map((formula) => (
          <Card
            key={formula.id}
            className="group overflow-hidden transition-shadow hover:shadow-md"
          >
            <Link href={`/video-studio/formulas/${formula.id}`} className="block">
              <div className="relative aspect-[9/16] w-full overflow-hidden bg-muted">
                {formula.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/formula-covers/${formula.id}`}
                    alt={formula.name}
                    className="formula-preview-image h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-100 to-zinc-200 p-4 text-center">
                    <Clapperboard className="h-8 w-8 text-zinc-400" />
                    <span className="line-clamp-2 text-xs font-medium text-zinc-500">
                      {formula.name}
                    </span>
                  </div>
                )}
                {formula.coverImageUrl && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
                    <Play className="h-2.5 w-2.5 fill-current" /> Scene preview
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2">
                  <Badge className="bg-blue-600 text-white">
                    {formula.isSystem ? "OFFICIAL" : "FORMULA"}
                  </Badge>
                  <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {formula.durationSec}s · {formula.quality}
                  </span>
                </div>
              </div>
              <div className="space-y-1 p-2.5">
                <p className="line-clamp-1 text-sm font-semibold">{formula.name}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground capitalize">
                  {formula.category ?? "formula"}
                  {formula.format ? ` · ${formula.format.replace("_", " ")}` : ""}
                  {formula.boomerang ? " · ↺" : ""}
                  {formula.overlayTemplate ? " · TXT" : ""}
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-1 px-2.5 pb-2.5">
              {formula.isSystem ? (
                <span className="text-[11px] text-muted-foreground">Built-in</span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-red-600"
                  onClick={() => handleDelete(formula)}
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-xs"
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
                <Share2 className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      )}

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

      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-medium">Music &amp; sounds</p>
            <p className="text-xs text-muted-foreground">
              TikTok Shop / Commercial Music Library integration will appear here when an authorized catalog connection is available.
            </p>
          </div>
          <Badge variant="secondary">Coming with catalog access</Badge>
        </CardContent>
      </Card>

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
  aiCostUsd?: number;
  aiLlmCostUsd?: number;
  aiLlmCalls?: number;
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

const ENGINES = [
  { value: "sora", label: "Sora" },
  { value: "seedance", label: "Seedance 2.5" },
  { value: "veo", label: "Veo 3.1" },
  { value: "kling_v1", label: "Kling 1.0" },
  { value: "kling_v3", label: "Kling 3.0" },
];
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
  personas,
  batches,
  onBatchesChanged,
  preselectProductIds,
  onPreselectConsumed,
}: {
  workspaceId: string;
  products: Product[];
  formulas: Formula[];
  voices: Voice[];
  personas?: Persona[];
  batches: BatchSummary[];
  onBatchesChanged: () => void;
  onProductsChanged: () => void;
  preselectProductIds?: string[] | null;
  onPreselectConsumed?: () => void;
}) {
  const [name, setName] = useState("");
  const [formulaId, setFormulaId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [personaId, setPersonaId] = useState("");
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

  // "Generate videos for these" jump-in: pre-check the adopted product ids
  // (from Market → bulk adopt) once they exist in the products list.
  useEffect(() => {
    if (!preselectProductIds || preselectProductIds.length === 0) return;
    const available = preselectProductIds.filter((id) => products.some((p) => p.id === id));
    if (available.length === 0) return; // products not loaded yet — wait for them
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prop-driven jump-in (matches file pattern)
    setSelected((prev) => Array.from(new Set([...prev, ...available])));
    onPreselectConsumed?.();
  }, [preselectProductIds, products, onPreselectConsumed]);

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
          personaId: personaId || null,
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
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="batch-persona">Persona (AI influencer)</Label>
              <select
                id="batch-persona"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value)}
              >
                <option value="">None</option>
                {(personas ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isSystem ? " (system)" : ""}
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
                    {typeof batch.aiCostUsd === "number" && batch.aiCostUsd > 0 && (
                      <span className="ml-1 text-emerald-600">
                        · AI spend {formatUsd(batch.aiCostUsd)}
                      </span>
                    )}
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
                      {job.status === "done" && job.metadata && (job.metadata.qc as { flag?: string; reasons?: string[] } | undefined) && (
                        <QcBadge qc={job.metadata.qc as { flag: string; reasons?: string[] }} />
                      )}
                      {(job.footageUrl || job.finalUrl) && (
                        <a
                          href={job.finalUrl
                            ? `/api/videos/${job.id}?kind=final`
                            : `/api/videos/${job.id}?kind=footage`}
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
  metadata?: Record<string, unknown>;
}

// ── Drill filter bar (influencer drill: server + client filters) ───────────
interface DrillFilterState {
  /** "" = all; else an L1 category id from the filters route. Server-side. */
  categoryId: string;
  /** Server-side keyword search within the creator's products. */
  keyword: string;
  /** Client-side price band over loaded rows (priceMin). */
  priceMin: string;
  priceMax: string;
  /** Client-side date band over loaded rows (create_time, YYYY-MM-DD). */
  dateFrom: string;
  dateTo: string;
  /** all = server default · top = server sales sort · new = client created-desc. */
  tab: "all" | "top" | "new";
}
interface DrillMeta {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
}
interface DrillCategory {
  id: string;
  name: string;
  count: number;
}
const DRILL_DEFAULT_FILTER: DrillFilterState = {
  categoryId: "",
  keyword: "",
  priceMin: "",
  priceMax: "",
  dateFrom: "",
  dateTo: "",
  tab: "all",
};
/** drillSort → EchoTik order key (all verified live 2026-09-02). */
const DRILL_ORDER_KEYS: Record<string, string> = {
  default: "",
  sales: "total_sale_cnt",
  gmv: "total_gmv_amt",
  videos: "videos_count",
  price: "avg_price",
};

// ── White-background detection (client-side canvas check, $0 API cost) ─────
// Product covers live on cdn.echotik.live which sends `access-control-allow-
// origin: *` (verified 2026-09-01) so a canvas pixel read is safe. Cached
// module-wide so re-renders and duplicate rows never re-scan.
const whiteBgCache = new Map<string, boolean>();

/** Compact count formatter: 159710 → "160K", 1260000 → "1.3M". */
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

type WhiteBgStatus = "checking" | "white" | "not-white" | "unknown";

function useWhiteBg(url: string | null): WhiteBgStatus {
  // Lazy initial state reads the cache so a cache hit never setStates in an effect.
  const [status, setStatus] = useState<WhiteBgStatus>(() => {
    if (!url) return "unknown";
    const cached = whiteBgCache.get(url);
    return cached !== undefined ? (cached ? "white" : "not-white") : "checking";
  });
  useEffect(() => {
    if (!url) return;
    const cached = whiteBgCache.get(url);
    if (cached !== undefined) return; // already known (lazy init or prior url)
    let cancelled = false;
    void (async () => {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("load failed"));
          img.src = url;
        });
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("no canvas context");
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let white = 0;
        let total = 0;
        for (let i = 0; i < data.length; i += 16) {
          if (data[i] > 232 && data[i + 1] > 232 && data[i + 2] > 232) white += 1;
          total += 1;
        }
        const isWhite = white / total > 0.55;
        whiteBgCache.set(url, isWhite);
        if (!cancelled) setStatus(isWhite ? "white" : "not-white");
      } catch {
        whiteBgCache.set(url, false);
        if (!cancelled) setStatus("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return status;
}

function WhiteBgBadge({ url, className }: { url: string | null; className?: string }) {
  const status = useWhiteBg(url);
  if (status !== "white") return null;
  return (
    <span
      className={cn("rounded bg-emerald-600/90 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white", className)}
      title="White-background photo"
    >
      WB
    </span>
  );
}

/** Drill gallery card: large image, white-bg badge, select checkbox, meta. */
function DrillCard({
  p,
  selected,
  onToggle,
  whiteBgOnly,
}: {
  p: MarketRow;
  selected: boolean;
  onToggle: () => void;
  whiteBgOnly: boolean;
}) {
  const bg = useWhiteBg(p.imageUrl);
  const hiddenByFilter = whiteBgOnly && bg !== "white"; // checking/unknown/non-white hidden
  if (hiddenByFilter) return null;
  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-1.5 rounded-md border p-2 transition hover:border-primary/50",
        selected ? "border-primary bg-primary/5" : ""
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md border bg-muted">
        {p.imageUrl ? (
          <img
            src={p.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <span className="absolute right-1 top-1 rounded bg-background/85 px-1 py-0.5 text-[10px] font-semibold text-foreground">
          {p.sales30d != null ? `${fmtCompact(p.sales30d)} sold` : ""}
        </span>
        <WhiteBgBadge url={p.imageUrl} className="absolute left-1 top-1" />
      </div>
      <div className="flex items-start gap-1.5">
        <input
          type="checkbox"
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
          checked={selected}
          onChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs font-medium leading-tight">{p.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {p.priceMin != null ? `$${p.priceMin}` : "—"}
            {p.commissionRate != null ? ` · ${Math.round(p.commissionRate * 100)}% comm` : ""}
          </p>
        </div>
      </div>
    </label>
  );
}

interface MarketAnalyticsRow {
  productId: string;
  name: string | null;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  commissionRate: number | null;
  rating: number | null;
  reviewCount: number | null;
  sellerId: string | null;
  salesTrend: number | null;
  firstCrawlDate: string | null;
  isSShop: boolean;
  freeShipping: boolean;
  brandStore: boolean;
  fromFlag: number | null;
  totalSales: number | null;
  totalGmv: number | null;
  panorama: {
    period: number;
    sales: number | null;
    gmv: number | null;
    videoCnt: number | null;
    videoSales: number | null;
    liveCnt: number | null;
    liveSales: number | null;
    influencers: number | null;
  }[];
  trend: {
    date: string;
    price: number | null;
    influencers: number | null;
    liveCount: number | null;
    videoCount: number | null;
    sales1d: number | null;
    salesTotal: number | null;
    gmv1d: number | null;
    gmvTotal: number | null;
  }[];
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

interface SavedSellerRow {
  id: string;
  kind: "influencer" | "shop";
  source: string;
  sourceId: string;
  name: string;
  avatarUrl: string | null;
  category: string | null;
  followers: number | null;
  createdAt: string;
}

interface FilterFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
}

function FilterField({ label, value, onChange, type = "text", step, placeholder }: FilterFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
      />
    </label>
  );
}

/** Amber flag for a literal 0% engagement rate — EchoTik itself flags these
 *  accounts; typically automated mass-posters (e.g. @spongebobprodsz).
 *  `null` (unknown) and small-but-nonzero rates pass silently. */
function LowEngagementFlag({ rate }: { rate: number | null }) {
  if (rate !== 0) return null;
  return (
    <Badge
      className="bg-amber-100 text-amber-700"
      title="0% engagement rate — possible automated/mass-poster account"
    >
      ⚠ 0% eng
    </Badge>
  );
}

function AnalyticsPanel({ a }: { a: MarketAnalyticsRow | undefined }) {
  if (!a) return null;
  const periods = a.panorama ?? [];
  const trend = a.trend ?? [];
  const maxGmv = Math.max(...trend.map((t) => t.gmv1d ?? 0), 1);
  const maxSales = Math.max(...trend.map((t) => t.sales1d ?? 0), 1);
  const sparkPoints = trend.map((t) => t.sales1d ?? 0);
  const sparkMax = Math.max(...sparkPoints, 1);
  const sparkPath =
    sparkPoints.length > 1
      ? sparkPoints
          .map((v, i) => {
            const x = (i / (sparkPoints.length - 1)) * 100;
            const y = 40 - (v / sparkMax) * 36;
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : "";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Business panorama</p>
        <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
          {a.rating != null && <Badge className="bg-slate-100 text-slate-700">★ {a.rating.toFixed(1)}</Badge>}
          {a.reviewCount != null && <Badge className="bg-slate-100 text-slate-700">💬 {a.reviewCount.toLocaleString()}</Badge>}
          {a.isSShop && <Badge className="bg-violet-100 text-violet-700">S-shop</Badge>}
          {a.brandStore && <Badge className="bg-blue-100 text-blue-700">Brand store</Badge>}
          {a.freeShipping && <Badge className="bg-emerald-100 text-emerald-700">Free ship</Badge>}
          {a.fromFlag === 1 && <Badge className="bg-slate-100 text-slate-600">Local</Badge>}
          {a.fromFlag === 2 && <Badge className="bg-slate-100 text-slate-600">Cross-border</Badge>}
          {a.salesTrend === 1 && <Badge className="bg-green-100 text-green-700">Sales ↑ 7d</Badge>}
          {a.salesTrend === 0 && <Badge className="bg-slate-100 text-slate-600">Sales → 7d</Badge>}
          {a.salesTrend === 2 && <Badge className="bg-red-100 text-red-700">Sales ↓ 7d</Badge>}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-[11px] text-muted-foreground">
                <th className="px-2 py-1.5">Period</th>
                <th className="px-2 py-1.5">Sales</th>
                <th className="px-2 py-1.5">GMV</th>
                <th className="px-2 py-1.5">Videos</th>
                <th className="px-2 py-1.5">Video sales</th>
                <th className="px-2 py-1.5">Lives</th>
                <th className="px-2 py-1.5">Live sales</th>
                <th className="px-2 py-1.5">Influencers</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.period} className="border-b last:border-0">
                  <td className="px-2 py-1.5 font-mono text-muted-foreground">
                    {p.period === 1 ? "1d" : `${p.period}d`}
                  </td>
                  <td className="px-2 py-1.5">{p.sales != null ? p.sales.toLocaleString() : "—"}</td>
                  <td className="px-2 py-1.5">{p.gmv != null ? `$${Math.round(p.gmv).toLocaleString()}` : "—"}</td>
                  <td className="px-2 py-1.5">{p.videoCnt != null ? p.videoCnt.toLocaleString() : "—"}</td>
                  <td className="px-2 py-1.5">{p.videoSales != null ? p.videoSales.toLocaleString() : "—"}</td>
                  <td className="px-2 py-1.5">{p.liveCnt != null ? p.liveCnt.toLocaleString() : "—"}</td>
                  <td className="px-2 py-1.5">{p.liveSales != null ? p.liveSales.toLocaleString() : "—"}</td>
                  <td className="px-2 py-1.5">{p.influencers != null ? p.influencers.toLocaleString() : "—"}</td>
                </tr>
              ))}
              {periods.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">
                    No panorama data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">180-day sales trend</p>
        {sparkPath ? (
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full rounded-md border bg-background">
            <path d={sparkPath} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-600" />
            {trend.length > 0 && (
              <text x="1" y="8" fontSize="5" className="fill-muted-foreground">
                {trend[trend.length - 1].date} · 1d sales {trend[trend.length - 1].sales1d?.toLocaleString() ?? "—"}
              </text>
            )}
          </svg>
        ) : (
          <p className="rounded-md border bg-background px-3 py-6 text-center text-xs text-muted-foreground">
            No trend data yet.
          </p>
        )}
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border bg-background p-2">
            <p className="text-[11px] text-muted-foreground">Total sales</p>
            <p className="text-sm font-medium">{a.totalSales != null ? a.totalSales.toLocaleString() : "—"}</p>
          </div>
          <div className="rounded-md border bg-background p-2">
            <p className="text-[11px] text-muted-foreground">Total GMV</p>
            <p className="text-sm font-medium">{a.totalGmv != null ? `$${Math.round(a.totalGmv).toLocaleString()}` : "—"}</p>
          </div>
          <div className="rounded-md border bg-background p-2">
            <p className="text-[11px] text-muted-foreground">Price</p>
            <p className="text-sm font-medium">
              {a.priceMin != null
                ? `$${a.priceMin}${a.priceMax && a.priceMax !== a.priceMin ? `–$${a.priceMax}` : ""}`
                : "—"}
            </p>
          </div>
        </div>
        {maxGmv > 1 && maxSales > 1 && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Peak 1-day: {Math.round(maxSales).toLocaleString()} sales · ${Math.round(maxGmv).toLocaleString()} GMV
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Product Detail Dialog (EchoTik-style drill-down) ──────────────────────
// Click a product → full-screen pop-out with tabbed intel:
//   Overview — business panorama + trend (existing analytics layer)
//   Videos   — videos featuring the product, with "Promote" (paid) badges
//   Creators — affiliate creators driving the product
//   Brand    — every product the seller/brand sells (click to jump)

interface DetailProduct {
  source: string;
  sourceProductId: string;
  name: string;
  imageUrl: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string;
  categoryL1: string | null;
}

function compactNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtShortDate(ts: number | null | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function VideoCard({
  v,
  playing,
  onPlay,
}: {
  v: MarketProductVideo;
  playing: boolean;
  onPlay: () => void;
}) {
  const tiktokUrl =
    v.creatorName && v.videoId
      ? `https://www.tiktok.com/@${encodeURIComponent(v.creatorName)}/video/${encodeURIComponent(v.videoId)}`
      : null;
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="relative aspect-[9/16] w-full cursor-pointer bg-black" onClick={onPlay}>
        {playing && v.playUrl ? (
          <video src={v.playUrl} controls autoPlay playsInline className="h-full w-full object-contain" />
        ) : v.coverUrl ? (
          <img
            src={v.coverUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Clapperboard className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/35">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
              <Play className="h-4 w-4 fill-white text-white" />
            </div>
          </div>
        )}
        {!playing && v.duration != null && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white">
            {fmtDuration(v.duration)}
          </span>
        )}
        {v.isAd && (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
            <DollarSign className="h-3 w-3" /> Promote
          </span>
        )}
        {!playing && v.salesFlag != null && v.salesFlag > 0 && (
          <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <ShoppingCart className="h-3 w-3" /> Sells
          </span>
        )}
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" /> {compactNum(v.views)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3 w-3" /> {compactNum(v.diggs)}
          </span>
          <span className="inline-flex items-center gap-1">
            <ShoppingCart className="h-3 w-3" /> {compactNum(v.sales)}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
            ${compactNum(v.gmv)}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-foreground/90">{v.description || "—"}</p>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">
            {v.creatorName ? `@${v.creatorName}` : "Unknown creator"}
            {v.region ? ` · ${v.region}` : ""}
          </span>
          <span className="shrink-0">{v.createTime ? fmtShortDate(Number(v.createTime) * 1000) : ""}</span>
        </div>
        {tiktokUrl && (
          <a
            href={tiktokUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" /> View on TikTok
          </a>
        )}
      </div>
    </div>
  );
}

function ProductDetailBody({
  product,
  workspaceId,
  initialAnalytics,
}: {
  product: DetailProduct;
  workspaceId: string;
  initialAnalytics?: MarketAnalyticsRow | null;
}) {
  const [viewed, setViewed] = useState<DetailProduct>(product);
  const [tab, setTab] = useState("overview");
  const [notice, setNotice] = useState<string | null>(null);
  // Overview
  const [analytics, setAnalytics] = useState<MarketAnalyticsRow | null>(initialAnalytics ?? null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // Videos
  const [videos, setVideos] = useState<MarketProductVideo[] | null>(null);
  const [videosLoading, setVideosLoading] = useState(false);
  const [promoteCount, setPromoteCount] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  // Creators
  const [creators, setCreators] = useState<MarketCreatorRow[] | null>(null);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  // Brand
  const [sellerProducts, setSellerProducts] = useState<MarketRow[] | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);

  // Navigating to a seller product resets all fetched state.
  useEffect(() => {
    setTab("overview");
    setNotice(null);
    setAnalytics(null);
    setVideos(null);
    setVideosLoading(false);
    setCreators(null);
    setSellerProducts(null);
    setPlayingId(null);
  }, [viewed.sourceProductId]);

  const qs = `workspaceId=${workspaceId}&source=${encodeURIComponent(viewed.source)}&sourceProductId=${encodeURIComponent(viewed.sourceProductId)}`;

  const loadAnalytics = useCallback(async () => {
    if (analytics || analyticsLoading) return;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/market/products/analytics?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load analytics");
      if (data.analytics) setAnalytics(data.analytics);
      else if (data.notice) setNotice(data.notice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [qs, analytics, analyticsLoading]);

  const loadVideos = useCallback(async () => {
    if (videos || videosLoading) return;
    setVideosLoading(true);
    try {
      const res = await fetch(`/api/market/products/videos?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load videos");
      setVideos(data.videos ?? []);
      setPromoteCount(data.promoteCount ?? 0);
      if (data.notice) setNotice(data.notice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load videos");
    } finally {
      setVideosLoading(false);
    }
  }, [qs, videos, videosLoading]);

  const loadCreators = useCallback(async () => {
    if (creators || creatorsLoading) return;
    setCreatorsLoading(true);
    try {
      const res = await fetch(`/api/market/products/creators?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load creators");
      setCreators(data.rows ?? []);
      if (data.notice) setNotice(data.notice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load creators");
    } finally {
      setCreatorsLoading(false);
    }
  }, [qs, creators, creatorsLoading]);

  const loadSeller = useCallback(async () => {
    if (sellerProducts || sellerLoading || !analytics?.sellerId) return;
    setSellerLoading(true);
    try {
      const res = await fetch(
        `/api/market/products/seller-products?workspaceId=${workspaceId}&source=${encodeURIComponent(viewed.source)}&sellerId=${encodeURIComponent(analytics.sellerId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load brand products");
      setSellerProducts(data.products ?? []);
      if (data.notice) setNotice(data.notice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load brand products");
    } finally {
      setSellerLoading(false);
    }
  }, [analytics?.sellerId, sellerProducts, sellerLoading, viewed.source, workspaceId]);

  // Activate the fetch for whichever tab is visible (once).
  useEffect(() => {
    if (tab === "overview") loadAnalytics();
    else if (tab === "videos") loadVideos();
    else if (tab === "creators") loadCreators();
    else if (tab === "brand") {
      if (!analytics) loadAnalytics();
      else loadSeller();
    }
  }, [tab, analytics, loadAnalytics, loadVideos, loadCreators, loadSeller]);

  const openSellerProduct = (p: MarketRow) => {
    setViewed({
      source: p.source,
      sourceProductId: p.sourceProductId,
      name: p.name,
      imageUrl: p.imageUrl,
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      currency: p.currency,
      categoryL1: p.categoryL1,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3 pr-12">
        <div className="flex min-w-0 items-center gap-3">
          {viewed.imageUrl ? (
            <img
              src={viewed.imageUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg border object-cover"
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{viewed.name}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {viewed.priceMin != null
                ? `$${viewed.priceMin}${viewed.priceMax && viewed.priceMax !== viewed.priceMin ? `–$${viewed.priceMax}` : ""}`
                : "Price —"}
              {viewed.categoryL1 ? ` · ${viewed.categoryL1}` : ""}
            </DialogDescription>
          </div>
        </div>
        {promoteCount > 0 && (
          <Badge className="shrink-0 bg-orange-100 text-orange-700">
            <DollarSign className="h-3 w-3 mr-0.5" /> {promoteCount} Promote
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-3">
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="videos" className="gap-1">
              <Clapperboard className="h-3.5 w-3.5" /> Videos
              {videos && <span className="text-muted-foreground">({videos.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="creators" className="gap-1">
              <Users className="h-3.5 w-3.5" /> Creators
            </TabsTrigger>
            <TabsTrigger value="brand" className="gap-1">
              <Store className="h-3.5 w-3.5" /> Brand
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {notice && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              {notice}
            </p>
          )}

          {/* Overview */}
          <TabsContent value="overview" className="mt-0">
            {analyticsLoading && !analytics ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading business panorama…
              </div>
            ) : (
              <AnalyticsPanel a={analytics ?? undefined} />
            )}
          </TabsContent>

          {/* Videos */}
          <TabsContent value="videos" className="mt-0">
            {videosLoading && !videos ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading product videos…
              </div>
            ) : (videos ?? []).length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No videos found for this product yet — EchoTik may not have crawled it.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {(videos ?? []).map((v) => (
                  <VideoCard
                    key={v.videoId}
                    v={v}
                    playing={playingId === v.videoId}
                    onPlay={() => setPlayingId(playingId === v.videoId ? null : v.videoId)}
                  />
                ))}
              </div>
            )}
            {videos && promoteCount > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="font-semibold text-orange-600">Promote</span> = the creator paid TikTok to boost
                this video. Count: {promoteCount} of {videos.length}.
              </p>
            )}
          </TabsContent>

          {/* Creators */}
          <TabsContent value="creators" className="mt-0">
            {creatorsLoading && !creators ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading creators…
              </div>
            ) : (creators ?? []).length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No creator data yet — hit refresh once source credentials are set.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(creators ?? []).map((c) => (
                  <div key={c.id ?? c.name} className="flex items-center gap-3 rounded-md border bg-background p-2.5">
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
                        {c.followers != null ? `${compactNum(c.followers)} followers` : "—"}
                        {c.engagementRate != null && ` · ${(c.engagementRate * 100).toFixed(1)}% eng`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.videoCount != null ? `${c.videoCount} videos` : "—"}
                        {c.salesForProduct != null && ` · ${compactNum(c.salesForProduct)} sales`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <LowEngagementFlag rate={c.engagementRate} />
                      {c.rating != null && <Badge className="bg-slate-100 text-slate-700">★ {c.rating}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Brand / seller products */}
          <TabsContent value="brand" className="mt-0">
            {!analytics && analyticsLoading ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading product info…
              </div>
            ) : analytics && !analytics.sellerId ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No seller/brand info for this product.
              </p>
            ) : sellerLoading && !sellerProducts ? (
              <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading brand products…
              </div>
            ) : (sellerProducts ?? []).length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                This seller has no other products indexed yet.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">
                  Other products from this seller — click any to open it here.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {(sellerProducts ?? []).map((p) => (
                    <button
                      key={p.sourceProductId}
                      type="button"
                      onClick={() => openSellerProduct(p)}
                      className="group overflow-hidden rounded-lg border bg-background text-left transition-colors hover:border-primary/50"
                    >
                      <div className="relative aspect-square w-full bg-muted">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        {p.isHot && <span className="absolute right-1 top-1 text-sm">🔥</span>}
                      </div>
                      <div className="space-y-1 p-2.5">
                        <p className="line-clamp-2 text-xs font-medium group-hover:text-primary">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.priceMin != null ? `$${p.priceMin}` : "—"}
                          {p.priceMax && p.priceMax !== p.priceMin ? `–$${p.priceMax}` : ""}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {compactNum(p.sales30d)} sales · ${compactNum(p.gmv30d)} GMV
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function ProductDetailDialog({
  open,
  onOpenChange,
  product,
  workspaceId,
  initialAnalytics,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: DetailProduct | null;
  workspaceId: string;
  initialAnalytics?: MarketAnalyticsRow | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {product && (
        <DialogContent className="flex max-h-[90vh] w-full max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
          <ProductDetailBody
            key={product.sourceProductId}
            product={product}
            workspaceId={workspaceId}
            initialAnalytics={initialAnalytics ?? null}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function MarketTab({
  workspaceId,
  formulas,
  onAdopted,
  onGenerate,
}: {
  workspaceId: string;
  formulas: Formula[];
  onAdopted: () => void;
  onGenerate?: (productIds: string[]) => void;
}) {
  const [source, setSource] = useState("echotik");
  const [period, setPeriod] = useState("week");
  const [sort, setSort] = useState("rank");
  const [recentDays, setRecentDays] = useState<number | null>(null); // "last N days" window on stored list
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
  const [savedSellers, setSavedSellers] = useState<SavedSellerRow[]>([]);
  const [savedSellerKeys, setSavedSellerKeys] = useState<Set<string>>(new Set());
  const [savingSeller, setSavingSeller] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<{
    product: DetailProduct;
    analytics: MarketAnalyticsRow | null;
  } | null>(null);
  // ── Products Library filters (EchoTik product/list surface) ──
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [analyticsFor, setAnalyticsFor] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, MarketAnalyticsRow>>({});
  const [analyticsLoading, setAnalyticsLoading] = useState<string | null>(null);
  // ── Global search (products / influencers / shops / videos) ──
  const [searchType, setSearchType] = useState<"product" | "influencer" | "shop" | "video">("product");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<Record<string, unknown>> | null
  >(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  // ── Influencer / shop drill-down results (products they promote) ──
  const [drillResults, setDrillResults] = useState<Record<string, MarketRow[]>>({});
  const [drillLoading, setDrillLoading] = useState<string | null>(null);
  // ── "Last N days" recency extract (what a creator is pushing right now) ──
  const [recentFor, setRecentFor] = useState<string | null>(null); // drill key
  const [recentRows, setRecentRows] = useState<MarketRow[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentSelected, setRecentSelected] = useState<string[]>([]); // sourceProductIds
  const [recentNotice, setRecentNotice] = useState<string | null>(null);
  const [bulkAdopting, setBulkAdopting] = useState(false);
  const [recentAdoptedIds, setRecentAdoptedIds] = useState<string[]>([]); // DB product ids just added
  // ── Top Creators leaderboard ("who's moving volume") ──
  const [topCreators, setTopCreators] = useState<Array<Record<string, unknown>>>([]);
  const [topCreatorsLoading, setTopCreatorsLoading] = useState(false);
  const [topCreatorsPeriod, setTopCreatorsPeriod] = useState<"day" | "week" | "month">("day");
  const [topCreatorsRole, setTopCreatorsRole] = useState<"all" | "creator" | "seller">("all");
  const [topCreatorsNotice, setTopCreatorsNotice] = useState<string | null>(null);
  // ── Drill gallery (larger view) — checkbox select + bulk add ──
  const [drillSelected, setDrillSelected] = useState<Record<string, string[]>>({});
  const [drillBulkAdopting, setDrillBulkAdopting] = useState(false);
  const [drillWhiteBgOnly, setDrillWhiteBgOnly] = useState(false);
  const [drillAdoptedIds, setDrillAdoptedIds] = useState<string[]>([]);
  // ── Drill sort (server-side: the EchoTik API sorts, we paginate) ──
  const [drillSort, setDrillSort] = useState<"default" | "sales" | "gmv" | "videos" | "price">("default");
  // ── Drill filter bar (per-drill server + client filters) ──
  const [drillFilters, setDrillFilters] = useState<Record<string, DrillFilterState>>({});
  const [drillMeta, setDrillMeta] = useState<Record<string, DrillMeta>>({});
  const [drillCategories, setDrillCategories] = useState<Record<string, DrillCategory[]>>({});
  const [drillLoadingMore, setDrillLoadingMore] = useState<string | null>(null);
  const [drillExporting, setDrillExporting] = useState<string | null>(null);
  // keyword draft per drill (applied to the server on debounce/Enter)
  const drillKeywordDraftRef = useRef<Record<string, string>>({});
  const drillKeywordTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // ── Batch quick-create (scene pick + videos per product) ──
  const [drillSceneFormulaId, setDrillSceneFormulaId] = useState("");
  const [drillVideosPerProduct, setDrillVideosPerProduct] = useState(1);
  const [drillBatchCreating, setDrillBatchCreating] = useState(false);

  const setFilter = (key: string, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const clearFilters = () => {
    setFilters({});
    setShowFilters(false);
  };

  const activeFilterCount = Object.values(filters).filter((v) => v !== "").length;

  const loadStored = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const params = new URLSearchParams({
        workspaceId,
        source,
        period,
        sort,
        limit: "50",
      });
      if (recentDays) params.set("days", String(recentDays));
      const res = await fetch(`/api/market/products?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load market data");
      setRows(data.rows ?? []);
      if (data.notice) setNotice(data.notice);
      if (data.filtered) setNotice("Filtered live search — results are not stored as snapshots.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load market data");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, source, period, sort, recentDays]);

  const refreshMarket = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const params = new URLSearchParams({ workspaceId, source, period, sort, limit: "20", refresh: "1" });
      for (const [k, v] of Object.entries(filters)) {
        if (v === "") continue;
        // commission stored as % in the UI, sent as fraction to the API.
        params.set(k, k.startsWith("commission") ? String(Number(v) / 100) : v);
      }
      const res = await fetch(`/api/market/products?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to refresh market data");
      setRows(data.rows ?? []);
      if (data.notice) setNotice(data.notice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh market data");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, source, period, sort, filters]);

  useEffect(() => {
    void loadStored();
  }, [loadStored]);

  const runSearch = useCallback(
    async (type: "product" | "influencer" | "shop" | "video", keyword: string) => {
      const kw = keyword.trim();
      if (!kw) return;
      setSearching(true);
      setSearchNotice(null);
      try {
        const params = new URLSearchParams({ workspaceId, type, keyword: kw, limit: "20" });
        const res = await fetch(`/api/market/search?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Search failed");
        setSearchResults(data.rows ?? []);
        setSearchType(type);
        if (data.notice) setSearchNotice(data.notice);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Search failed");
      } finally {
        setSearching(false);
      }
    },
    [workspaceId]
  );

  /** Normalize a live EchoTik product row (API JSON) → UI MarketRow. */
  const mapLiveRow = (p: Record<string, unknown>, i: number): MarketRow => ({
    id: undefined,
    source: "echotik" as const,
    sourceProductId: String(p.sourceProductId ?? ""),
    name: String(p.name ?? "Untitled"),
    imageUrl: p.imageUrl ? String(p.imageUrl) : null,
    priceMin: p.priceMin != null ? Number(p.priceMin) : null,
    priceMax: p.priceMax != null ? Number(p.priceMax) : null,
    currency: "USD",
    categoryL1: p.categoryL1 ? String(p.categoryL1) : null,
    rank: p.rank != null ? Number(p.rank) : i + 1,
    rankPeriod: "day",
    sales7d: p.sales7d != null ? Number(p.sales7d) : null,
    sales30d: p.sales30d != null ? Number(p.sales30d) : null,
    gmv30d: p.gmv30d != null ? Number(p.gmv30d) : null,
    growthRate: p.growthRate != null ? Number(p.growthRate) : null,
    commissionRate: p.commissionRate != null ? Number(p.commissionRate) : null,
    videoCount: p.videoCount != null ? Number(p.videoCount) : null,
    creatorCount: p.creatorCount != null ? Number(p.creatorCount) : null,
    isHot: Boolean(p.isHot),
    momentumScore: p.momentumScore != null ? Number(p.momentumScore) : null,
    productId: p.productId ? String(p.productId) : null,
    metadata: (p.metadata as Record<string, unknown> | undefined) ?? undefined,
  });

  /** EchoTik's "paid feature on a visitor session" errors — surface friendly, not a raw toast. */
  const isEchoTikPlanGate = (msg: string) =>
    /401|100004|Unauthorized user|plan is Visitor|member plan/.test(msg);

  /** "What are they pushing right now": last 14 days of products from their videos. */
  const pullRecent = async (kind: "influencer", id: string, key: string) => {
    if (recentFor === key) {
      setRecentFor(null);
      setRecentRows([]);
      setRecentSelected([]);
      return;
    }
    setRecentLoading(true);
    setRecentNotice(null);
    setRecentAdoptedIds([]);
    try {
      const url =
        kind === "influencer"
          ? `/api/market/products/influencer-products?workspaceId=${workspaceId}&influencerId=${id}&days=14`
          : "";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load recent products");
      setRecentFor(key);
      setRecentRows((data.products ?? []).map(mapLiveRow));
      setRecentSelected([]);
      if (data.notice) setRecentNotice(data.notice);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load recent products";
      if (isEchoTikPlanGate(msg)) {
        setRecentNotice(
          "EchoTik plan gate: recent-video products need a paid logged-in EchoTik session (Visitor tier can't)."
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setRecentLoading(false);
    }
  };

  const toggleRecent = (sourceProductId: string) =>
    setRecentSelected((prev) =>
      prev.includes(sourceProductId) ? prev.filter((s) => s !== sourceProductId) : [...prev, sourceProductId]
    );

  const selectAllRecent = () => setRecentSelected(recentRows.map((r) => r.sourceProductId));

  /** Bulk-adopt every checked recent product, then hand the new DB ids to the
   *  batch pipeline ("generate videos for these"). */
  const bulkAddRecent = async () => {
    const selected = recentRows.filter((r) => recentSelected.includes(r.sourceProductId));
    if (selected.length === 0) return;
    setBulkAdopting(true);
    try {
      const res = await fetch(`/api/market/products/bulk-adopt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, rows: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk adopt failed");
      const addedIds: string[] = (data.results ?? [])
        .filter((r: { alreadyAdopted?: boolean; productId?: string | null }) => !r.alreadyAdopted && r.productId)
        .map((r: { productId: string }) => r.productId);
      setRecentAdoptedIds(addedIds);
      toast.success(`Added ${data.added} · already in library ${data.already}${data.failed ? ` · ${data.failed} failed` : ""}`);
      onAdopted();
      await loadStored();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk adopt failed");
    } finally {
      setBulkAdopting(false);
    }
  };

  /** Top Creators leaderboard — 1 cached request per (period, role) combo. */
  const loadTopCreators = useCallback(async () => {
    setTopCreatorsLoading(true);
    setTopCreatorsNotice(null);
    try {
      const params = new URLSearchParams({ workspaceId, period: topCreatorsPeriod, role: topCreatorsRole, limit: "50" });
      const res = await fetch(`/api/market/creators/top?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Failed to load top creators";
        // Paid-plan gate (weekly/monthly boards) → friendly inline notice, not a toast.
        if (/member plan|Visitor|quota/i.test(msg)) {
          setTopCreators([]);
          setTopCreatorsNotice("Weekly/Monthly boards need the EchoTik plan your cookie is logged into — showing what's available.");
          return;
        }
        throw new Error(msg);
      }
      setTopCreators(data.creators ?? []);
      if (data.notice) setTopCreatorsNotice(data.notice);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load top creators");
    } finally {
      setTopCreatorsLoading(false);
    }
  }, [workspaceId, topCreatorsPeriod, topCreatorsRole]);

  // Auto-load on mount; reload when period/role changes.
  useEffect(() => {
    void loadTopCreators();
  }, [loadTopCreators]);

  const toggleDrillSelect = (key: string, sourceProductId: string) =>
    setDrillSelected((prev) => {
      const cur = prev[key] ?? [];
      return {
        ...prev,
        [key]: cur.includes(sourceProductId) ? cur.filter((s) => s !== sourceProductId) : [...cur, sourceProductId],
      };
    });

  const selectAllDrill = (key: string, rows: MarketRow[]) =>
    setDrillSelected((prev) => ({ ...prev, [key]: rows.map((r) => r.sourceProductId) }));

  const clearDrill = (key: string) => setDrillSelected((prev) => ({ ...prev, [key]: [] }));

  /** Bulk-add the checked drill products (larger-view gallery). */
  const bulkAddDrill = async (key: string) => {
    const rows = drillResults[key] ?? [];
    const selected = rows.filter((r) => (drillSelected[key] ?? []).includes(r.sourceProductId));
    if (selected.length === 0) return;
    setDrillBulkAdopting(true);
    setDrillAdoptedIds([]);
    try {
      const res = await fetch(`/api/market/products/bulk-adopt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, rows: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bulk adopt failed");
      const addedIds: string[] = (data.results ?? [])
        .filter((r: { alreadyAdopted?: boolean; productId?: string | null }) => !r.alreadyAdopted && r.productId)
        .map((r: { productId: string }) => r.productId);
      setDrillAdoptedIds(addedIds);
      toast.success(`Added ${data.added} · already in library ${data.already}${data.failed ? ` · ${data.failed} failed` : ""}`);
      onAdopted();
      await loadStored();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk adopt failed");
    } finally {
      setDrillBulkAdopting(false);
    }
  };

  /** Create the batch straight from the added products: scene (formula) + videos-per-product. */
  const createBatchFromDrill = async () => {
    const ids = drillAdoptedIds;
    if (ids.length === 0) return;
    const formulaId = drillSceneFormulaId || formulas.find((f) => f.scenePromptTemplate)?.id || "";
    if (!formulaId) {
      toast.error("Pick a scene (formula) first — none found. Create one in the Formulas tab.");
      return;
    }
    const count = drillVideosPerProduct;
    setDrillBatchCreating(true);
    try {
      const res = await fetch(`/api/batches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: `Top creators — ${new Date().toISOString().slice(0, 10)} (${ids.length}×${count})`,
          formulaId,
          productIds: ids,
          videosPerProduct: count,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Batch create failed");
      toast.success(`Batch created — ${data.totalCount ?? ids.length * count} videos queued`);
      setDrillAdoptedIds([]); // consumed
      onGenerate?.(ids); // jump to Batches with products still preselected
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Batch create failed");
    } finally {
      setDrillBatchCreating(false);
    }
  };

  /**
   * Ordering for the drill gallery. Influencer drills are server-sorted
   * (drillSort → order=…); the "new" tab re-sorts client-side by create_time.
   * Shop drills keep the old client-side GMV-first default.
   */
  const sortDrillRows = (key: string, rows: MarketRow[]): MarketRow[] => {
    if (key.startsWith("influencer:")) return rows; // server already sorted
    return [...rows].sort((a, b) => (b.gmv30d ?? 0) - (a.gmv30d ?? 0));
  };

  /** create_time from the raw row (YYYY-MM-DD HH:MM:SS, string-comparable). */
  const drillCreatedAt = (p: MarketRow): string =>
    String((p.metadata as Record<string, unknown> | undefined)?.createdAt ?? "");

  /** Client-side filters (price band, date band, "new" tab) over loaded rows. */
  const applyDrillFilters = (key: string, rows: MarketRow[]): MarketRow[] => {
    const f = drillFilters[key] ?? DRILL_DEFAULT_FILTER;
    let out = rows;
    if (f.priceMin) {
      const lo = Number(f.priceMin);
      out = out.filter((p) => (p.priceMin ?? p.priceMax ?? 0) >= lo);
    }
    if (f.priceMax) {
      const hi = Number(f.priceMax);
      out = out.filter((p) => (p.priceMin ?? p.priceMax ?? 0) <= hi);
    }
    if (f.dateFrom) out = out.filter((p) => drillCreatedAt(p) >= f.dateFrom);
    if (f.dateTo) out = out.filter((p) => drillCreatedAt(p) <= `${f.dateTo} 23:59:59`);
    if (f.tab === "new") {
      out = [...out].sort((a, b) => drillCreatedAt(b).localeCompare(drillCreatedAt(a)));
    }
    return out;
  };

  /** Fetch one page of an influencer drill with the current filter state. */
  const fetchDrillPage = async (
    key: string,
    page: number,
    append: boolean,
    filterOverride?: DrillFilterState
  ) => {
    const [, id] = key.split(":");
    // React state is async — callers pass the just-computed filter explicitly
    // so this never reads the stale pre-change value from the closure.
    const f = filterOverride ?? drillFilters[key] ?? DRILL_DEFAULT_FILTER;
    const url =
      `/api/market/products/influencer-products?workspaceId=${workspaceId}&influencerId=${id}` +
      `&page=${page}&perPage=24&order=${DRILL_ORDER_KEYS[drillSort] ?? ""}&sort=desc` +
      (f.tab === "top" ? "&order=total_sale_cnt" : "") +
      (f.categoryId ? `&categories=${encodeURIComponent(f.categoryId)}` : "") +
      (f.keyword ? `&keyword=${encodeURIComponent(f.keyword.trim())}` : "");
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load products");
    const rows: MarketRow[] = (data.products ?? []).map(mapLiveRow);
    setDrillResults((prev) =>
      append ? { ...prev, [key]: [...(prev[key] ?? []), ...rows] } : { ...prev, [key]: rows }
    );
    setDrillMeta((prev) => ({
      ...prev,
      [key]: {
        page: Number(data.page ?? page),
        perPage: Number(data.perPage ?? 24),
        total: Number(data.total ?? rows.length),
        lastPage: Number(data.lastPage ?? page),
      },
    }));
    if (data.notice) setSearchNotice(data.notice);
  };

  /** Open/close an influencer/shop drill (toggle). */
  const drillProducts = async (kind: "influencer" | "shop", id: string) => {
    const key = `${kind}:${id}`;
    if (drillResults[key]) {
      setDrillResults((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    setDrillLoading(key);
    try {
      if (kind === "influencer") {
        setDrillFilters((prev) => ({ ...prev, [key]: { ...DRILL_DEFAULT_FILTER } }));
        setDrillMeta((prev) => ({ ...prev, [key]: { page: 1, perPage: 24, total: 0, lastPage: 1 } }));
        // categories once per drill (cached server-side 6h)
        fetch(`/api/market/products/influencer-filters?workspaceId=${workspaceId}&influencerId=${id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setDrillCategories((prev) => ({ ...prev, [key]: d.categories ?? [] })))
          .catch(() => {});
        await fetchDrillPage(key, 1, false);
      } else {
        const url = `/api/market/products/seller-products?workspaceId=${workspaceId}&sellerId=${id}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load products");
        const rows: MarketRow[] = (data.products ?? []).map(mapLiveRow);
        setDrillResults((prev) => ({ ...prev, [key]: rows }));
        if (data.notice) setSearchNotice(data.notice);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load products";
      if (isEchoTikPlanGate(msg)) {
        setSearchNotice(
          "EchoTik plan gate: this session can't view creator product lists (Visitor tier). " +
            "Re-export the cookie from a paid, logged-in EchoTik browser — see Settings → Market."
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setDrillLoading(null);
    }
  };

  /** Server-side filter change (category/keyword/tab-top/sort) → reload page 1. */
  const setDrillServerFilter = (key: string, patch: Partial<DrillFilterState>) => {
    const next = { ...(drillFilters[key] ?? DRILL_DEFAULT_FILTER), ...patch };
    setDrillFilters((prev) => ({ ...prev, [key]: next }));
    void fetchDrillPage(key, 1, false, next).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Filter failed")
    );
  };

  const commitDrillKeyword = (key: string) => {
    const kw = (drillKeywordDraftRef.current[key] ?? "").trim();
    const next = { ...(drillFilters[key] ?? DRILL_DEFAULT_FILTER), keyword: kw };
    setDrillFilters((prev) => ({ ...prev, [key]: next }));
    void fetchDrillPage(key, 1, false, next).catch(() => {});
  };

  /** Sort change applies to every open influencer drill. */
  const changeDrillSort = (next: "default" | "sales" | "gmv" | "videos" | "price") => {
    setDrillSort(next);
    for (const key of Object.keys(drillResults)) {
      if (key.startsWith("influencer:")) {
        void fetchDrillPage(key, 1, false).catch(() => {});
      }
    }
  };

  /** Append the next page (load more). */
  const loadMoreDrill = async (key: string) => {
    const meta = drillMeta[key];
    if (!meta || drillLoadingMore === key) return;
    setDrillLoadingMore(key);
    try {
      await fetchDrillPage(key, meta.page + 1, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Load more failed");
    } finally {
      setDrillLoadingMore(null);
    }
  };

  /** ZIP download: selected rows if any are checked, else all visible rows. */
  const downloadDrillZip = async (key: string) => {
    setDrillExporting(key);
    try {
      const visible = applyDrillFilters(key, sortDrillRows(key, drillResults[key] ?? []));
      const sel = drillSelected[key] ?? [];
      const pick = sel.length
        ? visible.filter((p) => sel.includes(p.sourceProductId))
        : visible;
      const urls = pick
        .map((p) => p.imageUrl)
        .filter((u): u is string => !!u)
        .slice(0, 100);
      if (urls.length === 0) {
        toast.error("No product images to download");
        return;
      }
      const res = await fetch("/api/market/products/export-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls,
          productIds: pick.slice(0, 100).map((p) => p.sourceProductId),
          influencerId: key.startsWith("influencer:") ? key.slice("influencer:".length) : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Export failed");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `products-${key.replace(":", "-")}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Downloaded ${pick.length} image${pick.length === 1 ? "" : "s"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDrillExporting(null);
    }
  };

  /** CSV of the currently visible (filtered) rows. */
  const exportDrillCsv = (key: string) => {
    const visible = applyDrillFilters(key, sortDrillRows(key, drillResults[key] ?? []));
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Product", "Price", "Sales", "GMV", "Commission", "Category", "Created", "Image URL"];
    const lines = visible.map((p) =>
      [
        esc(p.name),
        esc(p.priceMin ?? ""),
        esc(p.sales30d ?? ""),
        esc(p.gmv30d ?? ""),
        esc(p.commissionRate != null ? `${(p.commissionRate * 100).toFixed(0)}%` : ""),
        esc(p.categoryL1 ?? ""),
        esc(drillCreatedAt(p)),
        esc(p.imageUrl ?? ""),
      ].join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `products-${key.replace(":", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

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

  const loadSavedSellers = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/bookmarks?workspaceId=${workspaceId}`);
      if (!res.ok) return;
      const data = await res.json();
      const rows = (data.rows ?? []) as SavedSellerRow[];
      setSavedSellers(rows);
      setSavedSellerKeys(new Set(rows.map((b) => `${b.kind}:${b.source}:${b.sourceId}`)));
    } catch {
      /* non-fatal */
    }
  }, [workspaceId]);

  useEffect(() => {
    loadWatched();
    loadSavedSellers();
  }, [loadWatched, loadSavedSellers]);

  const openDetail = (row: MarketRow) =>
    setDetailFor({
      product: {
        source: row.source,
        sourceProductId: row.sourceProductId,
        name: row.name,
        imageUrl: row.imageUrl,
        priceMin: row.priceMin,
        priceMax: row.priceMax,
        currency: row.currency,
        categoryL1: row.categoryL1,
      },
      analytics: analytics[row.id ?? `live:${row.sourceProductId}`] ?? null,
    });

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

  const toggleSaveSeller = async (kind: "influencer" | "shop", source: string, sourceId: string, name: string, avatarUrl: string | null, category: string | null, followers: number | null) => {
    if (!sourceId) return;
    const key = `${kind}:${source}:${sourceId}`;
    const isSaved = savedSellerKeys.has(key);
    setSavingSeller(key);
    try {
      if (isSaved) {
        const res = await fetch(
          `/api/market/bookmarks?workspaceId=${workspaceId}&kind=${kind}&source=${source}&sourceId=${encodeURIComponent(sourceId)}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error("Failed to remove bookmark");
      } else {
        const res = await fetch(`/api/market/bookmarks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, kind, source, sourceId, name, avatarUrl, category, followers }),
        });
        if (!res.ok) throw new Error("Failed to bookmark");
      }
      toast.success(isSaved ? `Removed "${name}" from saved sellers` : `Saved "${name}" — tap it anytime to re-open their products`);
      await loadSavedSellers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bookmark error");
    } finally {
      setSavingSeller(null);
    }
  };

  const adopt = async (row: MarketRow) => {
    setAdopting(row.id ?? row.sourceProductId);
    try {
      const res = row.id
        ? await fetch(`/api/market/products/${row.id}/adopt`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceId }),
          })
        : await fetch(`/api/market/products/adopt`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceId, row }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to adopt");
      toast.success(`"${data.product.name}" added to Products`);
      onAdopted();
      await loadStored();
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

  const toggleAnalytics = async (row: MarketRow) => {
    const key = row.id ?? `live:${row.sourceProductId}`;
    if (analyticsFor === key) {
      setAnalyticsFor(null);
      return;
    }
    setAnalyticsFor(key);
    setAnalyticsLoading(key);
    try {
      const url = row.id
        ? `/api/market/products/${row.id}/analytics?workspaceId=${workspaceId}`
        : `/api/market/products/analytics?workspaceId=${workspaceId}&source=${row.source}&sourceProductId=${row.sourceProductId}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load analytics");
      setAnalytics((prev) => ({ ...prev, [key]: data.analytics }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load analytics");
      setAnalyticsFor(null);
    } finally {
      setAnalyticsLoading(null);
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
        <Button
          size="sm"
          variant={recentDays === 7 ? "default" : "outline"}
          onClick={() => {
            setRecentDays(recentDays === 7 ? null : 7);
            setView("discover");
          }}
          title="Only show products with a snapshot in the last 7 days"
        >
          <Clock className="h-4 w-4" /> Last 7 days
        </Button>
        <Button size="sm" variant={view === "watched" ? "default" : "outline"} onClick={() => setView(view === "watched" ? "discover" : "watched")}>
          <Star className="h-4 w-4" /> Watched ({watched.length})
        </Button>
        <Button
          size="sm"
          variant={showFilters || activeFilterCount > 0 ? "default" : "outline"}
          onClick={() => setShowFilters((v) => !v)}
          className="gap-1"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void refreshMarket()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
          {loading ? "Fetching…" : "Refresh"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {activeFilterCount > 0
            ? "Products Library — filtered live search (not stored)."
            : `Winning products — who climbed fastest this ${period}.`}
        </span>
      </div>

      {/* ── Global search: products / influencers / shops / videos ── */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-1">
            {(["product", "influencer", "shop", "video"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSearchType(t)}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition ${
                  searchType === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "product" ? "Products" : t === "influencer" ? "Influencers" : t === "shop" ? "Shops" : "Videos"}
              </button>
            ))}
          </div>
          <input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void runSearch(searchType, searchKeyword)}
            placeholder={
              searchType === "influencer"
                ? "Enter nickname, TikTok ID, email or video hashtag…"
                : searchType === "shop"
                  ? "Search shops / sellers…"
                  : searchType === "video"
                    ? "Search videos by keyword…"
                    : "Search products by name or keyword…"
            }
            className="h-9 min-w-[240px] flex-1 rounded-md border bg-background px-3 text-sm"
          />
          <Button size="sm" onClick={() => void runSearch(searchType, searchKeyword)} disabled={searching || !searchKeyword.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
          {searchResults && (
            <Button size="sm" variant="ghost" onClick={() => { setSearchResults(null); setSearchNotice(null); setDrillResults({}); }}>
              Clear results
            </Button>
          )}
        </div>
      </Card>

      {searchNotice && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {searchNotice}
        </p>
      )}

      {savedSellers.length > 0 && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Bookmark className="h-3.5 w-3.5" /> Saved sellers
            </span>
            {savedSellers.map((b) => {
              const bkey = `${b.kind}:${b.source}:${b.sourceId}`;
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-1.5 pr-1.5 text-xs"
                >
                  {b.avatarUrl ? (
                    <img src={b.avatarUrl} alt="" className="h-5 w-5 rounded-full border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border bg-background">
                      {b.kind === "influencer" ? <User className="h-3 w-3 text-muted-foreground" /> : <Store className="h-3 w-3 text-muted-foreground" />}
                    </div>
                  )}
                  <button
                    className="max-w-[140px] truncate font-medium hover:underline"
                    title={`${b.name} — open their products`}
                    onClick={() => {
                      setSearchType(b.kind === "influencer" ? "influencer" : "shop");
                      setSearchKeyword(b.name);
                      void drillProducts(b.kind, b.sourceId);
                    }}
                  >
                    {b.name}
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5"
                    title="Remove bookmark"
                    disabled={savingSeller === bkey}
                    onClick={() => void toggleSaveSeller(b.kind, b.source, b.sourceId, b.name, b.avatarUrl, b.category, b.followers)}
                  >
                    {savingSeller === bkey ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {searchResults && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">{searchType === "product" ? "Product" : searchType === "influencer" ? "Influencer" : searchType === "shop" ? "Shop" : "Video"}</th>
                    {searchType === "influencer" && (
                      <>
                        <th className="px-3 py-2">Followers</th>
                        <th className="px-3 py-2">GMV</th>
                        <th className="px-3 py-2">Sales</th>
                        <th className="px-3 py-2">Videos</th>
                      </>
                    )}
                    {searchType === "shop" && (
                      <>
                        <th className="px-3 py-2">Followers</th>
                        <th className="px-3 py-2">Products</th>
                        <th className="px-3 py-2">GMV</th>
                        <th className="px-3 py-2">Sales</th>
                      </>
                    )}
                    {searchType === "video" && (
                      <>
                        <th className="px-3 py-2">Creator</th>
                        <th className="px-3 py-2">Views</th>
                        <th className="px-3 py-2">Sales</th>
                        <th className="px-3 py-2">GMV</th>
                      </>
                    )}
                    {searchType === "product" && (
                      <>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">Comm</th>
                        <th className="px-3 py-2">Sales 30d</th>
                        <th className="px-3 py-2">GMV 30d</th>
                      </>
                    )}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((r, i) => {
                    if (searchType === "influencer") {
                      const key = `influencer:${String(r.sourceCreatorId ?? "")}`;
                      return (
                        <tr key={String(r.sourceCreatorId ?? i)} className="border-b last:border-0">
                          <td className="max-w-[300px] px-3 py-2">
                            <div className="flex items-center gap-2">
                              {r.avatarUrl ? (
                                <img src={String(r.avatarUrl)} alt="" className="h-9 w-9 rounded-full border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-full border bg-muted">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate font-medium">@{String(r.name ?? "")}</p>
                                  <LowEngagementFlag rate={r.engagementRate != null ? Number(r.engagementRate) : null} />
                                </div>
                                {r.category ? <p className="truncate text-xs text-muted-foreground">{String(r.category)}</p> : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmt(r.followers != null ? Number(r.followers) : null)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{money(r.gmv != null ? Number(r.gmv) : null)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmt(r.sales != null ? Number(r.sales) : null)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmt(r.videoCount != null ? Number(r.videoCount) : null)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Button size="sm" variant="outline" disabled={drillLoading === key} onClick={() => void drillProducts("influencer", String(r.sourceCreatorId ?? ""))}>
                                {drillLoading === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                                Products
                              </Button>
                              {(() => {
                                const bkey = `influencer:echotik:${String(r.sourceCreatorId ?? "")}`;
                                const saved = savedSellerKeys.has(bkey);
                                return (
                                  <Button
                                    size="sm"
                                    variant={saved ? "default" : "outline"}
                                    disabled={savingSeller === bkey || !r.sourceCreatorId}
                                    onClick={() =>
                                      void toggleSaveSeller(
                                        "influencer",
                                        "echotik",
                                        String(r.sourceCreatorId ?? ""),
                                        String(r.name ?? "Unknown"),
                                        r.avatarUrl ? String(r.avatarUrl) : null,
                                        r.category ? String(r.category) : null,
                                        r.followers != null ? Number(r.followers) : null
                                      )
                                    }
                                    title={saved ? "Unbookmark seller" : "Bookmark seller"}
                                  >
                                    {savingSeller === bkey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                                  </Button>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    if (searchType === "shop") {
                      const key = `shop:${String(r.sourceSellerId ?? "")}`;
                      return (
                        <tr key={String(r.sourceSellerId ?? i)} className="border-b last:border-0">
                          <td className="max-w-[300px] px-3 py-2">
                            <div className="flex items-center gap-2">
                              {r.coverUrl ? (
                                <img src={String(r.coverUrl)} alt="" className="h-9 w-9 rounded-md border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                                  <Store className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-medium">{String(r.name)}</p>
                                {r.category ? <p className="truncate text-xs text-muted-foreground">{String(r.category)}</p> : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmt(r.followers != null ? Number(r.followers) : null)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmt(r.productCount != null ? Number(r.productCount) : null)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{money(r.gmv != null ? Number(r.gmv) : null)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmt(r.sales != null ? Number(r.sales) : null)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <Button size="sm" variant="outline" disabled={drillLoading === key} onClick={() => void drillProducts("shop", String(r.sourceSellerId ?? ""))}>
                                {drillLoading === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                                Products
                              </Button>
                              {(() => {
                                const bkey = `shop:echotik:${String(r.sourceSellerId ?? "")}`;
                                const saved = savedSellerKeys.has(bkey);
                                return (
                                  <Button
                                    size="sm"
                                    variant={saved ? "default" : "outline"}
                                    disabled={savingSeller === bkey || !r.sourceSellerId}
                                    onClick={() =>
                                      void toggleSaveSeller(
                                        "shop",
                                        "echotik",
                                        String(r.sourceSellerId ?? ""),
                                        String(r.name ?? "Unknown"),
                                        r.coverUrl ? String(r.coverUrl) : null,
                                        r.category ? String(r.category) : null,
                                        r.followers != null ? Number(r.followers) : null
                                      )
                                    }
                                    title={saved ? "Unbookmark seller" : "Bookmark seller"}
                                  >
                                    {savingSeller === bkey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                                  </Button>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    if (searchType === "video") {
                      const isAd = Boolean(r.isAd);
                      return (
                        <tr key={String(r.videoId ?? i)} className="border-b last:border-0">
                          <td className="max-w-[340px] px-3 py-2">
                            <div className="flex items-center gap-2">
                              {r.coverUrl ? (
                                <img src={String(r.coverUrl)} alt="" className="h-9 w-9 rounded-md border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                                  <Play className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-medium">{String(r.description ?? r.videoId ?? "")}</p>
                                <div className="flex items-center gap-1.5">
                                  {isAd && (
                                    <Badge className="bg-purple-100 text-purple-700">
                                      <Megaphone className="h-3 w-3" /> Promote
                                    </Badge>
                                  )}
                                  {r.isAi === true && <Badge className="bg-slate-100 text-slate-600">AI</Badge>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs">@{String(r.creatorName ?? "—")}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmt(r.views != null ? Number(r.views) : null)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{fmt(r.sales != null ? Number(r.sales) : null)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{money(r.gmv != null ? Number(r.gmv) : null)}</td>
                          <td className="px-3 py-2">
                            <Button size="sm" variant="outline" onClick={() => window.open(`https://www.tiktok.com/@${String(r.creatorName ?? "")}/video/${String(r.videoId ?? "")}`, "_blank")}>
                              <Play className="h-3.5 w-3.5" /> Watch
                            </Button>
                          </td>
                        </tr>
                      );
                    }
                    // product search result
                    const key = `search-product:${String(r.sourceProductId ?? i)}`;
                    return (
                      <tr key={key} className="border-b last:border-0">
                        <td className="max-w-[300px] px-3 py-2">
                          <div className="flex items-center gap-2">
                            {r.imageUrl ? (
                              <img src={String(r.imageUrl)} alt="" className="h-9 w-9 rounded-md border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-muted">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <p className="truncate font-medium">{String(r.name ?? "")}</p>
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.priceMin != null ? `$${Number(r.priceMin)}` : "—"}
                          {r.priceMax != null && Number(r.priceMax) !== Number(r.priceMin) ? `–$${Number(r.priceMax)}` : ""}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{pct(r.commissionRate != null ? Number(r.commissionRate) : null)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmt(r.sales30d != null ? Number(r.sales30d) : null)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{money(r.gmv30d != null ? Number(r.gmv30d) : null)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openDetail({ id: undefined, source: "echotik", sourceProductId: String(r.sourceProductId ?? ""), name: String(r.name ?? ""), imageUrl: r.imageUrl ? String(r.imageUrl) : null, priceMin: r.priceMin != null ? Number(r.priceMin) : null, priceMax: r.priceMax != null ? Number(r.priceMax) : null, currency: "USD", categoryL1: r.categoryL1 ? String(r.categoryL1) : null, rank: null, rankPeriod: "day", sales7d: null, sales30d: r.sales30d != null ? Number(r.sales30d) : null, gmv30d: r.gmv30d != null ? Number(r.gmv30d) : null, growthRate: null, commissionRate: r.commissionRate != null ? Number(r.commissionRate) : null, videoCount: r.videoCount != null ? Number(r.videoCount) : null, creatorCount: r.creatorCount != null ? Number(r.creatorCount) : null, isHot: false, momentumScore: null, productId: null } as MarketRow)}
                              title="Details & videos"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => adopt({ id: undefined, source: "echotik", sourceProductId: String(r.sourceProductId ?? ""), name: String(r.name ?? ""), imageUrl: r.imageUrl ? String(r.imageUrl) : null, priceMin: r.priceMin != null ? Number(r.priceMin) : null, priceMax: r.priceMax != null ? Number(r.priceMax) : null, currency: "USD", categoryL1: r.categoryL1 ? String(r.categoryL1) : null, rank: null, rankPeriod: "day", sales7d: null, sales30d: r.sales30d != null ? Number(r.sales30d) : null, gmv30d: r.gmv30d != null ? Number(r.gmv30d) : null, growthRate: null, commissionRate: r.commissionRate != null ? Number(r.commissionRate) : null, videoCount: r.videoCount != null ? Number(r.videoCount) : null, creatorCount: r.creatorCount != null ? Number(r.creatorCount) : null, isHot: false, momentumScore: null, productId: null } as MarketRow)}
                              disabled={adopting === `search-product:${String(r.sourceProductId ?? "")}`}
                              title="Add to Products"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {searchResults.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No {searchType} results for “{searchKeyword.trim()}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Drill-down products (influencer / shop) */}
            {Object.entries(drillResults).map(([key, prows]) => {
              const isInfluencer = key.startsWith("influencer:");
              const f = drillFilters[key] ?? DRILL_DEFAULT_FILTER;
              const meta = drillMeta[key];
              const cats = drillCategories[key] ?? [];
              const visible = applyDrillFilters(key, sortDrillRows(key, prows));
              const selCount = (drillSelected[key] ?? []).length;
              const totalShown = meta?.total ?? prows.length;
              return (
              <div key={key} className="border-t">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {isInfluencer ? "Influencer's products" : "Shop's products"} ({totalShown}
                    {meta && meta.total > prows.length ? ` · loaded ${prows.length}` : ""})
                    {drillWhiteBgOnly ? " · white bg only" : ""}
                    {f.priceMin || f.priceMax || f.dateFrom || f.dateTo
                      ? ` · showing ${visible.length}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {isInfluencer && (
                      <>
                        <select
                          value={drillSort}
                          onChange={(e) => changeDrillSort(e.target.value as typeof drillSort)}
                          className="h-7 rounded-md border bg-background px-1.5 text-xs"
                          title="Server-side sort (EchoTik API)"
                        >
                          <option value="default">Sort: Default</option>
                          <option value="sales">Sort: Top Sold</option>
                          <option value="gmv">Sort: GMV</option>
                          <option value="videos">Sort: Videos</option>
                          <option value="price">Sort: Price</option>
                        </select>
                        <select
                          value={f.categoryId}
                          onChange={(e) => setDrillServerFilter(key, { categoryId: e.target.value })}
                          className="h-7 max-w-[190px] rounded-md border bg-background px-1.5 text-xs"
                          title="Category (server-side)"
                        >
                          <option value="">All categories</option>
                          {cats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                              {c.count ? ` (${c.count})` : ""}
                            </option>
                          ))}
                        </select>
                        <input
                          defaultValue={f.keyword}
                          placeholder="Search…"
                          onChange={(e) => {
                            drillKeywordDraftRef.current[key] = e.target.value;
                            if (drillKeywordTimerRef.current[key]) clearTimeout(drillKeywordTimerRef.current[key]);
                            drillKeywordTimerRef.current[key] = setTimeout(() => commitDrillKeyword(key), 600);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (drillKeywordTimerRef.current[key]) clearTimeout(drillKeywordTimerRef.current[key]);
                              commitDrillKeyword(key);
                            }
                          }}
                          className="h-7 w-28 rounded-md border bg-background px-1.5 text-xs"
                          title="Search within this creator's products (server-side)"
                        />
                      </>
                    )}
                    {isInfluencer && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setDrillFilters((prev) => ({
                            ...prev,
                            [key]: { ...(prev[key] ?? DRILL_DEFAULT_FILTER), tab: f.tab === "new" ? "all" : "new" },
                          }))
                        }
                        title={f.tab === "new" ? "Back to default order" : "Newest products first (by publish date)"}
                      >
                        {f.tab === "new" ? "✕ New" : "New"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => selectAllDrill(key, visible)}
                      title="Select all visible (filtered) products"
                    >
                      All
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => clearDrill(key)}>
                      None
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => setDrillWhiteBgOnly((v) => !v)}
                      title="Only show photos with a white background (checked in your browser — no API calls)"
                    >
                      <ImageIcon className="h-3 w-3" />
                      WB only
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => exportDrillCsv(key)}
                      title="Download the visible products as CSV"
                    >
                      <Download className="h-3 w-3" />
                      CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={drillExporting === key}
                      onClick={() => void downloadDrillZip(key)}
                      title={selCount ? `Download ${selCount} selected image(s) as ZIP` : "Download all visible images as ZIP (white-bg filter applies)"}
                    >
                      {drillExporting === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <SlidersHorizontal className="h-3 w-3" />}
                      ZIP{selCount ? ` (${selCount})` : ""}
                    </Button>
                    {isInfluencer && (
                      <Button
                        size="sm"
                        variant={recentFor === key ? "secondary" : "outline"}
                        disabled={recentLoading}
                        onClick={() => void pullRecent("influencer", key.slice("influencer:".length), key)}
                        title="What they've pushed in the last 14 days (from their recent videos)"
                      >
                        {recentLoading && recentFor === key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Clock className="h-3.5 w-3.5" />
                        )}
                        {recentFor === key ? "Hide recent" : "Last 14 days"}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void bulkAddDrill(key)} disabled={drillBulkAdopting || selCount === 0}>
                      {drillBulkAdopting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Add {selCount || 0} to Products
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDrillResults((prev) => { const n = { ...prev }; delete n[key]; return n; })}>
                      Close
                    </Button>
                  </div>
                </div>
                {isInfluencer && (
                  <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1">
                    <span className="text-[11px] text-muted-foreground">Price:</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="Min $"
                      value={f.priceMin}
                      onChange={(e) =>
                        setDrillFilters((prev) => ({ ...prev, [key]: { ...(prev[key] ?? DRILL_DEFAULT_FILTER), priceMin: e.target.value } }))
                      }
                      className="h-7 w-20 rounded-md border bg-background px-1.5 text-xs"
                    />
                    <span className="text-[11px] text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="Max $"
                      value={f.priceMax}
                      onChange={(e) =>
                        setDrillFilters((prev) => ({ ...prev, [key]: { ...(prev[key] ?? DRILL_DEFAULT_FILTER), priceMax: e.target.value } }))
                      }
                      className="h-7 w-20 rounded-md border bg-background px-1.5 text-xs"
                    />
                    <span className="ml-1 text-[11px] text-muted-foreground">Created:</span>
                    <input
                      type="date"
                      value={f.dateFrom}
                      onChange={(e) =>
                        setDrillFilters((prev) => ({ ...prev, [key]: { ...(prev[key] ?? DRILL_DEFAULT_FILTER), dateFrom: e.target.value } }))
                      }
                      className="h-7 rounded-md border bg-background px-1.5 text-xs"
                    />
                    <span className="text-[11px] text-muted-foreground">–</span>
                    <input
                      type="date"
                      value={f.dateTo}
                      onChange={(e) =>
                        setDrillFilters((prev) => ({ ...prev, [key]: { ...(prev[key] ?? DRILL_DEFAULT_FILTER), dateTo: e.target.value } }))
                      }
                      className="h-7 rounded-md border bg-background px-1.5 text-xs"
                    />
                  </div>
                )}
                {isInfluencer && (f.priceMin || f.priceMax || f.dateFrom || f.dateTo) && (
                  <div className="flex flex-wrap items-center gap-2 px-3 pb-1">
                    <span className="text-[11px] text-muted-foreground">Client filters:</span>
                    {f.priceMin && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">≥ ${f.priceMin}</span>}
                    {f.priceMax && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">≤ ${f.priceMax}</span>}
                    {f.dateFrom && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">since {f.dateFrom}</span>}
                    {f.dateTo && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">until {f.dateTo}</span>}
                    <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[11px]" onClick={() => setDrillFilters((prev) => ({ ...prev, [key]: { ...(prev[key] ?? DRILL_DEFAULT_FILTER), priceMin: "", priceMax: "", dateFrom: "", dateTo: "" } }))}>
                      <X className="h-3 w-3" /> clear
                    </Button>
                  </div>
                )}
                <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visible.map((p) => (
                    <DrillCard
                      key={p.sourceProductId}
                      p={p}
                      selected={(drillSelected[key] ?? []).includes(p.sourceProductId)}
                      onToggle={() => toggleDrillSelect(key, p.sourceProductId)}
                      whiteBgOnly={drillWhiteBgOnly}
                    />
                  ))}
                </div>
                {isInfluencer && meta && meta.page < meta.lastPage && (
                  <div className="flex items-center justify-center gap-2 px-3 pb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={drillLoadingMore === key}
                      onClick={() => void loadMoreDrill(key)}
                    >
                      {drillLoadingMore === key ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Load more"
                      )}{" "}
                      (page {meta.page}/{meta.lastPage})
                    </Button>
                  </div>
                )}
                {drillAdoptedIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium">{drillAdoptedIds.length} added —</span>
                      <select
                        value={drillSceneFormulaId || ""}
                        onChange={(e) => setDrillSceneFormulaId(e.target.value)}
                        className="h-8 max-w-[220px] rounded-md border bg-background px-2 text-xs"
                        title="Scene (formula) for the batch — render-scene formulas create the image first, then image-to-video"
                      >
                        {formulas.filter((f) => f.scenePromptTemplate).length > 0 ? (
                          <>
                            <option value="">Scene…</option>
                            {formulas.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.scenePromptTemplate ? `🖼 ${f.name}` : f.name}
                              </option>
                            ))}
                          </>
                        ) : (
                          <>
                            <option value="">Formula…</option>
                            {formulas.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                      <div className="flex items-center gap-1" title="Videos per product">
                        {[1, 5, 10, 15].map((n) => (
                          <button
                            key={n}
                            onClick={() => setDrillVideosPerProduct(n)}
                            className={`h-7 rounded-md border px-2 text-xs font-medium transition ${
                              drillVideosPerProduct === n ? "border-primary bg-primary/10 text-foreground" : "bg-background text-muted-foreground"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                        <span className="pl-1 text-[11px] text-muted-foreground">videos ea.</span>
                      </div>
                      <Button size="sm" onClick={() => void createBatchFromDrill()} disabled={drillBatchCreating}>
                        {drillBatchCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}
                        {drillBatchCreating
                          ? "Creating…"
                          : `Create batch · ${drillAdoptedIds.length * drillVideosPerProduct} videos`}
                      </Button>
                      {onGenerate && (
                        <Button size="sm" variant="ghost" onClick={() => onGenerate(drillAdoptedIds)}>
                          Just jump to Batches →
                        </Button>
                      )}
                    </div>
                    <p className="w-full text-[11px] text-muted-foreground">
                      Scene image renders first, then image-to-video (engine cost applies per video).
                    </p>
                  </div>
                )}

                {recentFor === key && (
                  <div className="border-t bg-muted/30 px-3 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold">
                        Last 14 days — what they&rsquo;re pushing {recentLoading ? "" : `(${recentRows.length})`}
                      </p>
                      {!recentLoading && recentRows.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={selectAllRecent}>All</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setRecentSelected([])}>None</Button>
                        </div>
                      )}
                    </div>

                    {recentLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pulling their recent videos…
                      </div>
                    ) : recentRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {recentNotice ?? "No products in the last 14 days."}
                      </p>
                    ) : (
                      <>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {recentRows.map((p) => {
                            const m = (p.metadata ?? {}) as {
                              videoSales?: number | null;
                              videoGmv?: number | null;
                              promotedAt?: string | null;
                            };
                            return (
                              <label
                                key={p.sourceProductId}
                                className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 ${recentSelected.includes(p.sourceProductId) ? "border-primary bg-primary/5" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
                                  checked={recentSelected.includes(p.sourceProductId)}
                                  onChange={() => toggleRecent(p.sourceProductId)}
                                />
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt="" className="h-10 w-10 rounded-md border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
                                    <Package className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium">{p.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {p.priceMin ? `$${p.priceMin}` : "—"} · {fmt(p.sales30d)} sales
                                    {p.commissionRate != null ? ` · ${Math.round(p.commissionRate * 100)}% comm` : ""}
                                    {m.promotedAt ? ` · ${m.promotedAt}` : ""}
                                  </p>
                                  {m.videoSales != null && (
                                    <p className="text-[11px] text-muted-foreground">
                                      Last video: {fmt(m.videoSales)} sales · {money(m.videoGmv ?? null)}
                                    </p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button size="sm" onClick={() => void bulkAddRecent()} disabled={bulkAdopting || recentSelected.length === 0}>
                            {bulkAdopting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            Add {recentSelected.length} to Products
                          </Button>
                          {recentAdoptedIds.length > 0 && onGenerate && (
                            <Button size="sm" variant="secondary" onClick={() => onGenerate(recentAdoptedIds)}>
                              Generate videos for {recentAdoptedIds.length} added →
                            </Button>
                          )}
                          {recentAdoptedIds.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Added — pick a formula in the Batches tab (or jump straight there).
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Top Creators — find who's moving volume, copy their products ── */}
      <Card className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <TrendingUp className="h-4 w-4" /> Top Creators
          </div>
          <select
            value={topCreatorsPeriod}
            onChange={(e) => setTopCreatorsPeriod(e.target.value as "day" | "week" | "month")}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            title="Leaderboard period"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
          <select
            value={topCreatorsRole}
            onChange={(e) => setTopCreatorsRole(e.target.value as "all" | "creator" | "seller")}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            title="Account type"
          >
            <option value="all">All</option>
            <option value="creator">Creators</option>
            <option value="seller">Sellers</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => void loadTopCreators()} disabled={topCreatorsLoading}>
            {topCreatorsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          <span className="text-xs text-muted-foreground">
            Ranked by sales · click a creator to load their products, then select &amp; add
          </span>
        </div>
        {topCreatorsNotice && <p className="mb-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600">{topCreatorsNotice}</p>}
        {topCreatorsLoading && topCreators.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading top creators…
          </div>
        ) : topCreators.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">No creator data yet.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {topCreators.map((c) => {
              const id = String(c.sourceCreatorId ?? "");
              const name = String(c.name ?? "Unknown creator");
              const raw = (c.metadata as Record<string, unknown> | undefined)?.raw as Record<string, unknown> | undefined;
              const handle = String(raw?.unique_id ?? c.name ?? "");
              const region = c.region ? String(c.region) : "US";
              const verified = c.rating != null && Number(c.rating) >= 1;
              return (
                <button
                  key={id}
                  onClick={() => id && void drillProducts("influencer", id)}
                  className="flex items-center gap-2 rounded-md border p-2 text-left transition hover:border-primary/50 hover:bg-muted/40"
                  title={`Load ${name}'s products`}
                >
                  <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{String(c.rank ?? "—")}</span>
                  {c.avatarUrl ? (
                    <img src={String(c.avatarUrl)} alt="" className="h-9 w-9 rounded-full border object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-muted">
                      <User className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {name}
                      {verified && <Star className="ml-0.5 inline h-3 w-3 fill-amber-400 text-amber-400" />}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      @{handle} · {region}
                    </p>
                  </div>
                  <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {showFilters && (
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterField label="Price min ($)" value={filters.priceMin ?? ""} onChange={(v) => setFilter("priceMin", v)} type="number" />
            <FilterField label="Price max ($)" value={filters.priceMax ?? ""} onChange={(v) => setFilter("priceMax", v)} type="number" />
            <FilterField label="Commission min (%)" value={filters.commissionMin ?? ""} onChange={(v) => setFilter("commissionMin", v)} type="number" />
            <FilterField label="Commission max (%)" value={filters.commissionMax ?? ""} onChange={(v) => setFilter("commissionMax", v)} type="number" />
            <FilterField label="Influencers min" value={filters.influencersMin ?? ""} onChange={(v) => setFilter("influencersMin", v)} type="number" />
            <FilterField label="Videos min" value={filters.videosMin ?? ""} onChange={(v) => setFilter("videosMin", v)} type="number" />
            <FilterField label="Video views min" value={filters.viewsMin ?? ""} onChange={(v) => setFilter("viewsMin", v)} type="number" />
            <FilterField label="Rating min (0–5)" value={filters.ratingMin ?? ""} onChange={(v) => setFilter("ratingMin", v)} type="number" step="0.1" />
            <FilterField label="Comments min" value={filters.reviewsMin ?? ""} onChange={(v) => setFilter("reviewsMin", v)} type="number" />
            <FilterField label="Total sales min" value={filters.salesMin ?? ""} onChange={(v) => setFilter("salesMin", v)} type="number" />
            <FilterField label="30d sales min" value={filters.sales30dMin ?? ""} onChange={(v) => setFilter("sales30dMin", v)} type="number" />
            <FilterField label="GMV min ($)" value={filters.gmvMin ?? ""} onChange={(v) => setFilter("gmvMin", v)} type="number" />
            <FilterField label="30d GMV min ($)" value={filters.gmv30dMin ?? ""} onChange={(v) => setFilter("gmv30dMin", v)} type="number" />
            <FilterField label="New products (days)" value={filters.newProductsDays ?? ""} onChange={(v) => setFilter("newProductsDays", v)} type="number" placeholder="e.g. 7" />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Sales trend
              <select
                value={filters.salesTrend ?? ""}
                onChange={(e) => setFilter("salesTrend", e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
              >
                <option value="">Any</option>
                <option value="1">Up (7d)</option>
                <option value="0">Flat (7d)</option>
                <option value="2">Down (7d)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Shop type
              <select
                value={filters.fromFlag ?? ""}
                onChange={(e) => setFilter("fromFlag", e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
              >
                <option value="">Any</option>
                <option value="1">Local (本土)</option>
                <option value="2">Cross-border</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Main sales method
              <select
                value={filters.salesFlag ?? ""}
                onChange={(e) => setFilter("salesFlag", e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
              >
                <option value="">Any</option>
                <option value="1">Video</option>
                <option value="2">Live</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Sort by
              <select
                value={filters.sortField ?? ""}
                onChange={(e) => setFilter("sortField", e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
              >
                <option value="">Rank default</option>
                <option value="sales">Total sales</option>
                <option value="gmv">Total GMV</option>
                <option value="sales7d">Sales 7d</option>
                <option value="sales30d">Sales 30d</option>
                <option value="gmv7d">GMV 7d</option>
                <option value="gmv30d">GMV 30d</option>
                <option value="price">Price</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Sort direction
              <select
                value={filters.sortType ?? ""}
                onChange={(e) => setFilter("sortType", e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm text-foreground"
              >
                <option value="">Default</option>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={filters.sShop === "1"} onChange={(e) => setFilter("sShop", e.target.checked ? "1" : "")} className="h-3.5 w-3.5" />
                S-shop (full-managed)
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={filters.brandStore === "1"} onChange={(e) => setFilter("brandStore", e.target.checked ? "1" : "")} className="h-3.5 w-3.5" />
                Brand store
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={filters.freeShipping === "1"} onChange={(e) => setFilter("freeShipping", e.target.checked ? "1" : "")} className="h-3.5 w-3.5" />
                Free shipping
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={filters.hot === "1"} onChange={(e) => setFilter("hot", e.target.checked ? "1" : "")} className="h-3.5 w-3.5" />
                Hot 🔥
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={filters.onSaleOnly === "1"} onChange={(e) => setFilter("onSaleOnly", e.target.checked ? "1" : "")} className="h-3.5 w-3.5" />
                On sale only
              </label>
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={() => void refreshMarket()} disabled={loading}>
                Apply filters
              </Button>
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                      <button
                        type="button"
                        onClick={() => openDetail(row)}
                        title="Open product detail"
                        className="group flex w-full items-center gap-2 text-left"
                      >
                        {row.imageUrl ? (
                          <img
                            src={row.id ? `/api/market/products/${row.id}/image` : row.imageUrl}
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
                          <p className="truncate font-medium group-hover:text-primary group-hover:underline">
                            {row.name}
                          </p>
                          {row.categoryL1 && (
                            <p className="truncate text-xs text-muted-foreground">{row.categoryL1}</p>
                          )}
                        </div>
                      </button>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() => toggleAnalytics(row)}
                          disabled={analyticsLoading === (row.id ?? `live:${row.sourceProductId}`)}
                        >
                          {analyticsLoading === (row.id ?? `live:${row.sourceProductId}`) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <TrendingUp className="h-3.5 w-3.5" />
                          )}
                          Analytics
                        </Button>
                        {row.productId ? (
                          <Badge className="bg-green-100 text-green-700">in Products</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={adopting === (row.id ?? row.sourceProductId)}
                            onClick={() => adopt(row)}
                          >
                            {adopting === (row.id ?? row.sourceProductId) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                            Add
                          </Button>
                        )}
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
                              <div className="flex flex-col items-end gap-1">
                                <LowEngagementFlag rate={c.engagementRate} />
                                {c.rating != null && (
                                  <Badge className="bg-slate-100 text-slate-700">★ {c.rating}</Badge>
                                )}
                              </div>
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
                  {analyticsFor === (row.id ?? `live:${row.sourceProductId}`) && (
                    <tr className="border-b bg-muted/30">
                      <td colSpan={11} className="px-4 py-3">
                        {analyticsLoading === (row.id ?? `live:${row.sourceProductId}`) ? (
                          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading business panorama…
                          </div>
                        ) : (
                          <AnalyticsPanel a={analytics[row.id ?? `live:${row.sourceProductId}`]} />
                        )}
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

      <ProductDetailDialog
        open={!!detailFor}
        onOpenChange={(o) => !o && setDetailFor(null)}
        product={detailFor?.product ?? null}
        workspaceId={workspaceId}
        initialAnalytics={detailFor?.analytics ?? null}
      />
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

// ─── Clone tab (V2V, backlog row 9) ──────────────────────────────────────────
/** Exact fal Kling i2v audio-off rates ($/s), verified on fal 2026-08-29.
 *  v3 defaults generate_audio=true (+50%) — worker forces it off. */
const MODEL_RATE_S: Record<string, number> = {
  "kling-pro": 0.112,
  "kling-standard": 0.084,
  "kling-turbo": 0.07,
  "kling-1.5-pro": 0.1,
  "kling-v1": 0.045,
};

function CloneTab({ workspaceId }: { workspaceId: string }) {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [libraryVideos, setLibraryVideos] = useState<
    { id: string; fileName: string; url: string; duration: number | null }[]
  >([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [textChange, setTextChange] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [durationSec, setDurationSec] = useState("5");
  const [model, setModel] = useState("kling-pro");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("720p");
  const [busy, setBusy] = useState(false);

  const canSubmit = (sourceFile || sourceUrl.trim()) && editPrompt.trim() && !busy;

  // Load workspace video assets for the "from Media Library" source picker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLibraryLoading(true);
      try {
        const res = await fetch(`/api/media?workspaceId=${encodeURIComponent(workspaceId)}`);
        if (res.ok) {
          const items = (await res.json()) as {
            id: string;
            fileName: string;
            url: string;
            duration: number | null;
            mediaType: string;
          }[];
          if (!cancelled)
            setLibraryVideos(items.filter((i) => i.mediaType === "video"));
        }
      } catch {
        // library picker is optional — leave empty
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("workspaceId", workspaceId);
      fd.append("editPrompt", editPrompt.trim());
      if (sourceFile) fd.append("source", sourceFile);
      else fd.append("sourceVideoUrl", sourceUrl.trim());
      if (textChange.trim()) fd.append("textChange", textChange.trim());
      if (motionPrompt.trim()) fd.append("motionPrompt", motionPrompt.trim());
      fd.append("durationSec", durationSec);
      fd.append("model", model);
      fd.append("aspectRatio", aspectRatio);
      fd.append("resolution", resolution);
      const res = await fetch("/api/video-clone", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Clone failed");
      toast.success("Clone queued — watch it in Batch Studio");
      setSourceFile(null);
      setSourceUrl("");
      setEditPrompt("");
      setTextChange("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clone failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Video Clone</CardTitle>
        <CardDescription>
          Upload a video (or paste a TikTok / direct mp4 URL) and describe the
          change — new background, on-screen text swap — Kling re-animates it.
          Exact re-animate cost shown per model below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Source video</Label>
          <Input
            type="file"
            accept="video/*"
            onChange={(e) => setSourceFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or direct URL
            <span className="h-px flex-1 bg-border" />
          </div>
          <Input
            placeholder="https://… (direct mp4 URL)"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or from Media Library
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={libraryVideos.find((v) => v.url === sourceUrl)?.id ?? ""}
              onChange={(e) => {
                const v = libraryVideos.find((x) => x.id === e.target.value);
                if (v) {
                  setSourceUrl(v.url);
                  setSourceFile(null);
                }
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">
                {libraryLoading ? "Loading library…" : "Pick a library video…"}
              </option>
              {libraryVideos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.fileName}
                  {v.duration ? ` (${Math.round(v.duration)}s)` : ""}
                </option>
              ))}
            </select>
            {libraryVideos.length === 0 && !libraryLoading && (
              <span className="shrink-0 text-xs text-muted-foreground">
                No videos yet — download or upload one first
              </span>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Edit prompt</Label>
          <Textarea
            rows={3}
            placeholder="Change the background to a neon nightclub at night…"
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>On-screen text (optional)</Label>
            <Input
              placeholder="BUY NOW — link in bio"
              value={textChange}
              onChange={(e) => setTextChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Motion (optional)</Label>
            <Input
              placeholder="gentle camera push-in"
              value={motionPrompt}
              onChange={(e) => setMotionPrompt(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-end gap-4">
          <div className="space-y-1.5">
            <Label>Model</Label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="kling-pro">Kling 3.0 Pro ($0.112/s)</option>
              <option value="kling-standard">Kling 3.0 Standard ($0.084/s)</option>
              <option value="kling-turbo">Kling 2.5 Turbo Pro ($0.07/s)</option>
              <option value="kling-1.5-pro">Kling 1.5 Pro ($0.10/s)</option>
              <option value="kling-v1">Kling 1.0 Standard ($0.045/s)</option>
              <option value="sora">Sora 2 (OpenAI credits)</option>
              <option value="veo" disabled>Veo 3.1 (disabled)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Duration</Label>
            <select
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="5">5s</option>
              <option value="10">10s</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Size</Label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="flex h-9 w-28 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="9:16">9:16 · Vertical</option>
              <option value="16:9">16:9 · Landscape</option>
              <option value="1:1">1:1 · Square</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Quality</Label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="flex h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
          <div className="ml-auto text-right text-xs text-muted-foreground">
            <div>
              {MODEL_RATE_S[model]
                ? `Re-animate ≈ $${(MODEL_RATE_S[model] * Number(durationSec)).toFixed(2)}`
                : model === "sora"
                  ? "Re-animate: Sora credits"
                  : "Re-animate: —"}
            </div>
            <div>+ frame edit ~$0.08</div>
          </div>
          <Button onClick={onSubmit} disabled={!canSubmit} className="ml-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Clone it
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Downloader tab (backlog row 12: TikTok-first media downloader) ──────────
interface DownloadRow {
  id: string;
  sourceUrl: string;
  platform: string;
  wantAudio: boolean;
  status: string;
  title: string | null;
  authorName: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  error: string | null;
  createdAt: string;
}

function DownloaderTab({ workspaceId }: { workspaceId: string }) {
  const [url, setUrl] = useState("");
  const [wantAudio, setWantAudio] = useState(false);
  const [muteVideo, setMuteVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<DownloadRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/media-download?workspaceId=${workspaceId}`);
      if (!res.ok) return;
      setRows(await res.json());
    } catch {
      /* list is best-effort */
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/media-download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, sourceUrl: url.trim(), wantAudio, muteVideo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Download failed");
      toast.success("Queued — grabs the video in seconds");
      setUrl("");
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media Downloader</CardTitle>
        <CardDescription>
          Paste a TikTok / YouTube / Instagram link — get the video (and MP3).
          TikTok works instantly from this box; YT is often bot-walled here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>Link</Label>
            <Input
              placeholder="https://www.tiktok.com/@user/video/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
            />
          </div>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={wantAudio}
              onChange={(e) => setWantAudio(e.target.checked)}
              className="h-4 w-4"
            />
            Also grab MP3
          </label>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={muteVideo}
              onChange={(e) => setMuteVideo(e.target.checked)}
              className="h-4 w-4"
            />
            Mute video (no sound in the mp4)
          </label>
          <Button onClick={onSubmit} disabled={!url.trim() || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </Button>
        </div>

        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No downloads yet — paste a link above.
            </p>
          )}
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.title || row.sourceUrl}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.platform}
                  {row.authorName ? ` · ${row.authorName}` : ""} ·{" "}
                  {new Date(row.createdAt).toLocaleString()}
                </p>
                {row.error && <p className="mt-0.5 text-xs text-destructive">{row.error.slice(0, 160)}</p>}
              </div>
              {row.status === "done" && (
                <div className="flex items-center gap-2">
                  {row.videoUrl && (
                    <>
                      <a
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium"
                        href={`/api/media-download/${row.id}/file?kind=video`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download className="h-3.5 w-3.5" /> MP4
                      </a>
                      <video src={`/api/media-download/${row.id}/file?kind=video`} controls className="h-20 w-14 rounded border object-cover" />
                    </>
                  )}
                  {row.audioUrl && (
                    <a
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium"
                      href={`/api/media-download/${row.id}/file?kind=audio`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download className="h-3.5 w-3.5" /> MP3
                    </a>
                  )}
                </div>
              )}
              <Badge variant={row.status === "done" ? "default" : row.status === "failed" ? "destructive" : "secondary"}>
                {row.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
