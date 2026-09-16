import { createCreatorProviderRegistry, type CreatorProviderRegistry } from "./providers";
import { FishAudioVoiceProvider } from "./fish-audio";

/** Server-only registry: swaps in real adapters when their credentials exist. */
export function createServerCreatorProviderRegistry(): CreatorProviderRegistry {
  const base = createCreatorProviderRegistry();
  if (process.env.FISH_API_KEY) {
    const fish = new FishAudioVoiceProvider();
    const voices = new Map(base.voices);
    voices.set("fish_audio", fish);
    return { ...base, voices };
  }
  return base;
}
