import { withLLM } from "@/lib/llm";
import { guessCategory } from "./presets";

/**
 * Script fill engine: renders a formula's scriptTemplate with product data.
 *
 * {features} is the only LLM-dependent slot. If an LLM key is present
 * (GEMINI_API_KEY, DEEPSEEK_API_KEY or OPENAI_API_KEY — see lib/llm.ts) we
 * ask for 2-3 short selling points constrained to the description; otherwise
 * we fall back to heuristic extraction (sentences <= 8 words) so the builder
 * works with zero keys.
 */

export type ScriptProduct = {
  name: string;
  description: string | null;
  price: string | null;
};

export type RenderedScript = {
  script: string;
  features: string[];
  llm: boolean;
};

async function llmFeatures(product: ScriptProduct): Promise<string[] | null> {
  const res = await withLLM("fill", (client, model) =>
    client.chat.completions.create({
      model,
      max_tokens: 120,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You write TikTok Shop video scripts. From the product description, extract 2-3 short selling points. Each selling point must be ≤8 words, must come ONLY from the given description (never invent claims), and must be ready to speak aloud. Return a JSON array of strings, nothing else.",
        },
        {
          role: "user",
          content: `Product: ${product.name}\nDescription: ${product.description ?? "(none)"}`,
        },
      ],
    })
  );
  if (!res) return null;

  const text = res.choices[0]?.message?.content?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text.replace(/^```(json)?|```$/g, "").trim());
    if (Array.isArray(parsed)) {
      const features = parsed
        .map((f: unknown) => String(f).trim())
        .filter((f: string) => f.length > 0 && f.length <= 60)
        .slice(0, 3);
      return features.length > 0 ? features : null;
    }
    return null;
}

function heuristicFeatures(product: ScriptProduct): string[] {
  const text = product.description || "";
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim().replace(/^[\s-]+/, ""))
    .filter((s) => s.length > 3 && s.length <= 60 && /\s/.test(s));

  // Prefer short, concrete sentences (≤8 words), then relax.
  const short = sentences.filter((s) => s.split(/\s+/).length <= 8);
  const pool = short.length >= 2 ? short : sentences;
  return pool.slice(0, 3);
}

export async function renderScript(
  template: string,
  product: ScriptProduct,
  opts: { llm?: boolean } = {}
): Promise<RenderedScript> {
  let features: string[];
  let llm = false;

  if (opts.llm !== false) {
    const fromLlm = await llmFeatures(product);
    if (fromLlm) {
      features = fromLlm;
      llm = true;
    } else {
      features = heuristicFeatures(product);
    }
  } else {
    features = heuristicFeatures(product);
  }

  const { category } = guessCategory(`${product.name} ${product.description ?? ""}`);
  const featuresText = features.length > 0 ? features.join(". ") + "." : "";

  const script = template
    .replace(/\{product\}/g, product.name.trim())
    .replace(/\{price\}/g, product.price?.trim() || "")
    .replace(/\{category\}/g, category)
    .replace(/\{features\}/g, featuresText)
    .replace(/\{store\}/g, "TikTok Shop")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { script, features, llm };
}
