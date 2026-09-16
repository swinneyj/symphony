"use client";

// Persona detail page — asset hub for an AI influencer:
//   Photos — gallery from the persona_media junction (face refs + generated)
//   Videos — every render featuring the model (jobs metadata->>'personaId')
//   Voice  — the persona's voice row + swap
//   Usage  — formulas using this persona, batch history, published posts

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Film, Image as ImageIcon, Volume2, BarChart3, BadgeCheck, Sparkles, Play, Database } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type Photo = {
  id: string;
  role: string;
  mediaAssetId: string;
  fileName: string | null;
  mimeType: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
};

type VideoRow = {
  id: string;
  jobType: string;
  status: string;
  finalUrl: string | null;
  thumbnailUrl: string | null;
  batchName: string | null;
  formulaName: string | null;
  productName: string | null;
  posted: boolean | null;
};

type HubPayload = {
  photos: Photo[];
  trainingMedia: Photo[];
  videos: VideoRow[];
  voice: { id: string; name: string; provider: string } | null;
  usage: { formulas: { id: string; name: string }[]; batches: number; posts: number };
};

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const dataSize = frames * channels * 2;
  const output = new ArrayBuffer(44 + dataSize);
  const view = new DataView(output);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < channels; channel++) {
    const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2;
  }
  return new Blob([output], { type: "audio/wav" });
}

type CreatorDetail = {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  faceImageUrl: string | null;
  voiceId: string | null;
  voiceProvider: string | null;
  voiceModelId: string | null;
  avatarProvider: string | null;
  avatarModelId: string | null;
  styleConfig: {
    speakingStyle?: string;
    personalityTraits?: string[];
    customInstructions?: string;
  } | null;
  personaPrompt: string | null;
  consentStatus: "pending" | "authorized" | "revoked" | "expired";
  isSystem: boolean | null;
};

const STATUS_BADGE: Record<string, string> = {
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  queued: "bg-zinc-100 text-zinc-600",
  running: "bg-blue-100 text-blue-700",
};

export default function PersonaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [persona, setPersona] = useState<CreatorDetail | null>(null);
  const [hub, setHub] = useState<HubPayload | null>(null);
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTraining, setSelectedTraining] = useState<Set<string>>(new Set());
  const [training, setTraining] = useState(false);
  const [trainingMessage, setTrainingMessage] = useState<string | null>(null);

  // System personas (workspaceId null) need ?workspaceId= on read APIs —
  // resolve the user's workspace like the formula run page does. Wait for
  // that resolution before the first load so system personas never 403.
  const [wsResolved, setWsResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspaces")
      .then((r) => (r.ok ? r.json() : []))
      .then((ws) => {
        if (cancelled) return;
        if (Array.isArray(ws) && ws.length > 0) setWorkspaceId(ws[0].id);
        setWsResolved(true);
      })
      .catch(() => {
        if (!cancelled) setWsResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      const wsQuery = workspaceId ? `?workspaceId=${workspaceId}` : "";
      const pRes = await fetch(`/api/creators/${id}${wsQuery}`);
      if (!pRes.ok) {
        const d = await pRes.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed to load persona (${pRes.status})`);
      }
      const p = await pRes.json();
      setPersona(p);
      const hRes = await fetch(`/api/creators/${id}/media${wsQuery}`);
      if (!hRes.ok) {
        const d = await hRes.json().catch(() => ({}));
        throw new Error(d.error ?? `Failed to load asset hub (${hRes.status})`);
      }
      setHub(await hRes.json());
      if (p.workspaceId) {
        const v = await fetch(`/api/voices?workspaceId=${p.workspaceId}`).then((r) => r.json());
        setVoices(v);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, workspaceId]);

  useEffect(() => {
    if (!wsResolved) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, wsResolved]);

  const swapVoice = async (voiceId: string) => {
    if (!persona) return;
    await fetch(`/api/creators/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: persona.workspaceId ?? workspaceId, voiceId: voiceId || null }),
    });
    load();
  };

  const trainFishVoice = async () => {
    if (!persona || !hub || selectedTraining.size === 0 || training) return;
    if (persona.consentStatus !== "authorized") { setTrainingMessage("Authorize this creator before training a voice model."); return; }
    setTraining(true); setTrainingMessage(null);
    try {
      const audioContext = new AudioContext();
      const form = new FormData();
      form.append("title", `${persona.name} voice`);
      for (const asset of hub.trainingMedia.filter((item) => selectedTraining.has(item.id))) {
        const response = await fetch(`/api/media/${asset.mediaAssetId}/public`);
        if (!response.ok) throw new Error(`Could not read ${asset.fileName ?? "training media"}`);
        const source = await response.arrayBuffer();
        const audio = asset.role === "training_video" ? audioBufferToWav(await audioContext.decodeAudioData(source.slice(0))) : new Blob([source], { type: asset.mimeType ?? "audio/mpeg" });
        form.append("voices", audio, `${(asset.fileName ?? "voice-sample").replace(/\.[^.]+$/, "")}.wav`);
      }
      await audioContext.close();
      const result = await fetch(`/api/creators/${id}/fish-train`, { method: "POST", body: form });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(payload.error ?? "Fish Audio training failed");
      setTrainingMessage(`Voice model created: ${payload.modelId}. It is now saved on ${persona.name}.`);
      setPersona((current) => current ? { ...current, voiceProvider: "fish_audio", voiceModelId: payload.modelId } : current);
      setSelectedTraining(new Set());
    } catch (e) { setTrainingMessage((e as Error).message); }
    finally { setTraining(false); }
  };

  if (error) return <div className="p-6 text-sm text-destructive">{error}</div>;
  if (!persona || !hub)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link href="/creators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Creators
      </Link>

      <div className="flex items-start gap-5">
        <div className="h-32 w-32 overflow-hidden rounded-2xl border bg-muted">
          {persona.faceImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/personas/${id}/image${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
              alt={persona.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl text-muted-foreground/40">
              {persona.name[0]}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{persona.name}</h1>
            {persona.isSystem && <Badge variant="secondary">System</Badge>}
            <Badge variant="outline">
              <BadgeCheck className="h-3 w-3 mr-1" />
              {hub.voice ? `${hub.voice.name} (${hub.voice.provider})` : "No voice"}
            </Badge>
            <Badge variant={persona.consentStatus === "authorized" ? "default" : "secondary"}>
              {persona.consentStatus}
            </Badge>
          </div>
          {persona.description && <p className="mt-1 text-sm text-muted-foreground">{persona.description}</p>}
          {persona.personaPrompt && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              <Sparkles className="h-3 w-3 inline mr-1" />
              {persona.personaPrompt}
            </p>
          )}
          {(persona.voiceProvider || persona.avatarProvider || persona.styleConfig?.speakingStyle) && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {persona.voiceProvider && (
                <Badge variant="outline">
                  Voice: {persona.voiceProvider}{persona.voiceModelId ? ` · ${persona.voiceModelId}` : ""}
                </Badge>
              )}
              {persona.avatarProvider && (
                <Badge variant="outline">
                  Avatar: {persona.avatarProvider}{persona.avatarModelId ? ` · ${persona.avatarModelId}` : ""}
                </Badge>
              )}
              {persona.styleConfig?.speakingStyle && (
                <Badge variant="secondary">Style: {persona.styleConfig.speakingStyle}</Badge>
              )}
            </div>
          )}
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" /> {hub.photos.length} photos
            </span>
            <span className="flex items-center gap-1">
              <Film className="h-3.5 w-3.5" /> {hub.videos.length} videos
            </span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" /> {hub.usage.formulas.length} formulas · {hub.usage.batches} batches · {hub.usage.posts} posts
            </span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="photos">
        <TabsList>
          <TabsTrigger value="photos" className="gap-1.5">
            <ImageIcon className="h-4 w-4" /> Photos
          </TabsTrigger>
          <TabsTrigger value="videos" className="gap-1.5">
            <Film className="h-4 w-4" /> Videos
          </TabsTrigger>
          <TabsTrigger value="voice" className="gap-1.5">
            <Volume2 className="h-4 w-4" /> Voice
          </TabsTrigger>
          <TabsTrigger value="training" className="gap-1.5">
            <Database className="h-4 w-4" /> Training media
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-1.5">
            <BarChart3 className="h-4 w-4" /> Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="mt-4">
          {hub.photos.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No photos yet — generate a face or attach gallery uploads.
            </Card>
          ) : (
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-5">
              {hub.photos.map((ph) => (
                <div key={ph.id} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/media/${ph.mediaAssetId}/public`}
                    alt={ph.fileName ?? "persona photo"}
                    className="aspect-[3/4] w-full rounded-lg border object-cover"
                  />
                  <Badge variant="secondary" className="absolute left-1.5 top-1.5 text-[10px]">
                    {ph.role.replace("_", " ")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="videos" className="mt-4">
          {hub.videos.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No videos yet — runs a batch with this persona as the influencer.
            </Card>
          ) : (
            <div className="space-y-2">
              {hub.videos.map((v) => (
                <Card key={v.id} className="flex items-center gap-4 p-3">
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    {v.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground/40">
                        <Film className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {v.productName ?? "Product"} — {v.formulaName ?? "formula"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.batchName ?? "batch"} · {v.jobType}
                      {v.posted ? " · posted" : ""}
                    </p>
                  </div>
                  <Badge className={STATUS_BADGE[v.status] ?? ""}>{v.status}</Badge>
                  {v.finalUrl && (
                    <a href={`/api/videos/${v.id}`} target="_blank" rel="noreferrer" className="shrink-0">
                      <Button size="sm" variant="outline">
                        <Play className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="voice" className="mt-4">
          <Card className="max-w-md space-y-3 p-4">
            <p className="text-sm font-medium">Persona voice</p>
            <p className="text-xs text-muted-foreground">
              Used when this persona is picked for a batch — wins over the formula&apos;s default voice.
            </p>
            <select
              value={persona.voiceId ?? ""}
              onChange={(e) => swapVoice(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">No voice</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="mt-4">
          <Card className="mb-4 space-y-3 p-4">
            <div><p className="text-sm font-medium">Train Fish Audio voice</p><p className="text-xs text-muted-foreground">Select multiple videos or audio samples. Video audio is extracted in your browser, then uploaded to Fish Audio as a private voice model.</p></div>
            <div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={trainFishVoice} disabled={training || selectedTraining.size === 0 || persona.consentStatus !== "authorized"}>{training ? "Training…" : `Train selected (${selectedTraining.size})`}</Button>{persona.voiceProvider === "fish_audio" && persona.voiceModelId && <Badge variant="secondary">Fish model connected</Badge>}</div>
            {persona.consentStatus !== "authorized" && <p className="text-xs text-amber-700">Set authorization to Authorized in the Creator Profile before training.</p>}
            {trainingMessage && <p className="text-xs text-muted-foreground">{trainingMessage}</p>}
          </Card>
          {hub.trainingMedia.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No training videos or voice samples have been attached.
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {hub.trainingMedia.map((asset) => (
                <Card key={asset.id} className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex min-w-0 items-center gap-2"><input type="checkbox" checked={selectedTraining.has(asset.id)} onChange={() => setSelectedTraining((current) => { const next = new Set(current); if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id); return next; })} /><p className="truncate text-sm font-medium">{asset.fileName ?? "Training asset"}</p></label>
                    <Badge variant="secondary">{asset.role.replace("_", " ")}</Badge>
                  </div>
                  {asset.role === "training_video" ? (
                    <video controls preload="metadata" className="aspect-video w-full rounded-md bg-black" src={`/api/media/${asset.mediaAssetId}/public`} />
                  ) : (
                    <audio controls className="w-full" src={`/api/media/${asset.mediaAssetId}/public`} />
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <p className="mb-2 text-sm font-medium">Formulas using this persona</p>
              {hub.usage.formulas.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet.</p>
              ) : (
                <ul className="space-y-1">
                  {hub.usage.formulas.map((f) => (
                    <li key={f.id}>
                      <Link href={`/video-studio/formulas/${f.id}`} className="text-sm text-primary hover:underline">
                        {f.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-sm font-medium">Stats</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold">{hub.usage.formulas.length}</p>
                  <p className="text-xs text-muted-foreground">Formulas</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{hub.usage.batches}</p>
                  <p className="text-xs text-muted-foreground">Batches</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{hub.usage.posts}</p>
                  <p className="text-xs text-muted-foreground">Posts</p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
