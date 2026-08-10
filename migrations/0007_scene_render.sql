-- 0007: AI scene render step (image-gen) + reverse-extend
-- Compliance gap fix: brand-owned listing images must be re-rendered into an
-- original scene before image-to-video (TikTok Shop copyright violations).
-- See docs/AI-VIDEO-STUDIO-SPEC.md §10.

ALTER TYPE video_job_type ADD VALUE IF NOT EXISTS 'scene_render';

-- formula-level: 'render' (default) = AI re-render into custom scene;
-- 'original' = use the user's own photography as-is.
ALTER TABLE video_formulas ADD COLUMN IF NOT EXISTS source_frame text NOT NULL DEFAULT 'render';

-- rendered scene image per product (set by the scene_render job; also used for
-- UI preview before batch approval).
ALTER TABLE products ADD COLUMN IF NOT EXISTS scene_image_url text;

-- job-level output column so footage jobs can consume the rendered frame.
ALTER TABLE video_batch_jobs ADD COLUMN IF NOT EXISTS scene_image_url text;
