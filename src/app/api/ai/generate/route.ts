import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { aiGenerations } from "@/db/schema";
import { generateContent } from "@/lib/ai-generate";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { type, prompt, platform, workspaceId } = body ?? {};

    if (!type || !["caption", "hashtag", "image", "idea"].includes(type)) {
      return NextResponse.json(
        {
          error:
            "Invalid type. Must be one of: caption, hashtag, image, idea",
        },
        { status: 400 }
      );
    }

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const result = generateContent({ type, prompt, platform });

    // Persist to generation history when a workspace is provided (best-effort)
    if (workspaceId && typeof workspaceId === "string") {
      try {
        await db.insert(aiGenerations).values({
          workspaceId,
          userId: session.user.id,
          type,
          prompt: prompt.trim(),
          result: result as unknown as Record<string, unknown>,
        });
      } catch (err) {
        console.error("Failed to persist AI generation history:", err);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in AI generation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
