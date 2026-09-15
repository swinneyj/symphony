-- 0022: Evolve the existing AI influencer persona identity layer into
-- Creator Profiles without breaking formula, batch, or image-render references.

ALTER TABLE personas ADD COLUMN IF NOT EXISTS voice_provider text;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS voice_model_id text;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS avatar_provider text;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS avatar_model_id text;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS style_config jsonb DEFAULT '{}';
ALTER TABLE personas ADD COLUMN IF NOT EXISTS consent_status text NOT NULL DEFAULT 'pending';
ALTER TABLE personas ADD COLUMN IF NOT EXISTS consent_confirmed_at timestamptz;
ALTER TABLE personas ADD COLUMN IF NOT EXISTS consent_notes text;

CREATE UNIQUE INDEX IF NOT EXISTS persona_media_unique_role_idx
  ON persona_media (persona_id, media_asset_id, role);

ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_consent_status_check;
ALTER TABLE personas ADD CONSTRAINT personas_consent_status_check
  CHECK (consent_status IN ('pending', 'authorized', 'revoked', 'expired'));
