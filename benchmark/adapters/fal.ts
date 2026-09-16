import { resolve } from "node:path";
import { fileAsDataUri, aspectRatioForFal } from "../image-utils";
import type { BenchmarkPrompt, ProviderOutput, UsageRecord } from "../types";

type FalBillingEvent = {
  request_id?: string;
  output_units?: number;
  unit_price?: number;
  cost_estimate_nano_usd?: number;
  [key: string]: unknown;
};

const authHeaders = () => ({ authorization: `Key ${process.env.FAL_KEY}` });

async function waitForBillingEvent(requestId: string): Promise<{ usage: UsageRecord; cost: number } | null> {
  const url = new URL("https://api.fal.ai/v1/models/billing-events");
  url.searchParams.set("request_id", requestId);
  url.searchParams.set("limit", "10");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(30_000) });
    if (response.ok) {
      const body = await response.json() as { billing_events?: FalBillingEvent[] };
      const event = body.billing_events?.find((item) => item.request_id === requestId);
      if (event) {
        const cost = typeof event.cost_estimate_nano_usd === "number"
          ? event.cost_estimate_nano_usd / 1_000_000_000
          : (event.output_units ?? 0) * (event.unit_price ?? 0);
        return {
          usage: {
            source: "fal_billing_event",
            raw: event,
            falOutputUnits: event.output_units,
            falUnitPriceUsd: event.unit_price,
          },
          cost,
        };
      }
    }
    await new Promise((done) => setTimeout(done, 2_000 * (attempt + 1)));
  }
  return null;
}

export async function runFal(test: BenchmarkPrompt, providerPrompt: string, root: string): Promise<ProviderOutput> {
  const endpoint = test.operation === "edit" ? "fal-ai/nano-banana-2/edit" : "fal-ai/nano-banana-2";
  const input: Record<string, unknown> = {
    prompt: providerPrompt,
    num_images: 1,
    aspect_ratio: aspectRatioForFal(test.requestedResolution),
    output_format: "png",
    resolution: "2K",
    limit_generations: true,
  };
  if (test.operation === "edit") {
    input.image_urls = await Promise.all((test.referenceImages ?? []).map((path) => fileAsDataUri(resolve(root, path))));
  }
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });
  if (!submit.ok) throw new Error(`fal submit failed (${submit.status}): ${(await submit.text()).slice(0, 500)}`);
  const queued = await submit.json() as { request_id?: string; status_url?: string; response_url?: string };
  if (!queued.request_id) throw new Error("fal submit returned no request_id");
  const statusUrl = queued.status_url ?? `https://queue.fal.run/${endpoint}/requests/${queued.request_id}/status`;
  let responseUrl = queued.response_url;
  for (let poll = 0; poll < 180; poll += 1) {
    await new Promise((done) => setTimeout(done, 2_000));
    const response = await fetch(statusUrl, { headers: authHeaders(), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`fal status failed (${response.status})`);
    const status = await response.json() as { status?: string; response_url?: string; error?: unknown };
    if (status.status === "COMPLETED") { responseUrl = status.response_url ?? responseUrl; break; }
    if (status.status === "FAILED" || status.error) throw new Error(`fal generation failed: ${JSON.stringify(status.error ?? status)}`);
  }
  if (!responseUrl) responseUrl = `https://queue.fal.run/${endpoint}/requests/${queued.request_id}`;
  const resultResponse = await fetch(responseUrl, { headers: authHeaders(), signal: AbortSignal.timeout(60_000) });
  if (!resultResponse.ok) throw new Error(`fal result failed (${resultResponse.status}): ${(await resultResponse.text()).slice(0, 500)}`);
  const result = await resultResponse.json() as { images?: Array<{ url?: string }> };
  const imageUrl = result.images?.[0]?.url;
  if (!imageUrl) throw new Error("fal result returned no image URL");
  const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
  if (!imageResponse.ok) throw new Error(`fal image download failed (${imageResponse.status})`);
  const billing = await waitForBillingEvent(queued.request_id);
  return {
    bytes: Buffer.from(await imageResponse.arrayBuffer()),
    extension: "png",
    requestId: queued.request_id,
    usage: billing?.usage ?? { source: "unavailable", raw: null },
    costUsd: billing?.cost ?? null,
    costStatus: billing ? "actual" : "pending",
  };
}
