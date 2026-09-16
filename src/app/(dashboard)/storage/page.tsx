"use client";

import { useEffect, useState } from "react";
import { HardDrive, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { resolveActiveWorkspace } from "@/lib/active-workspace";

type Usage = { totalBytes: number; byType: Record<string, { bytes: number; count: number }>; limits: { hobbyStorageBytes: number; hobbyTransferBytes: number; maxUploadBytes: number } };
const formatBytes = (bytes: number) => bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(bytes > 1024 ** 3 ? 2 : 1)} MB`;

export default function StoragePage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { const workspaces = await fetch("/api/workspaces").then((r) => r.ok ? r.json() : []); const workspace = resolveActiveWorkspace(workspaces); if (!workspace) return; const response = await fetch(`/api/storage/usage?workspaceId=${workspace.id}`); if (!response.ok) { setError("Could not load storage usage"); return; } setUsage(await response.json()); })(); }, []);
  if (error) return <div className="p-6 text-sm text-destructive">{error}</div>;
  if (!usage) return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const percent = Math.min(100, (usage.totalBytes / usage.limits.hobbyStorageBytes) * 100);
  return <div className="space-y-6 p-6 lg:p-8"><div><h1 className="text-2xl font-bold tracking-tight">Storage</h1><p className="text-sm text-muted-foreground">Track media before the Vercel Blob free tier becomes a bottleneck.</p></div><Card className="space-y-3 p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><HardDrive className="h-5 w-5" /><span className="font-medium">Vercel Blob storage</span></div><span className="text-sm">{formatBytes(usage.totalBytes)} / 1,000 MB</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${percent >= 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${percent}%` }} /></div><p className="text-xs text-muted-foreground">{percent.toFixed(1)}% of the Hobby storage allowance. This is stored-file usage, not your local archive.</p></Card><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(usage.byType).map(([type, value]) => <Card key={type} className="p-4"><p className="text-xs capitalize text-muted-foreground">{type}</p><p className="mt-1 text-xl font-semibold">{formatBytes(value.bytes)}</p><p className="text-xs text-muted-foreground">{value.count} files</p></Card>)}</div><Card className="p-5"><p className="font-medium">Processing guidance</p><p className="mt-2 text-sm text-muted-foreground">Keep source TikTok videos in an external archive (Cloudflare R2, Backblaze B2, or a local drive). Upload only cleaned speech clips and approved media to Symphony. Video files with an audio stream can be extracted and reviewed as speech, music, mixed, or silent before voice training.</p></Card></div>;
}
