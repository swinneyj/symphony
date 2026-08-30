-- 0020_market_bookmarks.sql
-- Favorites/bookmarks for market entities (influencers + shops) so the user
-- can re-drill into a seller's products without re-typing the search.
-- One row per (workspace, kind, source, source_id); idempotent re-bookmark.
CREATE TABLE IF NOT EXISTS market_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL,                    -- 'influencer' | 'shop'
  source text NOT NULL DEFAULT 'echotik',
  source_id text NOT NULL,               -- creator id (influencer) or seller id (shop)
  name text NOT NULL,
  avatar_url text,
  category text,
  followers integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, kind, source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_market_bookmarks_ws
  ON market_bookmarks(workspace_id, created_at DESC);
