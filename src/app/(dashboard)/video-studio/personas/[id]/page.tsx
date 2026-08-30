"use client";

// Persona detail page — asset hub for an AI influencer:
//   Photos — gallery from the persona_media junction (face refs + generated)
//   Videos — every render featuring the model (jobs metadata->>'personaId')
//   Voice  — the persona's voice row + swap
//   Usage  — formulas using this persona, batch history, published posts

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Film, Image as ImageIcon, Volume2, BarChart3, BadgeCheck, Sparkles, Play } from "lucide-react";
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
  videos: VideoRow[];
  voice: { id: string; name: string; provider: string } | null;
  usage: { formulas: { id: string; name: string }[]; batches: number; posts: number };
};

const STATUS_BADGE: Record<string, string> = {
  done: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  queued: "bg-zinc-100 text-zinc-600",
  running: "bg-blue-100 text-blue-700",
};

export default function PersonaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [persona, setPersona] = useState<any>(null);
  const [hub, setHub] = useState<HubPayload | null>(null);
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await fetch(`/api/personas/${id}`).then((r) => r.json());
      setPersona(p);
      const h = await fetch(`/api/personas/${id}/media`).then((r) => r.json());
      setHub(h);
      if (p.workspaceId) {
        const v = await fetch(`/api/voices?workspaceId=${p.workspaceId}`).then((r) => r.json());
        setVoices(v);
      }
    } catch {
      setError("Failed to load persona");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const swapVoice = async (voiceId: string) => {
    await fetch(`/api/personas/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ voiceId: voiceId || null }),
    });
    load();
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
      <Link href="/video-studio?tab=personas" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Personas
      </Link>

      <div className="flex items-start gap-5">
        <div className="h-32 w-32 overflow-hidden rounded-2xl border bg-muted">
          {persona.faceImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/personas/${id}/image`} alt={persona.name} className="h-full w-full object-cover" />
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
          </div>
          {persona.description && <p className="mt-1 text-sm text-muted-foreground">{persona.description}</p>}
          {persona.personaPrompt && (
            <p className="mt-1 text-xs text-muted-foreground/70">
              <Sparkles className="h-3 w-3 inline mr-1" />
              {persona.personaPrompt}
            </p>
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
