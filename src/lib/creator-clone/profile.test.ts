import assert from "node:assert/strict";
import test from "node:test";
import {
  isCreatorConsentStatus,
  normalizeCreatorStyle,
  validateCreatorProvider,
} from "./profile";

test("normalizes creator style fields", () => {
  assert.deepEqual(
    normalizeCreatorStyle({
      speakingStyle: "  warm and conversational ",
      personalityTraits: [" funny ", "", 12, "direct"],
      customInstructions: "  Avoid hard sells. ",
    }),
    {
      speakingStyle: "warm and conversational",
      personalityTraits: ["funny", "direct"],
      customInstructions: "Avoid hard sells.",
    }
  );
});

test("validates consent and provider capabilities", () => {
  assert.equal(isCreatorConsentStatus("authorized"), true);
  assert.equal(isCreatorConsentStatus("approved"), false);
  assert.equal(validateCreatorProvider("fish_audio", "voice"), null);
  assert.equal(validateCreatorProvider("fish_audio", "avatar"), "Unknown avatar provider");
  assert.equal(validateCreatorProvider("made_up", "voice"), "Unknown voice provider");
});
