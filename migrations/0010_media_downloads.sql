-- Media Downloader (backlog row 12): TikTok-first, video + optional MP3.
CREATE TABLE IF NOT EXISTS media_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),
  source_url text NOT NULL,
  platform text NOT NULL DEFAULT 'tiktok',
  want_audio boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued',
  title text,
  author_name text,
  video_url text,
  audio_url text,
  error text,
  retries integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_downloads_workspace_idx ON media_downloads (workspace_id, created_at DESC);
