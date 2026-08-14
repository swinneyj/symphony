/**
 * Formula Studio agent prompt builder — PURE (no imports).
 * Shared by the server agent (src/lib/video/formula-agent.ts) and the
 * builder page's client-side cost estimate so the pre-flight estimate
 * counts the EXACT prompt the LLM will see.
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

export function buildPrompt(currentGraph: unknown, userPrompt: string): string {
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
