"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/** Copies a shared formula into the viewer's workspace, then opens it in the Studio. */
export function RemixButton({ formulaId, name }: { formulaId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const remix = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/formulas/${formulaId}/remix`, { method: "POST" });
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(`/f/${formulaId}`)}`);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remix failed");
      toast.success(`Copied "${name}" to your workspace`);
      router.push(`/video-studio/builder?formulaId=${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remix failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={remix}
      disabled={busy}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
    >
      {busy ? "Copying…" : `Remix "${name}" in your workspace`}
    </button>
  );
}
