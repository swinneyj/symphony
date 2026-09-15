export type ProviderKind = "voice" | "avatar" | "video";
export type ProviderMaturity = "experimental" | "unsupported";

export type ProviderCapability = {
  kind: ProviderKind;
  maturity: ProviderMaturity;
  reason: string;
};

export type ProviderDescriptor = {
  id: string;
  name: string;
  capabilities: ProviderCapability[];
};

export type GenerationRequest = {
  creatorId: string;
  script: string;
  modelId?: string;
};

export type GenerationResult = {
  provider: string;
  externalJobId: string;
  status: "queued" | "running" | "complete" | "failed";
  outputUrl?: string;
  costUsd?: number;
  durationMs?: number;
};

export interface VoiceProvider {
  readonly descriptor: ProviderDescriptor;
  generateSpeech(request: GenerationRequest): Promise<GenerationResult>;
}

export interface AvatarProvider {
  readonly descriptor: ProviderDescriptor;
  generateAvatarVideo(request: GenerationRequest & { audioUrl: string }): Promise<GenerationResult>;
}

export interface VideoProvider {
  readonly descriptor: ProviderDescriptor;
  generateVideo(request: GenerationRequest & { sourceUrls?: string[] }): Promise<GenerationResult>;
}

export class ProviderUnavailableError extends Error {
  constructor(
    readonly providerId: string,
    readonly kind: ProviderKind,
    readonly maturity: ProviderMaturity,
    reason: string
  ) {
    super(`${providerId} ${kind} provider is ${maturity}: ${reason}`);
    this.name = "ProviderUnavailableError";
  }
}

export const CREATOR_PROVIDER_CATALOG = [
  {
    id: "fish_audio",
    name: "Fish Audio",
    capabilities: [
      {
        kind: "voice",
        maturity: "experimental",
        reason: "Adapter contract is ready; authenticated generation is not connected yet.",
      },
    ],
  },
  {
    id: "heygen",
    name: "HeyGen",
    capabilities: [
      {
        kind: "avatar",
        maturity: "experimental",
        reason: "Benchmark target only; no production API credentials or job adapter are connected.",
      },
      {
        kind: "video",
        maturity: "experimental",
        reason: "Benchmark target only; no production API credentials or job adapter are connected.",
      },
    ],
  },
  {
    id: "argil",
    name: "Argil",
    capabilities: [
      {
        kind: "avatar",
        maturity: "experimental",
        reason: "Candidate for the benchmark; generation is not implemented.",
      },
      {
        kind: "video",
        maturity: "experimental",
        reason: "Candidate for the benchmark; generation is not implemented.",
      },
    ],
  },
  {
    id: "creatify",
    name: "Creatify",
    capabilities: [
      {
        kind: "avatar",
        maturity: "experimental",
        reason: "UGC/avatar candidate; generation is not implemented.",
      },
      {
        kind: "video",
        maturity: "experimental",
        reason: "UGC/avatar candidate; generation is not implemented.",
      },
    ],
  },
  {
    id: "local",
    name: "Local / open source",
    capabilities: [
      {
        kind: "voice",
        maturity: "unsupported",
        reason: "Reserved for a future local runtime.",
      },
      {
        kind: "avatar",
        maturity: "unsupported",
        reason: "Reserved for a future local runtime.",
      },
      {
        kind: "video",
        maturity: "unsupported",
        reason: "Reserved for a future local runtime.",
      },
    ],
  },
] as const satisfies readonly ProviderDescriptor[];

export function getProviderCapability(providerId: string, kind: ProviderKind): ProviderCapability | null {
  const provider = CREATOR_PROVIDER_CATALOG.find((candidate) => candidate.id === providerId);
  return provider?.capabilities.find((capability) => capability.kind === kind) ?? null;
}

export function assertProviderAvailable(providerId: string, kind: ProviderKind): never {
  const capability = getProviderCapability(providerId, kind);
  if (!capability) {
    throw new ProviderUnavailableError(providerId, kind, "unsupported", "No adapter is registered.");
  }
  throw new ProviderUnavailableError(providerId, kind, capability.maturity, capability.reason);
}

class UnavailableVoiceAdapter implements VoiceProvider {
  constructor(readonly descriptor: ProviderDescriptor) {}
  async generateSpeech(_request: GenerationRequest): Promise<GenerationResult> {
    return assertProviderAvailable(this.descriptor.id, "voice");
  }
}

class UnavailableAvatarAdapter implements AvatarProvider {
  constructor(readonly descriptor: ProviderDescriptor) {}
  async generateAvatarVideo(
    _request: GenerationRequest & { audioUrl: string }
  ): Promise<GenerationResult> {
    return assertProviderAvailable(this.descriptor.id, "avatar");
  }
}

class UnavailableVideoAdapter implements VideoProvider {
  constructor(readonly descriptor: ProviderDescriptor) {}
  async generateVideo(
    _request: GenerationRequest & { sourceUrls?: string[] }
  ): Promise<GenerationResult> {
    return assertProviderAvailable(this.descriptor.id, "video");
  }
}

export type CreatorProviderRegistry = {
  voices: ReadonlyMap<string, VoiceProvider>;
  avatars: ReadonlyMap<string, AvatarProvider>;
  videos: ReadonlyMap<string, VideoProvider>;
};

/**
 * Phase 1 registry. Every declared adapter deliberately throws a typed
 * ProviderUnavailableError until its real authenticated implementation lands.
 */
export function createCreatorProviderRegistry(): CreatorProviderRegistry {
  const voices = new Map<string, VoiceProvider>();
  const avatars = new Map<string, AvatarProvider>();
  const videos = new Map<string, VideoProvider>();

  for (const descriptor of CREATOR_PROVIDER_CATALOG) {
    for (const capability of descriptor.capabilities) {
      if (capability.kind === "voice") voices.set(descriptor.id, new UnavailableVoiceAdapter(descriptor));
      if (capability.kind === "avatar") avatars.set(descriptor.id, new UnavailableAvatarAdapter(descriptor));
      if (capability.kind === "video") videos.set(descriptor.id, new UnavailableVideoAdapter(descriptor));
    }
  }

  return { voices, avatars, videos };
}
