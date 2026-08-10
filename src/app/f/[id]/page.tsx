import { notFound } from "next/navigation";
import { db } from "@/db";
import { videoFormulas } from "@/db/schema";
import { eq } from "drizzle-orm";
import { RemixButton } from "./remix-button";

const NODE_LABELS: Record<string, { icon: string; label: string }> = {
  product: { icon: "📦", label: "Product" },
  sceneRender: { icon: "🖼️", label: "AI Image" },
  footage: { icon: "🎬", label: "AI Video" },
  script: { icon: "✍️", label: "Script" },
  voice: { icon: "🎙️", label: "Voiceover" },
  overlay: { icon: "💬", label: "Text Overlay" },
  boomerang: { icon: "↺", label: "Boomerang" },
  output: { icon: "▶️", label: "Output" },
};

/** Public formula share page — unlisted by default, no auth needed to view. */
export default async function FormulaSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [formula] = await db
    .select()
    .from(videoFormulas)
    .where(eq(videoFormulas.id, id))
    .limit(1);
  if (!formula) notFound();

  // Linear chain order: follow edges from the node with no incoming edge.
  const graph = formula.nodeGraph as
    | { nodes?: Array<{ id: string; type: string }>; edges?: Array<{ source: string; target: string }> }
    | null;
  const chain: string[] = [];
  if (graph?.nodes?.length) {
    const targets = new Set(graph.edges?.map((e) => e.target) ?? []);
    const start = graph.nodes.find((n) => !targets.has(n.id)) ?? graph.nodes[0];
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const next = new Map((graph.edges ?? []).map((e) => [e.source, e.target]));
    let cur = start.id;
    for (let i = 0; i < graph.nodes.length && cur; i++) {
      const node = byId.get(cur);
      if (!node) break;
      chain.push(node.type);
      cur = next.get(cur) ?? "";
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Symphony · Formula
        </p>
        <span className="text-xs text-muted-foreground">unlisted share link</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{formula.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground capitalize">
          {formula.category ?? "formula"} · {formula.durationSec ?? 6}s ·{" "}
          {formula.quality ?? "standard"}
          {formula.boomerang && " · ↺ boomerang"}
          {formula.overlayTemplate && " · TXT overlay"}
          {formula.isSystem && " · system"}
        </p>
      </div>

      {chain.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          {chain.map((type, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="rounded bg-background px-2 py-1">
                {NODE_LABELS[type]?.icon} {NODE_LABELS[type]?.label ?? type}
              </span>
              {i < chain.length - 1 && <span className="text-muted-foreground">→</span>}
            </span>
          ))}
        </div>
      )}

      <section className="space-y-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Script template
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">
            {formula.scriptTemplate}
          </p>
        </div>
        {formula.scenePromptTemplate && (
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Scene prompt
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {formula.scenePromptTemplate}
            </p>
          </div>
        )}
        {formula.overlayTemplate && (
          <div className="rounded-lg border p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Text overlay
            </p>
            <p className="mt-2 text-sm">{formula.overlayTemplate}</p>
          </div>
        )}
      </section>

      <RemixButton name={formula.name} formulaId={formula.id} />
    </main>
  );
}
