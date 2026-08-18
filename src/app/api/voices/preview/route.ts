import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const SAMPLE_TEXT = "This is a preview of the selected Symphony voice.";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { provider = "openai_tts", providerVoiceId, text } = await request.json();
    if (provider !== "openai_tts" || typeof providerVoiceId !== "string" || !providerVoiceId) {
      return NextResponse.json({ error: "Only OpenAI TTS preview is currently supported" }, { status: 400 });
    }
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: providerVoiceId,
        input: typeof text === "string" && text.trim() ? text.slice(0, 300) : SAMPLE_TEXT,
        response_format: "mp3",
      }),
    });
    if (!response.ok) return NextResponse.json({ error: `TTS preview failed: ${await response.text()}` }, { status: 502 });
    return new NextResponse(await response.arrayBuffer(), {
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed" }, { status: 500 });
  }
}
