"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Loader2, Play, Save, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { resolveActiveWorkspace } from "@/lib/active-workspace";
import { CREATOR_PROVIDER_CATALOG } from "@/lib/creator-clone/providers";

type Creator = { id: string; name: string; consentStatus: string; voiceModelId?: string | null };
type Run = { id: string; voiceProvider: string | null; avatarProvider: string | null; status: string; error: string | null; generationTimeMs: number | null; resolution: string | null; ratings: Array<Record<string, number | string | null>> };
type Benchmark = { id: string; creatorName: string; script: string; qualityMode: string; status: string; createdAt: string; runs: Run[] };

const scoreFields = [
  ["faceLikeness", "Face likeness"],
  ["voiceLikeness", "Voice likeness"],
  ["lipSync", "Lip sync"],
  ["movementNaturalness", "Movement"],
  ["overallRealism", "Overall realism"],
] as const;

export default function BenchmarksPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [creatorId, setCreatorId] = useState("");
  const [script, setScript] = useState("");
  const [qualityMode, setQualityMode] = useState("standard");
  const [selectedVoices, setSelectedVoices] = useState<string[]>(["fish_audio"]);
  const [selectedAvatars, setSelectedAvatars] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const [creatorResponse, benchmarkResponse] = await Promise.all([
      fetch(`/api/creators?workspaceId=${id}`),
      fetch(`/api/clone-benchmarks?workspaceId=${id}`),
    ]);
    if (creatorResponse.ok) {
      const rows = await creatorResponse.json();
      setCreators(rows);
      if (!creatorId && rows[0]) setCreatorId(rows[0].id);
    }
    if (benchmarkResponse.ok) setBenchmarks(await benchmarkResponse.json());
  }, [creatorId]);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/workspaces");
      const workspaces = response.ok ? await response.json() : [];
      const active = resolveActiveWorkspace(workspaces);
      if (active) {
        setWorkspaceId(active.id);
        await load(active.id);
      }
      setLoading(false);
    })();
  }, [load]);

  const toggle = (setter: Dispatch<SetStateAction<string[]>>, id: string) =>
    setter((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const runBenchmark = async () => {
    if (!workspaceId || !creatorId || script.trim().length < 10 || running) return;
    setRunning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/clone-benchmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, creatorId, script, qualityMode, voiceProviders: selectedVoices, avatarProviders: selectedAvatars }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Benchmark failed");
      setMessage(`Created ${data.runs?.length ?? 0} provider runs. Unavailable adapters are recorded for comparison.`);
      await load(workspaceId);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const deleteBenchmark = async (id: string) => {
    if (!confirm("Delete this benchmark and all of its runs and ratings?")) return;
    setDeleting(id);
    try {
      const response = await fetch(`/api/clone-benchmarks/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Delete failed");
      setBenchmarks((current) => current.filter((benchmark) => benchmark.id !== id));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!workspaceId) return <div className="p-6 text-sm text-muted-foreground">Create or join a workspace first.</div>;

  const voiceProviders = CREATOR_PROVIDER_CATALOG.filter((provider) => provider.capabilities.some((capability) => capability.kind === "voice"));
  const avatarProviders = CREATOR_PROVIDER_CATALOG.filter((provider) => provider.capabilities.some((capability) => capability.kind === "avatar"));

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div><h1 className="text-2xl font-bold tracking-tight">Clone Benchmark</h1><p className="text-sm text-muted-foreground">Run the same script across provider combinations and score quality-per-dollar.</p></div>
      <Card className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium">Authorized creator<select value={creatorId} onChange={(event) => setCreatorId(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm">{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name} ({creator.consentStatus})</option>)}</select></label>
          <label className="text-xs font-medium">Quality mode<select value={qualityMode} onChange={(event) => setQualityMode(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="economy">Economy</option><option value="standard">Standard</option><option value="premium">Premium</option></select></label>
          <div className="text-xs font-medium">Provider combinations<div className="mt-1 text-muted-foreground">{selectedVoices.length * Math.max(1, selectedAvatars.length)} runs</div></div>
        </div>
        <Textarea value={script} onChange={(event) => setScript(event.target.value)} placeholder="Paste the test script every provider should receive…" rows={4} />
        <div className="grid gap-4 md:grid-cols-2">
          <div><p className="mb-2 text-xs font-medium">Voice providers</p><div className="flex flex-wrap gap-2">{voiceProviders.map((provider) => <label key={provider.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={selectedVoices.includes(provider.id)} onChange={() => toggle(setSelectedVoices, provider.id)} />{provider.name}</label>)}</div></div>
          <div><p className="mb-2 text-xs font-medium">Avatar providers (optional)</p><div className="flex flex-wrap gap-2">{avatarProviders.map((provider) => <label key={provider.id} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={selectedAvatars.includes(provider.id)} onChange={() => toggle(setSelectedAvatars, provider.id)} />{provider.name}</label>)}</div><p className="mt-2 text-[11px] text-muted-foreground">Leave all unchecked for a Fish Audio-only voice benchmark.</p></div>
        </div>
        {selectedVoices.includes("fish_audio") && !creators.find((creator) => creator.id === creatorId)?.voiceModelId && <p className="text-xs text-amber-700">Justin’s Fish Audio voice/model ID is missing. Add it under Creators before running.</p>}
        <Button onClick={runBenchmark} disabled={running || script.trim().length < 10 || !creatorId || !selectedVoices.length}><Play className="mr-2 h-4 w-4" />{running ? "Running…" : selectedAvatars.length ? "Run benchmark" : "Run Fish Audio"}</Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </Card>
      <div className="space-y-4">{benchmarks.map((benchmark) => { const isCollapsed = collapsed.has(benchmark.id); return <Card key={benchmark.id} className="space-y-4 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-medium">{benchmark.creatorName} · {benchmark.qualityMode}</h2><p className="text-xs text-muted-foreground">{new Date(benchmark.createdAt).toLocaleString()} · {benchmark.runs.length} runs</p></div><div className="flex items-center gap-2"><Badge>{benchmark.status}</Badge><Button size="icon" variant="ghost" onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(benchmark.id)) next.delete(benchmark.id); else next.add(benchmark.id); return next; })} title={isCollapsed ? "Expand benchmark" : "Minimize benchmark"}>{isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</Button><Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteBenchmark(benchmark.id)} disabled={deleting === benchmark.id} title="Delete benchmark"><Trash2 className="h-4 w-4" /></Button></div></div>{!isCollapsed && <><p className="rounded-md bg-muted p-3 text-sm">{benchmark.script}</p><div className="grid gap-3 md:grid-cols-2">{benchmark.runs.map((run) => <RunCard key={run.id} run={run} />)}</div></>}</Card>; })}</div>
      {!benchmarks.length && <Card className="p-8 text-center text-sm text-muted-foreground">No benchmarks yet.</Card>}
    </div>
  );
}

function RunCard({ run }: { run: Run }) {
  const existing = run.ratings[0] ?? {};
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(scoreFields.map(([field]) => [field, existing[field] ? String(existing[field]) : ""])));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    await fetch(`/api/clone-benchmarks/runs/${run.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(scores) });
    setSaving(false);
  };
  return <Card className="space-y-3 border-dashed p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{run.voiceProvider} + {run.avatarProvider}</p><Badge variant={run.status === "done" ? "default" : "secondary"}>{run.status}</Badge></div><p className="text-xs text-muted-foreground">{run.resolution ?? "—"} · {run.generationTimeMs ?? 0} ms{run.error ? ` · ${run.error}` : ""}</p><div className="grid grid-cols-2 gap-2">{scoreFields.map(([field, label]) => <label key={field} className="text-[11px] text-muted-foreground">{label}<select value={scores[field] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [field]: event.target.value }))} className="mt-1 w-full rounded border bg-background px-2 py-1 text-xs"><option value="">—</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}</select></label>)}</div><Button size="sm" variant="outline" onClick={save} disabled={saving}><Save className="mr-1.5 h-3.5 w-3.5" />{saving ? "Saving…" : "Save rating"}</Button></Card>;
}
