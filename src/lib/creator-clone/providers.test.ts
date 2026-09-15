import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProviderAvailable,
  CREATOR_PROVIDER_CATALOG,
  createCreatorProviderRegistry,
  getProviderCapability,
  ProviderUnavailableError,
} from "./providers";

test("catalog exposes every Phase 1 provider without claiming production support", () => {
  assert.deepEqual(
    CREATOR_PROVIDER_CATALOG.map((provider) => provider.id),
    ["fish_audio", "heygen", "argil", "creatify", "local"]
  );
  for (const provider of CREATOR_PROVIDER_CATALOG) {
    assert.ok(provider.capabilities.every((capability) => capability.maturity !== ("supported" as never)));
  }
});

test("provider capability lookup is kind-specific", () => {
  assert.equal(getProviderCapability("fish_audio", "voice")?.maturity, "experimental");
  assert.equal(getProviderCapability("fish_audio", "avatar"), null);
  assert.equal(getProviderCapability("local", "video")?.maturity, "unsupported");
});

test("unconnected providers fail explicitly instead of returning mock output", () => {
  assert.throws(
    () => assertProviderAvailable("heygen", "avatar"),
    (error) =>
      error instanceof ProviderUnavailableError &&
      error.providerId === "heygen" &&
      error.maturity === "experimental"
  );
});

test("registry exposes adapters only for declared capabilities", async () => {
  const registry = createCreatorProviderRegistry();
  assert.ok(registry.voices.has("fish_audio"));
  assert.equal(registry.avatars.has("fish_audio"), false);
  assert.ok(registry.avatars.has("heygen"));
  await assert.rejects(
    registry.voices.get("fish_audio")!.generateSpeech({ creatorId: "creator-1", script: "test" }),
    ProviderUnavailableError
  );
});
