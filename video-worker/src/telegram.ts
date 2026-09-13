import { blobToken } from "./env.js";

const token = () => process.env.TELEGRAM_BOT_TOKEN;

async function send(method: string, body: FormData | Record<string, unknown>) {
  const bot = token();
  if (!bot) return;
  const init: RequestInit = body instanceof FormData
    ? { method: "POST", body }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const response = await fetch(`https://api.telegram.org/bot${bot}/${method}`, init);
  if (!response.ok) console.error(`[telegram] ${method} failed: ${response.status}`);
}

async function upload(method: "sendPhoto" | "sendVideo", chatId: string, field: "photo" | "video", url: string, caption: string, keyboard?: unknown[]) {
  const response = await fetch(url, { headers: blobToken() ? { Authorization: `Bearer ${blobToken()}` } : undefined });
  if (!response.ok) throw new Error(`telegram asset fetch failed: ${response.status}`);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append(field, new Blob([await response.arrayBuffer()], { type: response.headers.get("content-type") ?? (field === "video" ? "video/mp4" : "image/png") }), `${field}.${field === "video" ? "mp4" : "png"}`);
  if (caption) form.append("caption", caption);
  if (keyboard) form.append("reply_markup", JSON.stringify({ inline_keyboard: keyboard }));
  await send(method, form);
}

export async function notifyTelegramImage(chatId: string, url: string, caption: string, callbackData?: string) {
  await upload("sendPhoto", chatId, "photo", url, caption, callbackData ? [[{ text: "Approve", callback_data: callbackData }]] : undefined);
}

export async function notifyTelegramVideo(chatId: string, url: string, caption: string) {
  await upload("sendVideo", chatId, "video", url, caption);
}

export async function notifyTelegramMessage(chatId: string, text: string, callbackData?: string) {
  await send("sendMessage", {
    chat_id: chatId,
    text,
    ...(callbackData ? { reply_markup: { inline_keyboard: [[{ text: "Approve video", callback_data: callbackData }]] } } : {}),
  });
}

export async function notifyTelegramOptions(chatId: string, text: string, options: Array<{ text: string; callbackData: string }>) {
  await send("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: { inline_keyboard: [options.map((option) => ({ text: option.text, callback_data: option.callbackData }))] },
  });
}

export async function acknowledgeTelegramCallback(callbackQueryId: string, text: string) {
  await send("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}
