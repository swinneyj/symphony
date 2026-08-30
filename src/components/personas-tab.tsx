"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, Pencil, Trash2, Plus } from "lucide-react";
export interface Persona {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  faceImageUrl: string | null;
  faceRefUrls: string[] | null;
  voiceId: string | null;
  voiceName: string | null;
  voiceProvider: string | null;
  personaPrompt: string | null;
  isSystem: boolean | null;
  createdAt: string;
}

interface Voice {
  id: string;
  name: string;
  provider: string;
}

export function PersonasTab({
  workspaceId,
  personas,
  voices,
  onChanged,
}: {
  workspaceId: string;
  personas: Persona[];
  voices: Voice[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [voiceId, setVoiceId] = useState<string>("");
  // AI face generation state
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genUrls, setGenUrls] = useState<string[]>([]);
  const [editing, setEditing] = useState<Persona | null>(null);

  const reset = useCallback(() => {
    setName("");
    setDescription("");
    setPersonaPrompt("");
    setVoiceId("");
    setGenUrls([]);
    setGenError(null);
    setEditing(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const generateFaces = async () => {
    if (description.trim().length < 10) {
      setGenError("Describe the face first — at least 10 characters (e.g. '24-year-old blonde fitness creator').");
      return;
    }
    setGenLoading(true);
    setGenError(null);
    try {
      const res = await fetch("/api/personas/generate-face", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId, personaId: editing?.id, description: description.trim(), count: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setGenUrls(data.urls);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenLoading(false);
    }
  };

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const body = {
        workspaceId,
        name,
        description: description.trim() || undefined,
        personaPrompt: personaPrompt.trim() || undefined,
        voiceId: voiceId || undefined,
        ...(genUrls.length > 0 ? { faceImageUrl: genUrls[0], faceRefUrls: genUrls } : {}),
      };
      const res = editing
        ? await fetch(`/api/personas/${editing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/personas", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Save failed");
      }
      setOpen(false);
      onChanged();
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Persona) => {
    if (!confirm(`Delete persona "${p.name}"?`)) return;
    const res = await fetch(`/api/personas/${p.id}`, { method: "DELETE" });
    if (res.ok) onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          AI influencer personas — faces used in scene renders for consistent identity.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> New persona
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit ${editing.name}` : "New persona"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ava — fitness creator" />
              </div>
              <div>
                <label className="text-xs font-medium">
                  Face description <span className="text-muted-foreground">(used for AI generation)</span>
                </label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 24-year-old blonde fitness creator, athletic build, bright smile, TikTok UGC style"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={generateFaces} disabled={genLoading}>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {genLoading ? "Generating…" : genUrls.length > 0 ? "Regenerate faces" : "✨ Generate face with AI"}
                </Button>
                {genError && <span className="text-xs text-destructive">{genError}</span>}
              </div>
              {genUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {genUrls.map((u, i) => (
                    // Generated refs are private Blob URLs — the persona proxy
                    // serves them, but during creation they're new (no persona
                    // row yet), so show them via the raw URL fallback.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={u} alt={`face ${i + 1}`} className="aspect-[9/16] w-full rounded-lg object-cover border" />
                  ))}
                </div>
              )}
              <div>
                <label className="text-xs font-medium">Voice</label>
                <select
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">No voice</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Style prompt</label>
                <Textarea
                  value={personaPrompt}
                  onChange={(e) => setPersonaPrompt(e.target.value)}
                  placeholder="e.g. energetic, authentic, natural lighting, casual creator vibe"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create persona"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {personas.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No personas yet. Create your first AI influencer to use in video formulas.
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {personas.map((p) => (
            <Card key={p.id} className="group relative overflow-hidden">
              <Link href={`/video-studio/personas/${p.id}`} className="block">
                <div className="relative aspect-[3/4] bg-muted">
                  {p.faceImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/personas/${p.id}/image`} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl text-muted-foreground/40">{p.name[0]}</div>
                  )}
                  {p.isSystem && (
                    <Badge className="absolute left-2 top-2 bg-primary/90">System</Badge>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.voiceName ?? "No voice"} · {p.faceRefUrls?.length ?? 0} face refs
                  </p>
                </div>
              </Link>
              {!p.isSystem && (
                <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.preventDefault();
                      setEditing(p);
                      setName(p.name);
                      setDescription(p.description ?? "");
                      setPersonaPrompt(p.personaPrompt ?? "");
                      setVoiceId(p.voiceId ?? "");
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.preventDefault();
                      remove(p);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
