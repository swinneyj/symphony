"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PersonasTab, type CreatorProfile } from "@/components/personas-tab";
import { resolveActiveWorkspace } from "@/lib/active-workspace";

type Voice = { id: string; name: string; provider: string };

export default function CreatorsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCreators = useCallback(async (id: string) => {
    const response = await fetch(`/api/creators?workspaceId=${id}`);
    if (response.ok) setCreators(await response.json());
  }, []);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/workspaces");
      const workspaces = response.ok ? await response.json() : [];
      const active = resolveActiveWorkspace(workspaces);
      if (active) {
        setWorkspaceId(active.id);
        const [creatorResponse, voiceResponse] = await Promise.all([
          fetch(`/api/creators?workspaceId=${active.id}`),
          fetch(`/api/voices?workspaceId=${active.id}`),
        ]);
        if (creatorResponse.ok) setCreators(await creatorResponse.json());
        if (voiceResponse.ok) setVoices(await voiceResponse.json());
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) {
    return <div className="p-6 text-sm text-muted-foreground">Create or join a workspace to add creators.</div>;
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Creators</h1>
        <p className="text-sm text-muted-foreground">
          Manage authorized creator clones, reference media, voice bindings, and avatar providers.
        </p>
      </div>
      <PersonasTab
        workspaceId={workspaceId}
        personas={creators}
        voices={voices}
        onChanged={() => loadCreators(workspaceId)}
      />
    </div>
  );
}
