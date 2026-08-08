"use client";

// Formula Studio — node-graph builder for video formulas.
// Nodes: product → sceneRender → footage → script → voice → overlay →
// boomerang → output. The graph serializes to formula.nodeGraph and the
// batch executor flattens it back per product (see /api/batches).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";

type NodeType =
  | "product"
  | "sceneRender"
  | "footage"
  | "script"
  | "voice"
  | "overlay"
  | "boomerang"
  | "output";

const NODE_DEFS: Record<NodeType, { label: string; icon: string; blurb: string }> = {
  product: { label: "Product", icon: "📦", blurb: "Batch input — every product in the batch" },
  sceneRender: { label: "AI Image", icon: "🖼️", blurb: "Re-render product into a custom scene ($)" },
  footage: { label: "AI Video", icon: "🎬", blurb: "Animate the scene ($)" },
  script: { label: "Script", icon: "✍️", blurb: "Voiceover script — {product} {price} {features}" },
  voice: { label: "Voiceover", icon: "🎙️", blurb: "Text-to-speech ($0)" },
  overlay: { label: "Text Overlay", icon: "💬", blurb: "CTA burned on the video ($0)" },
  boomerang: { label: "Boomerang", icon: "↺", blurb: "Forward + reverse — 2x length ($0)" },
  output: { label: "Output", icon: "▶️", blurb: "Final 9:16 MP4 → Blob" },
};

const MOTION_OPTIONS = [
  { id: "none", label: "None (static)" },
  { id: "cardboardCutout", label: "Cardboard cutout" },
  { id: "floatSpin", label: "Float + spin" },
  { id: "blueDepth", label: "Blue depth" },
  { id: "earthZoom", label: "Earth zoom" },
  { id: "orbit360", label: "Orbit 360" },
];

const DEFAULT_POS = { x: 120, y: 140 };

function StudioNode({ id, data, selected }: NodeProps) {
  const type = data.type as NodeType;
  const def = NODE_DEFS[type];
  const summary = useMemo(() => {
    const d = data as Record<string, unknown>;
    if (type === "sceneRender") return (d.prompt as string)?.slice(0, 60) || "no scene prompt";
    if (type === "footage")
      return `${(d.motionPreset as string) ?? "none"} · ${(d.durationSec as number) ?? 6}s · ${(d.quality as string) ?? "standard"}`;
    if (type === "script") return (d.scriptTemplate as string)?.slice(0, 60) || "empty script";
    if (type === "voice") return (d.voiceName as string) || "default voice";
    if (type === "overlay") return (d.text as string)?.slice(0, 60) || "no text";
    return def.blurb;
  }, [data, type, def]);
  return (
    <div
      className={`w-56 rounded-lg border bg-white px-3 py-2 text-sm shadow-sm ${
        selected ? "border-blue-500 ring-2 ring-blue-200" : "border-zinc-300"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-zinc-400" />
      <div className="flex items-center gap-2 font-medium">
        <span>{def.icon}</span>
        <span>{def.label}</span>
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{summary}</p>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-zinc-400" />
    </div>
  );
}

const nodeTypes = { studio: StudioNode };

type FlatFormula = {
  id?: string;
  name: string;
  category: string;
  scriptTemplate: string;
  scenePromptTemplate: string | null;
  motionPreset: string;
  durationSec: number;
  quality: string;
  boomerang: boolean;
  overlayTemplate: string | null;
};

function graphToFlat(nodes: Node[]): Partial<FlatFormula> {
  const by = (t: string) => nodes.find((n) => (n.data as { type?: string }).type === t)?.data ?? {};
  const script = by("script") as { scriptTemplate?: string };
  const scene = by("sceneRender") as { prompt?: string };
  const footage = by("footage") as { motionPreset?: string; durationSec?: number; quality?: string };
  const overlay = by("overlay") as { text?: string };
  return {
    scriptTemplate: script.scriptTemplate ?? "",
    scenePromptTemplate: scene.prompt ?? null,
    motionPreset: footage.motionPreset ?? "none",
    durationSec: footage.durationSec ?? 6,
    quality: footage.quality ?? "standard",
    overlayTemplate: overlay.text ?? null,
    boomerang: nodes.some((n) => (n.data as { type?: string }).type === "boomerang"),
  };
}

function flatToGraph(f: FlatFormula) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let prev: string | null = null;
  const push = (type: NodeType, data: Record<string, unknown> = {}) => {
    const id = `${type}-${nodes.length + 1}`;
    nodes.push({
      id,
      type: "studio",
      position: { x: 60 + (nodes.length % 4) * 250, y: 60 + Math.floor(nodes.length / 4) * 130 },
      data: { type, ...data },
    });
    if (prev) edges.push({ id: `e-${prev}-${id}`, source: prev, target: id });
    prev = id;
  };
  push("product");
  if (f.scenePromptTemplate) push("sceneRender", { prompt: f.scenePromptTemplate });
  push("footage", { motionPreset: f.motionPreset ?? "none", durationSec: f.durationSec ?? 6, quality: f.quality ?? "standard" });
  push("script", { scriptTemplate: f.scriptTemplate });
  if (f.overlayTemplate) push("overlay", { text: f.overlayTemplate });
  if (f.boomerang) push("boomerang");
  push("output");
  return { nodes, edges };
}

function StudioInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [name, setName] = useState("");
  const [formulaId, setFormulaId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<Array<{ id: string; name: string }>>([]);

  // Load workspace + optional formula to edit.
  useEffect(() => {
    (async () => {
      const ws = await (await fetch("/api/workspaces")).json();
      if (!ws?.[0]?.id) return;
      setWorkspaceId(ws[0].id);
      const q = new URLSearchParams(window.location.search);
      const fid = q.get("formulaId");
      if (!fid) {
        // Fresh canvas with a default skeleton.
        const g = flatToGraph({ name: "", category: "generic", scriptTemplate: "Check this out — {product}. {features}", scenePromptTemplate: null, motionPreset: "none", durationSec: 6, quality: "standard", boomerang: false, overlayTemplate: null });
        setNodes(g.nodes);
        setEdges(g.edges);
        return;
      }
      setFormulaId(fid);
      const list = await (await fetch(`/api/formulas?workspaceId=${ws[0].id}`)).json();
      const f = (list ?? []).find((x: { id: string }) => x.id === fid);
      if (!f) return;
      setName(f.name);
      if (f.nodeGraph?.nodes?.length) {
        setNodes(f.nodeGraph.nodes.map((n: Node) => ({ ...n, type: "studio" })));
        setEdges(f.nodeGraph.edges ?? []);
      } else {
        const g = flatToGraph(f);
        setNodes(g.nodes);
        setEdges(g.edges);
      }
    })();
  }, [setNodes, setEdges]);

  // Voices for the voice node picker.
  useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/voices?workspaceId=${workspaceId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setVoices)
      .catch(() => {});
  }, [workspaceId]);

  const onConnect = useCallback(
    (conn: Connection) =>
      setEdges((eds) => {
        // Linear chain: one incoming edge per node.
        if (eds.some((e) => e.target === conn.target)) return eds;
        return addEdge({ ...conn, id: `e-${conn.source}-${conn.target}` }, eds);
      }),
    [setEdges]
  );

  const addNode = (type: NodeType) => {
    const count = nodes.length;
    setNodes((ns) => [
      ...ns,
      {
        id: `${type}-${count + 1}-${Date.now() % 10000}`,
        type: "studio",
        position: { x: DEFAULT_POS.x + (count % 4) * 40, y: DEFAULT_POS.y + (count % 4) * 40 },
        data: { type },
      },
    ]);
  };

  const patchSelected = (patchData: Record<string, unknown>) => {
    if (!selected) return;
    setNodes((ns) => ns.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...patchData } } : n)));
    setSelected((s) => (s ? { ...s, data: { ...s.data, ...patchData } } : s));
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name the formula first");
    if (!workspaceId) return toast.error("No workspace");
    const flat = graphToFlat(nodes);
    const body = {
      workspaceId,
      name: name.trim(),
      category: "generic",
      ...flat,
      nodeGraph: { nodes: nodes.map((n) => ({ ...n, type: "studio" })), edges },
    };
    setSaving(true);
    try {
      if (formulaId) {
        const res = await fetch(`/api/formulas/${formulaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Save failed");
        toast.success("Formula updated");
      } else {
        const res = await fetch("/api/formulas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
        setFormulaId(data.id);
        window.history.replaceState(null, "", `?formulaId=${data.id}`);
        toast.success("Formula created");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selData = (selected?.data ?? {}) as Record<string, unknown>;
  const selType = selData.type as NodeType | undefined;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/video-studio" className="text-sm text-muted-foreground hover:underline">
            ← Video Studio
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Formula name"
            className="h-9 w-64 rounded-md border border-input bg-transparent px-3 text-sm font-medium outline-none focus:border-blue-500"
          />
          {formulaId ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">saved</span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">new</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save formula"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Palette */}
        <div className="w-44 shrink-0 space-y-1.5 overflow-y-auto rounded-lg border bg-white p-2">
          <p className="px-1 text-xs font-medium text-zinc-400">NODES</p>
          {(Object.keys(NODE_DEFS) as NodeType[]).map((t) => (
            <button
              key={t}
              onClick={() => addNode(t)}
              className="flex w-full items-center gap-2 rounded-md border border-zinc-200 px-2 py-1.5 text-left text-sm hover:border-blue-400 hover:bg-blue-50"
              title={NODE_DEFS[t].blurb}
            >
              <span>{NODE_DEFS[t].icon}</span>
              <span>{NODE_DEFS[t].label}</span>
            </button>
          ))}
          <p className="mt-2 px-1 text-[11px] leading-snug text-zinc-400">
            Add nodes, connect source → target. Batch runs every product through the chain.
          </p>
        </div>

        {/* Canvas */}
        <div className="min-w-0 flex-1 rounded-lg border bg-zinc-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onSelectionChange={({ nodes: sel }) => setSelected(sel[0] ?? null)}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Config panel */}
        <div className="w-72 shrink-0 space-y-3 overflow-y-auto rounded-lg border bg-white p-3">
          {!selected ? (
            <p className="text-sm text-zinc-400">Select a node to configure it.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {NODE_DEFS[selType ?? "product"].icon} {NODE_DEFS[selType ?? "product"].label}
                </p>
                <button
                  onClick={() => {
                    setNodes((ns) => ns.filter((n) => n.id !== selected.id));
                    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
                    setSelected(null);
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete node
                </button>
              </div>

              {selType === "sceneRender" && (
                <div>
                  <Label>Scene prompt</Label>
                  <Textarea
                    rows={5}
                    value={(selData.prompt as string) ?? ""}
                    onChange={(e) => patchSelected({ prompt: e.target.value })}
                    placeholder="The ad opens with a first-person POV…"
                  />
                  <p className="mt-1 text-xs text-zinc-400">
                    Describes the AI-generated scene. Uses {`{product}`} {`{price}`} {`{features}`}.
                  </p>
                </div>
              )}

              {selType === "footage" && (
                <>
                  <div>
                    <Label>Motion preset</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      value={(selData.motionPreset as string) ?? "none"}
                      onChange={(e) => patchSelected({ motionPreset: e.target.value })}
                    >
                      {MOTION_OPTIONS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Duration (s)</Label>
                      <input
                        type="number"
                        min={3}
                        max={30}
                        value={(selData.durationSec as number) ?? 6}
                        onChange={(e) => patchSelected({ durationSec: Number(e.target.value) })}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      />
                    </div>
                    <div>
                      <Label>Quality</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                        value={(selData.quality as string) ?? "standard"}
                        onChange={(e) => patchSelected({ quality: e.target.value })}
                      >
                        <option value="standard">standard (720p)</option>
                        <option value="pro">pro (1080p)</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {selType === "script" && (
                <div>
                  <Label>Script template</Label>
                  <Textarea
                    rows={6}
                    value={(selData.scriptTemplate as string) ?? ""}
                    onChange={(e) => patchSelected({ scriptTemplate: e.target.value })}
                    placeholder="I just saw the same {product} at the store…"
                  />
                  <p className="mt-1 text-xs text-zinc-400">
                    Placeholders: {`{product}`} {`{price}`} {`{features}`} {`{store}`}
                  </p>
                </div>
              )}

              {selType === "voice" && (
                <div>
                  <Label>Voice</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    value={(selData.voiceId as string) ?? ""}
                    onChange={(e) => {
                      const v = voices.find((x) => x.id === e.target.value);
                      patchSelected({ voiceId: e.target.value, voiceName: v?.name ?? "" });
                    }}
                  >
                    <option value="">Default voice</option>
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selType === "overlay" && (
                <div>
                  <Label>CTA text</Label>
                  <input
                    value={(selData.text as string) ?? ""}
                    onChange={(e) => patchSelected({ text: e.target.value })}
                    placeholder="So sorry to those who paid full price for {product}…"
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-zinc-400">
                    Burned onto the video, bottom third. Variables: {`{product}`} {`{price}`}
                  </p>
                </div>
              )}

              {selType === "boomerang" && (
                <p className="text-sm text-zinc-500">
                  Play forward then reversed — 2× length at $0. Drag an edge from it into Output.
                </p>
              )}
              {selType === "product" && (
                <p className="text-sm text-zinc-500">
                  Every product in the batch flows through this chain automatically.
                </p>
              )}
              {selType === "output" && (
                <p className="text-sm text-zinc-500">
                  Final assembled 9:16 MP4 with voiceover, overlay and boomerang applied.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FormulaStudioPage() {
  return (
    <ReactFlowProvider>
      <StudioInner />
    </ReactFlowProvider>
  );
}

// ── small UI helpers (avoid extra imports) ───────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-xs font-medium text-zinc-500">{children}</p>;
}

function Textarea({
  rows,
  value,
  onChange,
  placeholder,
}: {
  rows: number;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-500"
    />
  );
}

function Button({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
