ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS audio_track_status text;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS audio_classification text;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;
