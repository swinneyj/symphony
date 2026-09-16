import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import OpenAI, { toFile } from "openai";
import { normalizeOpenAIUsage, openAICost } from "../costs";
import type { BenchmarkPrompt, ModelId, ProviderOutput } from "../types";

export async function runOpenAI(
  model: Extract<ModelId, `gpt-image-${string}`>,
  test: BenchmarkPrompt,
  providerPrompt: string,
  root: string,
): Promise<ProviderOutput> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const common = {
    model,
    prompt: providerPrompt,
    size: test.requestedResolution,
    quality: process.env.BENCHMARK_OPENAI_QUALITY ?? "high",
    output_format: "png",
    ...(test.transparentBackground ? { background: "transparent" } : {}),
  };
  let response: Awaited<ReturnType<typeof client.images.generate>>;
  if (test.operation === "edit") {
    const paths = (test.referenceImages ?? []).map((path) => resolve(root, path));
    const uploads = await Promise.all(paths.map(async (path) => toFile(await readFile(path), basename(path))));
    const mask = test.maskImage
      ? await toFile(await readFile(resolve(root, test.maskImage)), basename(test.maskImage))
      : undefined;
    response = await client.images.edit({ ...common, image: uploads, ...(mask ? { mask } : {}) } as never);
  } else {
    response = await client.images.generate(common as never);
  }
  const image = response.data?.[0];
  if (!image?.b64_json) throw new Error("OpenAI Images API returned no b64_json image");
  if (!response.usage) throw new Error("OpenAI Images API returned no usage; refusing to estimate with an old calculator");
  const usage = normalizeOpenAIUsage(response.usage);
  return {
    bytes: Buffer.from(image.b64_json, "base64"),
    extension: "png",
    requestId: (response as unknown as { _request_id?: string })._request_id ?? null,
    usage,
    costUsd: openAICost(usage),
    costStatus: "actual",
  };
}
