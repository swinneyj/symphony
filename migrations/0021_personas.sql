-- 0021: AI Influencer personas — M1 schema (docs/AI-INFLUENCER-SPEC.md).
-- Reusable identity layer: face refs + voice + style prompt, persisted across
-- videos. Idempotent — safe to apply to staging and prod.

CREATE TABLE IF NOT EXISTS personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE, -- null = system persona
  created_by_id text NOT NULL REFERENCES users(id),
  name text NOT NULL,
  description text,
  face_image_url text,          -- Blob, served through the authenticated proxy
  face_ref_urls jsonb DEFAULT '[]', -- 3-5 reference faces for identity consistency
  voice_id uuid REFERENCES voices(id) ON DELETE SET NULL,
  persona_prompt text,          -- appearance/style, injected into scene prompts
  is_system boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pure junction: media_assets stays shared with the publish flow.
CREATE TABLE IF NOT EXISTS persona_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'generated_photo', -- face_ref | generated_photo | voice_sample | thumbnail
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS persona_media_persona_idx ON persona_media (persona_id);
CREATE INDEX IF NOT EXISTS persona_media_asset_idx ON persona_media (media_asset_id);

-- Default persona per formula + per-batch override (wins over formula).
ALTER TABLE video_formulas ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES personas(id) ON DELETE SET NULL;
ALTER TABLE video_batches ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES personas(id) ON DELETE SET NULL;
