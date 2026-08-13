import { withLLM } from "@/lib/llm";

/**
 * Formula Studio agent — rewires a formula node graph from a natural
 * language prompt ("make it a boomerang with a sale CTA"). Returns a
 * sanitized graph the Studio can apply directly.
 */

export const FORMULA_NODE_TYPES = [
  "product",
  "sceneRender",
  "footage",
  "script",
  "voice",
  "overlay",
  "boomerang",
  "output",
] as const;

export type AgentGraph = {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
};

export type AgentResult = {
  nodes: AgentGraph["nodes"];
  edges: AgentGraph["edges"];
  summary: string;
};

function buildPrompt(currentGraph: unknown, userPrompt: string): string {
  return `You are the Formula Studio agent for Symphony, a TikTok Shop video formula builder.

A formula is a LINEAR chain of nodes: product → sceneRender → footage → script → voice → overlay → boomerang → output.

Node types and their data fields:
- product: {} — batch input, product chosen at run time
- sceneRender: { prompt } — AI image scene description (natural store environment, no price tags/people/text)
- footage: { motionPreset ("none"|"cardboardCutout"|"floatSpin"|"blueDepth"|"earthZoom"|"orbit360"), durationSec (3-60), quality ("standard"|"pro") }
- script: { scriptTemplate } — voiceover script; supports {product} {price} {features} placeholders
- voice: { voiceId } — optional voiceover voice
- overlay: { text } — CTA text burned onto the video; supports {product} {price}
- boomerang: {} — presence means play forward then reversed (doubles length, $0)
- output: {} — terminal node

Rules:
- Keep the chain linear; every node has one outgoing edge except output.
- PRESERVE existing nodes and their ids unless the user asks to change them.
- New node ids: "<type>-<n>" (e.g. "boomerang-5").
- Lay nodes left-to-right: x starts ~80 and increases ~260 per node, y ~120.
- Include every kept node and any added nodes; output must be terminal.
- Respond with ONLY JSON: {"nodes":[{id,type,position:{x,y},data:{}}],"edges":[{id,source,target}],"summary":"one sentence on what you changed"}

Current graph JSON:
${JSON.stringify(currentGraph)}

User request: ${userPrompt}`;
}

function sanitizeGraph(raw: unknown): AgentGraph | null {
  const g = raw as {
    nodes?: unknown[];
    edges?: unknown[];
  };
  if (!Array.isArray(g?.nodes) || g.nodes.length === 0) return null;

  const seen = new Set<string>();
  const nodes: AgentGraph["nodes"] = [];
  for (const n of g.nodes as Array<Record<string, unknown>>) {
    const type = typeof n.type === "string" ? n.type : "";
    if (!(FORMULA_NODE_TYPES as readonly string[]).includes(type)) continue;
    const id = typeof n.id === "string" && n.id ? n.id : `${type}-${nodes.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pos = (n.position ?? {}) as Record<string, unknown>;
    nodes.push({
      id,
      type,
      position: {
        x: typeof pos.x === "number" ? pos.x : 80 + nodes.length * 260,
        y: typeof pos.y === "number" ? pos.y : 120,
      },
      data: (n.data ?? {}) as Record<string, unknown>,
    });
  }
  if (nodes.length === 0) return null;

  // Terminal node guarantee: append output if missing.
  if (!nodes.some((n) => n.type === "output")) {
    nodes.push({
      id: `output-${nodes.length + 1}`,
      type: "output",
      position: { x: 80 + nodes.length * 260, y: 120 },
      data: {},
    });
  }

  // Edges: keep only valid refs; else auto-wire by x-position (linear chain).
  const valid = new Set(nodes.map((n) => n.id));
  const edges: AgentGraph["edges"] = [];
  for (const e of (g.edges ?? []) as Array<Record<string, unknown>>) {
    const source = typeof e.source === "string" ? e.source : "";
    const target = typeof e.target === "string" ? e.target : "";
    if (valid.has(source) && valid.has(target) && source !== target) {
      edges.push({ id: `e-${source}-${target}`, source, target });
    }
  }
  if (edges.length === 0) {
    const ordered = [...nodes].sort((a, b) => a.position.x - b.position.x);
    for (let i = 0; i < ordered.length - 1; i++) {
      edges.push({ id: `e-${ordered[i].id}-${ordered[i + 1].id}`, source: ordered[i].id, target: ordered[i + 1].id });
    }
  }
  return { nodes, edges };
}

export async function runFormulaAgent(
  currentGraph: unknown,
  userPrompt: string
): Promise<AgentResult> {
  const res = await withLLM("agent", (client, model) =>
    client.chat.completions.create({
      model,
      temperature: 0.3,
      max_tokens: 1800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You output strict JSON only." },
        { role: "user", content: buildPrompt(currentGraph, userPrompt) },
      ],
    })
  );
  if (!res) {
    throw new Error(
      "All AI providers are unavailable (quota exceeded or no keys configured) — try again in a moment"
    );
  }

  const text = res.choices[0]?.message?.content ?? "";
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Strip markdown fences if the model wrapped the JSON.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        parsed = JSON.parse(fenced[1]);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed) throw new Error("Agent returned unparseable JSON");

  const graph = sanitizeGraph(parsed);
  if (!graph) throw new Error("Agent returned an empty or invalid graph");

  const summary =
    typeof (parsed as { summary?: unknown }).summary === "string"
      ? ((parsed as { summary: string }).summary as string)
      : "Graph updated";
  return { ...graph, summary };
}
