-- 0005_product_watchlist.sql
-- Product Monitor: watch products (any source, incl. self-sourced) and track
-- their rank/sales trajectory across daily snapshots. Free-path centerpiece.
--
-- One-time migration. Apply with scripts/apply-migration.mjs.

CREATE TABLE IF NOT EXISTS product_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  alert_rank_drop INTEGER DEFAULT 10,
  last_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (workspace_id, source, source_product_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_ws ON product_watchlist (workspace_id, created_at DESC);
