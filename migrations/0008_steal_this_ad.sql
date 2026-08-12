-- 0008: Steal This Ad — viral ad reverse-engineering
-- User pastes a TikTok/product URL → ads-worker downloads (yt-dlp) +
-- transcribes (faster-whisper) → LLM remixes into original scripts that
-- render through the existing batch pipeline (scriptOverride).

CREATE TABLE IF NOT EXISTS ad_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),
  source_url text NOT NULL,
  platform text NOT NULL DEFAULT 'tiktok',
  title text,
  author_name text,
  transcript jsonb NOT NULL DEFAULT '[]',
  raw_text text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_sources_workspace_idx ON ad_sources(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ad_sources_status_idx ON ad_sources(status);

CREATE TABLE IF NOT EXISTS ad_remixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_source_id uuid NOT NULL REFERENCES ad_sources(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),
  hook text NOT NULL,
  angle text,
  tone text NOT NULL DEFAULT 'casual',
  script text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  batch_id uuid REFERENCES video_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ad_remixes_source_idx ON ad_remixes(ad_source_id);
