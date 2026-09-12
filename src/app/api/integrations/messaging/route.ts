import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products, videoBatchJobs, workspaceMembers } from "@/db/schema";
import { flagJobs } from "@/lib/market/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Unified messaging ingress.
 * Configure MESSAGING_WEBHOOK_SECRET, MESSAGING_WORKSPACE_ID and
 * MESSAGING_USER_ID. Telegram sends JSON, Slack slash commands send
 * application/x-www-form-urlencoded, and iMessage relays can send JSON.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = request.headers.get("x-messaging-source") ?? inferSource(request);
  const payload = await parsePayload(request);
  const text = extractText(source, payload);
  const links = [...new Set(text.match(/https?:\/\/[^\s<>]+/gi) ?? [])].map((link) => link.replace(/[),.]+$/, ""));
  const productLink = links.find((link) => /tiktok\.com/i.test(link));
  if (!productLink) return await reply(source, payload, "Send a TikTok Shop product link to start the Image Studio flow.");

  const workspaceId = process.env.MESSAGING_WORKSPACE_ID;
  const configuredUserId = process.env.MESSAGING_USER_ID;
  if (!workspaceId) {
    return await reply(source, payload, "Messaging is not configured yet: set MESSAGING_WORKSPACE_ID.", 503);
  }

  try {
    const members = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)).limit(20);
    const userId = members.some((member) => member.userId === configuredUserId) ? configuredUserId : members[0]?.userId;
    if (!userId) throw new Error("No members were found in MESSAGING_WORKSPACE_ID");
    const importResponse = await fetch(new URL("/api/products/import", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-symphony-integration-secret": process.env.MESSAGING_WEBHOOK_SECRET ?? "" },
      body: JSON.stringify({ workspaceId, userId, url: productLink }),
    });
    const importPayload = (await importResponse.json()) as { imported?: Array<typeof products.$inferSelect>; error?: string; failed?: Array<{ error?: string }> };
    const product = importPayload.imported?.[0];
    if (!importResponse.ok || !product) throw new Error(importPayload.failed?.[0]?.error ?? importPayload.error ?? "Product import failed");
    const [job] = await db.insert(videoBatchJobs).values({
      workspaceId,
      productId: product.id,
      jobType: "scene_render",
      status: "queued",
      metadata: {
        sourceImageUrl: product.originalImageUrl,
        referenceImageUrls: ((product.metadata ?? {}) as { galleryImageUrls?: string[] }).galleryImageUrls ?? [],
        productCleanup: true,
        quality: "pro",
        strictProvider: true,
        requestedImageModel: "gemini-3-pro-image",
        aspectRatio: "1:1",
        imageSize: "2K",
        noChain: true,
        imageStudio: true,
        scenePromptTemplate: "Create a clean catalog-quality product reference on a pure white seamless background. Preserve exact packaging, labels, logos, colors, proportions, and readable text. Remove promotional graphics, props, hands, people, scenery, and invented packaging. Center the complete physical products with a subtle grounding shadow.",
      },
    }).returning({ id: videoBatchJobs.id });
    await db.update(products).set({ status: "processing", updatedAt: new Date() }).where(eq(products.id, product.id));
    await flagJobs("video");
    return await reply(source, payload, `Imported ${product.name}. Nano Banana Pro is preparing the clean reference now. Product ID: ${product.id}. Job ID: ${job.id}`);
  } catch (error) {
    return await reply(source, payload, `Could not start the product flow: ${error instanceof Error ? error.message : "unknown error"}`, 422);
  }
}

function authorized(request: Request) {
  const secret = process.env.MESSAGING_WEBHOOK_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-webhook-secret") === secret ||
    request.headers.get("x-telegram-bot-api-secret-token") === secret;
}

function inferSource(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  return type.includes("application/x-www-form-urlencoded") ? "slack" : "telegram";
}

async function parsePayload(request: Request): Promise<Record<string, unknown>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(await request.text()));
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

function extractText(source: string, payload: Record<string, unknown>) {
  if (source === "telegram") return String((payload.message as { text?: string } | undefined)?.text ?? payload.text ?? "");
  return String(payload.text ?? payload.message ?? payload.body ?? "");
}

async function reply(source: string, payload: Record<string, unknown>, text: string, status = 200) {
  if (source === "telegram" && process.env.TELEGRAM_BOT_TOKEN) {
    const chatId = (payload.message as { chat?: { id?: number | string } } | undefined)?.chat?.id;
    if (chatId) {
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
      if (!response.ok) console.error("[messaging] Telegram sendMessage failed", response.status, (await response.text()).slice(0, 300));
    }
  }
  if (source === "slack" && payload.response_url) {
    await fetch(String(payload.response_url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ response_type: "in_channel", text }) });
  }
  return source === "slack" ? new NextResponse(JSON.stringify({ response_type: "in_channel", text }), { status, headers: { "content-type": "application/json" } }) : NextResponse.json({ ok: status < 400, text }, { status });
}
