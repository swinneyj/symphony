-- Replace the public BatchBot description with a production scene prompt.
-- BatchBot's internal prompt was not exposed in the formula/API payload, so
-- this keeps an editable, formula-level preset in Symphony instead.
UPDATE video_formulas
SET scene_prompt_template = 'Create a polished vertical 9:16 product hero scene for {product}. Place one complete, accurately shaped product prominently in the foreground on a clean light marble kitchen countertop. Use bright soft daylight from a nearby window, a warm neutral modern kitchen background, shallow depth of field, premium commercial food-and-beverage advertising photography, realistic contact shadow and subtle reflections. Face the product toward the camera and preserve its label, logo, colors, proportions, and packaging details exactly. Keep the product large, centered, fully in frame, and sharp, with clean negative space for captions. Do not add extra cans or duplicate products, hands, people, props covering the product, invented text, warped packaging, melted logos, cropped edges, or extreme perspective.',
    motion_preset = 'kitchenCounterProduct',
    updated_at = now()
WHERE name = 'Kitchen Counter Display'
  AND workspace_id IS NULL
  AND is_system = true;
