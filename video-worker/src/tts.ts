/**
 * Text-to-speech for voiceovers.
 *
 * Engine priority (per voice.provider):
 *   elevenlabs → ELEVENLABS_API_KEY REST
 *   openai_tts → OPENAI_API_KEY REST
 *   kokoro     → local kokoro-js (no key; model downloads on first use)
 *
 * Dry-run (VIDEO_DRY_RUN=1) renders a placeholder tone — pipeline fully
 * testable with zero keys.
 */

export interface VoiceoverRequest {
  script: string;
  provider: "elevenlabs" | "openai_tts" | "kokoro";
  voiceName: string | null;
  providerVoiceId: string | null;
  outPath: string;
}

const DRY_RUN = ["1", "true"].includes((process.env.VIDEO_DRY_RUN ?? "").toLowerCase());

async function placeholderAudio(outPath: string, seconds = 3): Promise<void> {
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", `sine=frequency=330:duration=${seconds}`, "-af", "volume=0.15", outPath],
    { stdio: "ignore", timeout: 30_000 }
  );
}

async function elevenLabs(req: VoiceoverRequest): Promise<void> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("voiceover: ELEVENLABS_API_KEY not set (voice.provider=elevenlabs)");
  const voiceId = req.providerVoiceId ?? "21m00Tcm4TlvDq8ikWAM"; // default Rachel
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({ text: req.script, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) throw new Error(`elevenlabs TTS failed: ${res.status} ${await res.text()}`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(req.outPath, Buffer.from(await res.arrayBuffer()));
}

async function openAiTts(req: VoiceoverRequest): Promise<void> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("voiceover: OPENAI_API_KEY not set (voice.provider=openai_tts)");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts", // TODO_VERIFY model id
      voice: req.providerVoiceId ?? "alloy",
      input: req.script,
    }),
  });
  if (!res.ok) throw new Error(`openai TTS failed: ${res.status} ${await res.text()}`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(req.outPath, Buffer.from(await res.arrayBuffer()));
}

async function kokoroTts(req: VoiceoverRequest): Promise<void> {
  // Local, keyless VO. Model downloads on first use (~80MB).
  try {
    const { KokoroTTS } = await import("kokoro-js");
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX");
    const audio = await tts.generate(req.script, { voice: (req.voiceName as never) ?? "af_heart" });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(req.outPath, Buffer.from(audio.audio));
  } catch (error) {
    throw new Error(`kokoro TTS failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function generateVoiceover(req: VoiceoverRequest): Promise<{ engine: string }> {
  if (DRY_RUN) {
    await placeholderAudio(req.outPath);
    return { engine: "dry-run" };
  }
  switch (req.provider) {
    case "elevenlabs":
      await elevenLabs(req);
      return { engine: "elevenlabs" };
    case "kokoro":
      await kokoroTts(req);
      return { engine: "kokoro" };
    case "openai_tts":
    default:
      await openAiTts(req);
      return { engine: "openai_tts" };
  }
}
