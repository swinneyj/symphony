import { NextResponse } from "next/server";
import OpenAI from "openai";
import { auth } from "@/lib/auth";
import { hasWorkspaceAccess } from "@/lib/workspace-access";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const workspaceId = String(form.get("workspaceId") ?? "");
  const file = form.get("audio");
  if (!workspaceId || !(await hasWorkspaceAccess(workspaceId, session.user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Audio file exceeds 25 MB" }, { status: 413 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  try {
    const result = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).audio.transcriptions.create({ model: "gpt-4o-mini-transcribe", file });
    const transcript = typeof result === "string" ? result : result.text;
    return NextResponse.json({ audioClassification: transcript.trim() ? "speech" : "needs_review", transcript: transcript.trim().slice(0, 500) });
  } catch (error) { console.error("R2 audio classification failed:", error); return NextResponse.json({ error: "Audio classification failed" }, { status: 502 }); }
}
