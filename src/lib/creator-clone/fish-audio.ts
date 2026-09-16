import { put } from "@vercel/blob";
import { blobToken } from "@/lib/blob-token";
import type { GenerationRequest, GenerationResult, ProviderDescriptor, VoiceProvider } from "./providers";

const fishDescriptor: ProviderDescriptor = {
  id: "fish_audio",
  name: "Fish Audio",
  capabilities: [{ kind: "voice", maturity: "experimental", reason: "Connected voice adapter; verify output quality in benchmark." }],
};

/** Real Fish Audio TTS adapter. Requires FISH_API_KEY and a persistent voice model ID. */
export class FishAudioVoiceProvider implements VoiceProvider {
  readonly descriptor = fishDescriptor;

  async generateSpeech(request: GenerationRequest): Promise<GenerationResult> {
    const apiKey = process.env.FISH_API_KEY;
    if (!apiKey) throw new Error("FISH_API_KEY is not configured");
    if (!request.modelId) throw new Error("Fish Audio voice/model ID is required on the Creator Profile");

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: "s2-pro",
      },
      body: JSON.stringify({
        text: request.script,
        format: "mp3",
        reference_id: request.modelId,
        prosody: { speed: 1.0, volume: 0 },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Fish Audio TTS failed (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ""}`);
    }

    const audio = await response.arrayBuffer();
    const blob = await put(
      `creator-audio/${request.creatorId}/${Date.now()}.mp3`,
      Buffer.from(audio),
      { access: "private", addRandomSuffix: true, contentType: "audio/mpeg", token: blobToken() }
    );
    return {
      provider: "fish_audio",
      externalJobId: `fish-${Date.now()}`,
      status: "complete",
      outputUrl: blob.url,
    };
  }
}
