"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sparkles, Pencil, Trash2, Plus, Upload } from "lucide-react";
export interface Persona {
  id: string;
  workspaceId: string | null;
  createdById?: string | null;
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

/**
 * Downscale/compress an uploaded face photo so N photos fit under Vercel's
 * serverless request-body cap (~4.5MB). Face refs are identity anchors for
 * renders — 1280px JPEG (q0.82) is plenty and lands ~150–400KB each.
 * If the file is already small or can't be decoded, pass it through untouched
 * (server-side size validation still applies).
 */
async function prepareFaceFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 300 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1280;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file; // not decodable here — let the server decide
  }
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
  // Raw private Blob URLs — what gets SAVED to the persona (served later via
  // the /api/personas/[id]/image Bearer proxy).
  const [genUrls, setGenUrls] = useState<string[]>([]);
  // Short-lived PRESIGNED URLs for <img> preview — raw private URLs 403 in a
  // browser (see lib/blob-presign.ts). Mirrors data.urls vs data.previewUrls.
  const [genPreviewUrls, setGenPreviewUrls] = useState<string[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [descLoading, setDescLoading] = useState(false);
  const [genModel, setGenModel] = useState("auto");
  const [editing, setEditing] = useState<Persona | null>(null);
  // Current user id — system personas (shared demo rows) can only be deleted
  // by the user who created them.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCurrentUserId(u?.id ?? null))
      .catch(() => setCurrentUserId(null));
  }, []);

  const reset = useCallback(() => {
    setName("");
    setDescription("");
    setPersonaPrompt("");
    setVoiceId("");
    setGenUrls([]);
    setGenPreviewUrls([]);
    setGenError(null);
    setGenModel("auto");
    setEditing(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const generateDescription = async () => {
    if (!name.trim()) {
      setGenError("Enter a persona name first (e.g. 'Ava — fitness creator').");
      return;
    }
    setDescLoading(true);
    setGenError(null);
    try {
      const res = await fetch("/api/personas/generate-description", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: name.trim(),
          model: genModel === "auto" ? undefined : genModel,
          // When the creator uploaded their own photos ("clone me" path), the
          // AI must describe the REAL person in them — not invent one from the
          // name. Sending the raw urls lets the server presign + vision-analyze.
          ...(genUrls.length > 0 ? { photoUrls: genUrls } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setDescription(data.description);
      setPersonaPrompt(data.personaPrompt ?? "");
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setDescLoading(false);
    }
  };

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
      setGenPreviewUrls(data.previewUrls?.length ? data.previewUrls : data.urls);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenLoading(false);
    }
  };

  // Upload 1–5 selfies/photos of a real person → private Blob → the persona's
  // face refs (identity anchor for scene renders). The "clone me" path: no AI
  // text-to-image needed — the refs ARE the person. Server presigns previews.
  const uploadFaces = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > 5) {
      setGenError("Upload at most 5 photos (2–5 gives the best identity consistency).");
      return;
    }
    setUploadLoading(true);
    setGenError(null);
    try {
      const form = new FormData();
      // Phone photos are 2–6MB each; Vercel's serverless body cap (~4.5MB for
      // the whole request) rejects 3+ raw photos with a non-JSON 413 before our
      // route even runs. Downscale to ≤1280px JPEG (~200–400KB) — face refs
      // only need ~1MP for identity anchoring in renders.
      const prepared = await Promise.all(Array.from(files).map(prepareFaceFile));
      for (const f of prepared) form.append("files", f);
      form.append("workspaceId", workspaceId);
      if (editing?.id) form.append("personaId", editing.id);
      const res = await fetch("/api/personas/upload-faces", { method: "POST", body: form });
      const text = await res.text();
      let data: { error?: string; urls?: string[]; previewUrls?: string[] } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        // Non-JSON body (e.g. platform 413 "Request Entity Too Large")
        throw new Error(`Upload failed (HTTP ${res.status}). Try fewer or smaller photos.`);
      }
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      if (!data.urls?.length) throw new Error("No photos were uploaded — try again");
      setGenUrls(data.urls);
      setGenPreviewUrls(data.previewUrls?.length ? data.previewUrls : data.urls);
      // DeepSeek is text-only — snap back to auto (vision) so the next
      // "Describe from my photos" run actually works.
      if (genModel === "deepseek-chat") setGenModel("auto");
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    try {
      const res = await fetch(`/api/personas/${p.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Delete failed (${res.status})`);
      }
      onChanged();
    } catch (e) {
      setGenError((e as Error).message);
    }
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
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="text-xs font-medium">
                    Face description <span className="text-muted-foreground">(used for AI generation)</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={genModel}
                      onChange={(e) => setGenModel(e.target.value)}
                      className="h-6 rounded-md border border-input bg-background px-1.5 text-[11px]"
                      title="Which model powers the AI generation"
                    >
                      <option value="auto">{genUrls.length > 0 ? "Auto (Gemini vision)" : "Auto (Gemini, free)"}</option>
                      <option value="gemini-3.6-flash">Gemini Flash</option>
                      <option value="deepseek-chat" disabled={genUrls.length > 0}>
                        {genUrls.length > 0 ? "DeepSeek (text-only)" : "DeepSeek"}
                      </option>
                      <option value="gpt-4o-mini">GPT-4o mini</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={generateDescription}
                      disabled={descLoading}
                      title={
                        genUrls.length > 0
                          ? "Describes the person in your uploaded photos — not an AI-invented persona"
                          : "Generates a face description from the name"
                      }
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      {descLoading ? "Writing…" : genUrls.length > 0 ? "✨ Describe from my photos" : "Generate with AI"}
                    </Button>
                  </div>
                </div>
                {genUrls.length > 0 && (
                  <p className="-mt-1 mb-1 text-[11px] text-muted-foreground">
                    Photos attached — AI describes the real person in them. Edit the text afterwards if needed.
                  </p>
                )}
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 24-year-old blonde fitness creator, athletic build, bright smile, TikTok UGC style"
                  rows={2}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={generateFaces} disabled={genLoading || uploadLoading}>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {genLoading ? "Generating…" : genUrls.length > 0 ? "Regenerate with AI" : "✨ Generate face with AI"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={genLoading || uploadLoading}
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  {uploadLoading ? "Uploading…" : "📷 Upload my photos"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => uploadFaces(e.target.files)}
                />
                {genError && <span className="text-xs text-destructive">{genError}</span>}
              </div>
              {genUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {genPreviewUrls.map((u, i) => (
                    // Generated refs are RAW private Blob URLs — a browser <img>
                    // 403s on those. The route returns short-lived PRESIGNED
                    // preview URLs for display; the raw urls are what get saved
                    // (served later via the /api/personas/[id]/image proxy).
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
          {personas.map((p) => {
            // System personas are shared demo rows — only their creator can
            // edit/delete them; workspace personas are manageable by anyone
            // with workspace access.
            const canManage = !p.isSystem || p.createdById === currentUserId;
            return (
              <Card key={p.id} className="group relative overflow-hidden">
                <Link href={`/video-studio/personas/${p.id}`} className="block">
                  <div
                    className={`relative bg-muted ${
                      p.faceImageUrl ? "aspect-[3/4]" : "aspect-[4/3]"
                    }`}
                  >
                    {p.faceImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/personas/${p.id}/image?workspaceId=${workspaceId}`}
                        alt={p.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted-foreground/10 text-lg font-semibold text-muted-foreground/60">
                          {p.name[0]}
                        </div>
                        <span className="text-xs text-muted-foreground/50">No face yet</span>
                      </div>
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
                {canManage && (
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
            );
          })}
        </div>
      )}
    </div>
  );
}
