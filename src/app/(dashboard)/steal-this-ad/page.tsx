"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import { toast } from "sonner";
import Link from "next/link";
import {
  Ghost,
  Plus,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Wand2,
  Play,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdSource {
  id: string;
  sourceUrl: string;
  platform: string;
  title: string | null;
  authorName: string | null;
  status: string;
  error: string | null;
  createdAt: string;
  remixCount: number;
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface Remix {
  id: string;
  hook: string;
  angle: string | null;
  tone: string;
  script: string;
  status: string;
  batchId: string | null;
}

interface SourceDetail extends AdSource {
  transcript: TranscriptSegment[];
  rawText: string | null;
  remixes: Remix[];
}

interface Product {
  id: string;
  name: string;
  status: string;
}

interface Voice {
  id: string;
  name: string;
}

const POLLING = ["queued", "downloading", "transcribing"];
const fmtTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-slate-500/15 text-slate-400",
  downloading: "bg-amber-500/15 text-amber-400",
  transcribing: "bg-amber-500/15 text-amber-400",
  transcribed: "bg-emerald-500/15 text-emerald-400",
  fetched: "bg-teal-500/15 text-teal-400",
  failed: "bg-red-500/15 text-red-400",
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function StealThisAdPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [sources, setSources] = useState<AdSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [remixing, setRemixing] = useState(false);
  const [renderingId, setRenderingId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [renderProductId, setRenderProductId] = useState("");
  const [renderVoiceId, setRenderVoiceId] = useState("");
  const [renderFor, setRenderFor] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Resolve the active workspace (same pattern as Video Studio).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workspaces");
        if (!res.ok) return;
        const workspaces = (await res.json()) as Array<{ id: string }>;
        const active = resolveActiveWorkspace(workspaces);
        if (active) setWorkspaceId(active.id);
      } catch {
        // workspace resolution failure is non-fatal; page just waits
      }
    })();
  }, []);

  const loadSources = useCallback(async (wsId: string) => {
    const res = await fetch(`/api/ads/steal?workspaceId=${wsId}`);
    if (res.ok) {
      const data = (await res.json()) as AdSource[];
      setSources(data);
      // Keep the selected row's remix count fresh without losing the view.
      if (data.length > 0 && !data.some((s) => s.id === selectedId)) {
        setSelectedId(null);
        setDetail(null);
      }
    }
  }, [selectedId]);

  useEffect(() => {
    if (!workspaceId) return;
    setLoadingSources(true);
    loadSources(workspaceId).finally(() => setLoadingSources(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/ads/steal/${id}`);
    if (res.ok) {
      const data = (await res.json()) as SourceDetail;
      setDetail(data);
      return data;
    }
    return null;
  }, []);

  // Poll while the worker is chewing on it.
  useEffect(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (selectedId && detail && POLLING.includes(detail.status)) {
      pollTimer.current = setInterval(async () => {
        const updated = await loadDetail(selectedId);
        if (updated && !POLLING.includes(updated.status)) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          pollTimer.current = null;
          if (workspaceId) loadSources(workspaceId);
        }
      }, 4000);
    }
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [selectedId, detail?.status, loadDetail, loadSources, workspaceId]);

  const openSource = async (id: string) => {
    setSelectedId(id);
    await loadDetail(id);
  };

  const submit = async () => {
    if (!workspaceId || !url.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/ads/steal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, url: url.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to enqueue");
        return;
      }
      const row = (await res.json()) as AdSource;
      setUrl("");
      await loadSources(workspaceId);
      await openSource(row.id);
      toast.success(
        row.platform === "product"
          ? "Product resolved — ready to remix"
          : "Ad queued — fetching + transcribing…"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Upload fallback: TikTok sometimes blocks datacenter-IP downloads, so the
  // user can drop the ad file in instead of pasting a URL. Same pipeline.
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const submitFile = async (file: File) => {
    if (!workspaceId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("workspaceId", workspaceId);
      const up = await fetch("/api/media/upload", { method: "POST", body: form });
      if (!up.ok) {
        toast.error("Upload failed");
        return;
      }
      const asset = (await up.json()) as { url: string };
      const res = await fetch("/api/ads/steal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, url: asset.url, platform: "upload" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to enqueue upload");
        return;
      }
      const row = (await res.json()) as AdSource;
      await loadSources(workspaceId);
      await openSource(row.id);
      toast.success("Video queued — transcribing…");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const generateRemixes = async () => {
    if (!selectedId) return;
    setRemixing(true);
    try {
      const res = await fetch(`/api/ads/steal/${selectedId}/remix`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variants: 3 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to generate remixes");
        return;
      }
      await loadDetail(selectedId);
      toast.success("Remixes ready");
    } finally {
      setRemixing(false);
    }
  };

  const openRender = async (remixId: string) => {
    if (!workspaceId) return;
    setRenderFor(remixId);
    const [p, v] = await Promise.all([
      fetch(`/api/products?workspaceId=${workspaceId}`),
      fetch(`/api/voices?workspaceId=${workspaceId}`),
    ]);
    if (p.ok) {
      const rows = (await p.json()) as Product[];
      setProducts(rows.filter((r) => r.status === "ready"));
      setRenderProductId(rows[0]?.id ?? "");
    }
    if (v.ok) {
      const rows = (await v.json()) as Voice[];
      setVoices(rows);
      setRenderVoiceId(rows[0]?.id ?? "");
    }
  };

  const render = async () => {
    if (!selectedId || !renderFor || !renderProductId) return;
    setRenderingId(renderFor);
    try {
      const res = await fetch(`/api/ads/steal/${selectedId}/remix/${renderFor}/render`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          productId: renderProductId,
          voiceId: renderVoiceId || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to render");
        return;
      }
      const { batchId } = (await res.json()) as { batchId: string };
      setRenderFor(null);
      await loadDetail(selectedId);
      toast.success("Rendering started — track it in Video Studio");
      window.open(`/video-studio?batch=${batchId}`, "_blank");
    } finally {
      setRenderingId(null);
    }
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyScript = (remix: Remix) => {
    navigator.clipboard.writeText(`${remix.hook}\n\n${remix.script}`);
    setCopiedId(remix.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Ghost className="h-6 w-6" /> Steal This Ad
        </h1>
        <p className="text-sm text-muted-foreground">
          Paste a viral TikTok ad → we transcribe it → remix it into original
          scripts for your products → render through Video Studio.
        </p>
      </div>

      {/* Paste box */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Paste a TikTok ad URL… (https://www.tiktok.com/@user/video/123)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button onClick={submit} disabled={submitting || !url.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Steal It
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-muted-foreground/60">…or upload the ad file directly</span>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void submitFile(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload Video
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Sources list */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sources</CardTitle>
            <CardDescription className="text-xs">
              {loadingSources ? "Loading…" : `${sources.length} pasted`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sources.length === 0 && !loadingSources && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No ads yet. Paste one above.
              </p>
            )}
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => openSource(s.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  selectedId === s.id
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {s.title ?? s.sourceUrl.replace(/^https?:\/\/(www\.)?/, "")}
                  </span>
                  <Badge className={cn("shrink-0", STATUS_BADGE[s.status] ?? "")}>
                    {s.status}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {s.authorName && <span>{s.authorName}</span>}
                  <span>·</span>
                  <span>{s.remixCount} remix(es)</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Detail */}
        {selectedId && detail ? (
          <div className="space-y-4">
            {detail.status === "failed" && (
              <Card className="border-red-500/30">
                <CardContent className="p-4 text-sm text-red-400">
                  Failed: {detail.error ?? "unknown error"}. The download may be
                  blocked by TikTok — try a different ad URL.
                </CardContent>
              </Card>
            )}

            {POLLING.includes(detail.status) && (
              <Card>
                <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {detail.status === "queued" && "Waiting for the worker…"}
                  {detail.status === "downloading" && "Downloading the ad video…"}
                  {detail.status === "transcribing" && "Transcribing (faster-whisper)…"}
                </CardContent>
              </Card>
            )}

            {/* Transcript */}
            {detail.status === "transcribed" && detail.transcript.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Transcript</CardTitle>
                </CardHeader>
                <CardContent className="max-h-64 space-y-1 overflow-y-auto text-sm">
                  {detail.transcript.map((seg, i) => (
                    <p key={i} className="text-muted-foreground">
                      <span className="mr-2 font-mono text-xs text-muted-foreground/60">
                        {fmtTime(seg.start)}
                      </span>
                      {seg.text}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Product info (product-link sources resolve here, no video) */}
            {detail.status === "fetched" && detail.rawText && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Product</CardTitle>
                </CardHeader>
                <CardContent className="max-h-64 overflow-y-auto whitespace-pre-line text-sm text-muted-foreground">
                  {detail.rawText}
                </CardContent>
              </Card>
            )}

            {/* Remixes */}
            {(detail.status === "transcribed" || detail.status === "fetched") && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium">Remixes</h2>
                  <Button
                    size="sm"
                    onClick={generateRemixes}
                    disabled={remixing || detail.remixes.length > 0}
                  >
                    {remixing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {detail.remixes.length > 0 ? "Remixes Generated" : "Generate 3 Remixes"}
                  </Button>
                </div>

                {detail.remixes.length === 0 && !remixing && (
                  <p className="text-sm text-muted-foreground">
                    Generate remixes to turn this ad's structure into original
                    scripts for your products.
                  </p>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  {detail.remixes.map((r) => (
                    <Card key={r.id}>
                      <CardContent className="space-y-2 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <Badge className="bg-blue-500/15 text-blue-400">{r.angle}</Badge>
                          <Badge variant="outline" className="text-xs">{r.tone}</Badge>
                        </div>
                        <p className="text-sm font-medium">“{r.hook}”</p>
                        <p className="text-sm text-muted-foreground">{r.script}</p>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyScript(r)}
                          >
                            {copiedId === r.id ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            Copy
                          </Button>
                          {r.batchId ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              asChild
                            >
                              <Link href={`/video-studio?batch=${r.batchId}`} target="_blank">
                                <ExternalLink className="h-4 w-4" /> In Video Studio
                              </Link>
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => openRender(r.id)}>
                              <Play className="h-4 w-4" /> Render
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {renderFor && (
                  <Card className="border-primary/40">
                    <CardContent className="space-y-3 p-4">
                      <h3 className="text-sm font-medium">Render this remix</h3>
                      <p className="text-xs text-muted-foreground">
                        Runs through the normal pipeline: product footage →
                        voiceover → Post Queue. Uses your formula defaults.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Product</span>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={renderProductId}
                            onChange={(e) => setRenderProductId(e.target.value)}
                          >
                            {products.length === 0 && (
                              <option value="">No ready products — add one in Products</option>
                            )}
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">Voice</span>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={renderVoiceId}
                            onChange={(e) => setRenderVoiceId(e.target.value)}
                          >
                            {voices.map((v) => (
                              <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={render}
                          disabled={renderingId === renderFor || !renderProductId}
                        >
                          {renderingId === renderFor && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          Start Render
                        </Button>
                        <Button variant="ghost" onClick={() => setRenderFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : (
          !selectedId && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                <Ghost className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Paste an ad to see the transcript and start remixing.
                </p>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}
