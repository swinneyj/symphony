/**
 * Persona scene-prompt override.
 *
 * When a batch selects an AI-influencer persona that has face refs, the
 * formula's own scene prompt is usually a product-only template ("do not add
 * people") — so the persona would never appear in the video. This builder
 * produces a presenter-style prompt that puts the person in frame, with the
 * face refs (threaded separately into the scene render) carrying identity.
 *
 * Rule (batches route): use this override when a face-ref persona is selected
 * AND the formula was not authored for that specific persona
 * (formula.persona_id !== persona.id — an authored persona formula keeps its
 * own scene template).
 */
export function buildPersonaScenePrompt(persona: {
  name: string;
  personaPrompt: string | null;
}): string {
  const style = persona.personaPrompt?.trim()
    ? ` ${persona.personaPrompt.trim()}`
    : " warm, authentic, energetic TikTok creator style";
  // "the product" is intentionally generic — the product photo is attached to
  // the scene render as the reference image, so the model sees exactly which
  // product to feature (scene renders do not run {product} placeholder fill).
  return (
    `The person in the attached reference photos (${persona.name}) presents the product toward the camera, ` +
    `holding it naturally at chest height with one or two hands, looking at the camera with a genuine friendly smile, ` +
    `face clearly visible and matching the reference photos exactly.` +
    style +
    `. The product must stay fully visible, sharp, and unaltered — no added text, no logo changes, ` +
    `no extra objects, no warping. Vertical 9:16 TikTok Shop UGC shot.`
  );
}
