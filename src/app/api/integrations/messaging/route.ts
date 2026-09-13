import { NextResponse } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, videoBatches, videoBatchJobs, workspaceMembers } from "@/db/schema";
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
  if (source === "telegram" && (payload.callback_query as { data?: string } | undefined)?.data) {
    return await handleTelegramCallback(payload);
  }
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
    // Call the importer on this immutable deployment, not the public alias.
    // Otherwise a freshly promoted webhook can briefly self-fetch an older
    // cached deployment from the custom domain.
    const deploymentOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.url;
    const importResponse = await fetch(new URL("/api/products/import", deploymentOrigin), {
      method: "POST",
      headers: { "content-type": "application/json", "x-symphony-integration-secret": process.env.MESSAGING_WEBHOOK_SECRET ?? "" },
      body: JSON.stringify({ workspaceId, userId, url: productLink }),
    });
    const importPayload = (await importResponse.json()) as { imported?: Array<typeof products.$inferSelect>; error?: string; failed?: Array<{ error?: string }> };
    const product = importPayload.imported?.[0];
    if (!importResponse.ok || !product) throw new Error(importPayload.failed?.[0]?.error ?? importPayload.error ?? "Product import failed");
    if (product.processedImageUrl) {
      return await reply(source, payload, `Already ready: ${product.name}. The clean product reference is available in Image Studio. Product ID: ${product.id}`);
    }
    const [activeJob] = await db
      .select({ id: videoBatchJobs.id })
      .from(videoBatchJobs)
      .where(and(
        eq(videoBatchJobs.workspaceId, workspaceId),
        eq(videoBatchJobs.productId, product.id),
        eq(videoBatchJobs.jobType, "scene_render"),
        inArray(videoBatchJobs.status, ["queued", "running"]),
      ))
      .orderBy(desc(videoBatchJobs.createdAt))
      .limit(1);
    if (activeJob) {
      return await reply(source, payload, `Already imported ${product.name}. The clean-reference job is still running. Product ID: ${product.id}. Job ID: ${activeJob.id}`);
    }
    const [job] = await db.insert(videoBatchJobs).values({
      workspaceId,
      productId: product.id,
      jobType: "scene_render",
      status: "queued",
      metadata: {
        sourceImageUrl: product.originalImageUrl,
        referenceImageUrls: ((product.metadata ?? {}) as { galleryImageUrls?: string[] }).galleryImageUrls ?? [],
        productCleanup: true,
        fidelityLock: true,
        quality: "pro",
        strictProvider: true,
        requestedImageModel: "gemini-3-pro-image",
        aspectRatio: "1:1",
        imageSize: "2K",
        noChain: true,
        imageStudio: true,
        telegramChatId: telegramChatId(payload),
        telegramStage: "clean_reference",
        productName: product.name,
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

async function handleTelegramCallback(payload: Record<string, unknown>) {
  const callback = payload.callback_query as { id?: string; data?: string; message?: { chat?: { id?: number | string } } };
  const data = callback.data ?? "";
  const chatId = callback.message?.chat?.id ? String(callback.message.chat.id) : "";
  const workspaceId = process.env.MESSAGING_WORKSPACE_ID;
  if (!workspaceId || !chatId) return NextResponse.json({ ok: true });
  try {
    const members = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)).limit(20);
    const createdById = members.some((member) => member.userId === process.env.MESSAGING_USER_ID)
      ? process.env.MESSAGING_USER_ID
      : members[0]?.userId;
    if (!createdById) throw new Error("No workspace member is configured for Telegram approvals");
    const parts = data.split(":");
    const action = parts[0];
    const jobId = action === "finish" ? parts[2] : parts[1];
    const [job] = await db.select().from(videoBatchJobs).where(eq(videoBatchJobs.id, jobId ?? "")).limit(1);
    if (!job || job.workspaceId !== workspaceId || job.status !== "done") {
      await telegramCallback(callback.id, "This result is no longer available.");
      return NextResponse.json({ ok: true });
    }
    const meta = (job.metadata ?? {}) as Record<string, unknown>;
    if (action === "img_approve") {
      const [existing] = await db.select({ id: videoBatchJobs.id }).from(videoBatchJobs).where(and(eq(videoBatchJobs.workspaceId, workspaceId), eq(videoBatchJobs.jobType, "scene_render"), sql`${videoBatchJobs.metadata}->>'approvalSourceJobId' = ${job.id}`)).limit(1);
      if (existing) {
        await telegramCallback(callback.id, "Already approved.");
        return NextResponse.json({ ok: true });
      }
      const [batch] = await db.insert(videoBatches).values({ workspaceId, createdById, name: "Telegram lifestyle image", quality: "standard", provider: "kling", status: "queued", totalCount: 1 }).returning({ id: videoBatches.id });
      const prompt = String(meta.telegramPrompt ?? (String(meta.productName ?? "").toLowerCase().includes("stroller") ? "Place the stroller on a beautiful vibrant park walkway in warm natural daylight with lush greenery and realistic contact shadows. No baby, children, hands, extra products, or text." : "Place the exact product in a natural, category-appropriate lifestyle setting with realistic lighting and contact shadows. Preserve all product details and branding. No people or text."));
      const [child] = await db.insert(videoBatchJobs).values({ batchId: batch.id, workspaceId, productId: job.productId, jobType: "scene_render", status: "queued", metadata: { sourceImageUrl: job.sceneImageUrl, scenePromptTemplate: prompt, quality: "pro", strictProvider: true, requestedImageModel: "gemini-3-pro-image", aspectRatio: "9:16", imageSize: "2K", noChain: true, imageStudio: true, telegramChatId: chatId, telegramStage: "lifestyle", telegramPrompt: prompt, productName: String(meta.productName ?? "Product"), approvalSourceJobId: job.id } }).returning({ id: videoBatchJobs.id });
      await flagJobs("video");
      await telegramCallback(callback.id, "Approved. Generating the lifestyle image now.");
      return NextResponse.json({ ok: true, jobId: child.id });
    }
    if (action === "video_approve") {
      const [existing] = await db.select({ id: videoBatchJobs.id }).from(videoBatchJobs).where(and(eq(videoBatchJobs.workspaceId, workspaceId), eq(videoBatchJobs.jobType, "footage"), sql`${videoBatchJobs.metadata}->>'approvalSourceJobId' = ${job.id}`)).limit(1);
      if (existing) {
        await telegramCallback(callback.id, "Already approved.");
        return NextResponse.json({ ok: true });
      }
      const [batch] = await db.insert(videoBatches).values({ workspaceId, createdById, name: "Telegram product video", quality: "standard", provider: "kling", status: "queued", totalCount: 1 }).returning({ id: videoBatches.id });
      const prompt = String(meta.telegramPrompt ?? "Subtle natural product motion, stable product geometry, realistic camera movement, and smooth physically believable motion.");
      const [child] = await db.insert(videoBatchJobs).values({ batchId: batch.id, workspaceId, productId: job.productId, jobType: "footage", status: "queued", metadata: { sceneImageUrl: job.sceneImageUrl, videoEngine: "kling_v3", resolution: "720p", aspectRatio: "9:16", durationSec: 5, noChain: true, imageStudio: true, prompt, telegramChatId: chatId, telegramProductName: String(meta.productName ?? "Product"), approvalSourceJobId: job.id } }).returning({ id: videoBatchJobs.id });
      await flagJobs("video");
      await telegramCallback(callback.id, "Approved. Generating the video now.");
      return NextResponse.json({ ok: true, jobId: child.id });
    }
    if (action === "finish") {
      const mode = parts[1] === "reverse" ? "reverse" : "none";
      const [existing] = await db.select({ id: videoBatchJobs.id }).from(videoBatchJobs).where(and(eq(videoBatchJobs.workspaceId, workspaceId), eq(videoBatchJobs.jobType, "batch_video"), sql`${videoBatchJobs.metadata}->>'approvalSourceJobId' = ${job.id}`)).limit(1);
      if (existing) {
        await telegramCallback(callback.id, "Already queued.");
        return NextResponse.json({ ok: true });
      }
      const [batch] = await db.insert(videoBatches).values({ workspaceId, createdById, name: `Telegram final (${mode})`, quality: "standard", provider: "kling", status: "queued", totalCount: 1 }).returning({ id: videoBatches.id });
      const [child] = await db.insert(videoBatchJobs).values({ batchId: batch.id, workspaceId, productId: job.productId, jobType: "batch_video", status: "queued", metadata: { footageUrl: job.footageUrl, extendMode: mode, imageStudio: true, telegramChatId: chatId, telegramProductName: String(meta.telegramProductName ?? "Product"), approvalSourceJobId: job.id } }).returning({ id: videoBatchJobs.id });
      await flagJobs("video");
      await telegramCallback(callback.id, "Finishing the video now.");
      return NextResponse.json({ ok: true, jobId: child.id });
    }
    await telegramCallback(callback.id, "Unknown approval action.");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[messaging] callback error", error);
    await telegramCallback(callback.id, "Could not start the next step.");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

function telegramChatId(payload: Record<string, unknown>) {
  return String((payload.message as { chat?: { id?: number | string } } | undefined)?.chat?.id ?? "");
}

async function telegramCallback(id: string | undefined, text: string) {
  if (!id || !process.env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callback_query_id: id, text }) });
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
