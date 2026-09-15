import { getProviderCapability, type ProviderKind } from "./providers";

export const CREATOR_CONSENT_STATUSES = ["pending", "authorized", "revoked", "expired"] as const;
export type CreatorConsentStatus = (typeof CREATOR_CONSENT_STATUSES)[number];

export type CreatorStyleInput = {
  speakingStyle?: unknown;
  personalityTraits?: unknown;
  customInstructions?: unknown;
};

export function isCreatorConsentStatus(value: unknown): value is CreatorConsentStatus {
  return CREATOR_CONSENT_STATUSES.includes(value as CreatorConsentStatus);
}

export function normalizeCreatorStyle(input: CreatorStyleInput | null | undefined) {
  const speakingStyle = typeof input?.speakingStyle === "string" ? input.speakingStyle.trim() : "";
  const customInstructions =
    typeof input?.customInstructions === "string" ? input.customInstructions.trim() : "";
  const personalityTraits = Array.isArray(input?.personalityTraits)
    ? input.personalityTraits
        .filter((trait): trait is string => typeof trait === "string")
        .map((trait) => trait.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];

  return {
    ...(speakingStyle ? { speakingStyle } : {}),
    ...(personalityTraits.length ? { personalityTraits } : {}),
    ...(customInstructions ? { customInstructions } : {}),
  };
}

export function validateCreatorProvider(providerId: unknown, kind: ProviderKind): string | null {
  if (providerId === undefined || providerId === null || providerId === "") return null;
  if (typeof providerId !== "string" || !getProviderCapability(providerId, kind)) {
    return `Unknown ${kind} provider`;
  }
  return null;
}
