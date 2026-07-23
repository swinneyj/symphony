import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface GenerateRequest {
  type: "caption" | "hashtag" | "image" | "idea";
  prompt: string;
  platform?: string;
}

const captionTemplates: Record<string, string[]> = {
  instagram: [
    "✨ {prompt}\n\nDouble tap if you agree! 💬\n\n#symphony #socialmedia",
    "The secret to {prompt}? It's simpler than you think. 🚀\n\nTag someone who needs to see this! 👇",
    "Stop scrolling and take a moment to appreciate {prompt}. 🌟\n\nWhat's your take on this?",
  ],
  twitter: [
    "{prompt}\n\nWhat do you think?",
    "Hot take: {prompt} 🧵",
    "Just had a thought about {prompt}... 💭",
  ],
  linkedin: [
    "I've been thinking about {prompt} lately. Here's what I've learned:\n\n1. Start with why\n2. Focus on the details\n3. Iterate and improve\n\nWhat would you add? 💼",
    "{prompt} - This changes everything for our industry. Let me break it down:\n\n🧵 Thread below 👇",
  ],
  tiktok: [
    "POV: You just discovered {prompt} and your mind is blown 🔥\n\n#fyp #viral",
    "Wait for it... {prompt} is the game changer you didn't know you needed! ⚡️",
  ],
  facebook: [
    "{prompt}\n\n👇 Drop your thoughts in the comments below! I'd love to hear your perspective.",
    "Can we talk about {prompt} for a second? This is something I feel strongly about...",
  ],
  default: [
    "{prompt} - here's everything you need to know. 🚀",
    "Let's talk about {prompt}. Drop your thoughts below! 👇",
  ],
};

const hashtagSets: Record<string, string[]> = {
  instagram: [
    "#{prompt} #socialmedia #marketing #growth #digital #contentcreator #viral #trending",
    "#{prompt} #community #engagement #strategy #tips #learn #inspiration #success",
  ],
  twitter: [
    "#{prompt} #trending #discussion",
  ],
  linkedin: [
    "#{prompt} #professional #growth #insights #leadership",
  ],
  default: [
    "#{prompt} #socialmedia #marketing #content",
    "#{prompt} #trending #viral #community",
  ],
};

const imagePromptTemplates = [
  "A modern minimalist interpretation of {prompt}, soft gradients, professional lighting, 4K quality",
  "Vibrant and colorful illustration representing {prompt}, flat design style, social media banner",
  "Cinematic photograph capturing {prompt}, golden hour lighting, depth of field, professional composition",
  "Abstract digital art inspired by {prompt}, neon accents, dark mode aesthetic, futuristic vibe",
];

const ideaExamples = [
  "Create a series of educational posts explaining {prompt} in simple terms, with carousel format",
  "Host a live Q&A session about {prompt} and engage with your audience directly",
  "Launch a user-generated content campaign around {prompt} with a branded hashtag challenge",
  "Write a case study showing real results from {prompt}, with before/after data visualization",
  "Create a weekly series breaking down {prompt} into digestible tips and tricks",
  "Collaborate with influencers in the {prompt} space for cross-promotion and expanded reach",
];

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: GenerateRequest = await request.json();
    const { type, prompt, platform } = body;

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

    const normalizedPlatform = platform?.toLowerCase() || "default";
    const sanitizedPrompt = prompt.trim();

    let result: unknown;

    switch (type) {
      case "caption": {
        const templates =
          captionTemplates[normalizedPlatform] || captionTemplates.default;
        const options = templates.map((t) =>
          t.replace("{prompt}", sanitizedPrompt)
        );
        result = {
          options,
          selected: options[0],
          platform: normalizedPlatform,
        };
        break;
      }

      case "hashtag": {
        const sets =
          hashtagSets[normalizedPlatform] || hashtagSets.default;
        const options = sets.map((s) =>
          s.replace("{prompt}", sanitizedPrompt.replace(/\s+/g, ""))
        );
        result = {
          options,
          selected: options[0],
          platform: normalizedPlatform,
        };
        break;
      }

      case "image": {
        const options = imagePromptTemplates.map((t) =>
          t.replace("{prompt}", sanitizedPrompt)
        );
        result = {
          options,
          selected: options[0],
          platform: normalizedPlatform,
        };
        break;
      }

      case "idea": {
        const options = ideaExamples.map((t) =>
          t.replace("{prompt}", sanitizedPrompt)
        );
        result = {
          options,
          selected: options[0],
          platform: normalizedPlatform,
        };
        break;
      }

      default: {
        return NextResponse.json(
          { error: "Unsupported generation type" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      type,
      prompt: sanitizedPrompt,
      platform: normalizedPlatform,
      result,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in AI generation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
