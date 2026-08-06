-- 0004_market_creators.sql
-- Market research: affiliate/creator layer — who is driving sales for a
-- winning product (EchoTik product/influencer/list).
--
-- market_creators: creator profile snapshot (dedup by source+id+date)
-- market_product_creators: creator × market-product junction (per-product
--   video/sales contribution at snapshot time)
--
-- One-time migration. Apply with scripts/apply-migration.mjs (or Neon SQL editor).

CREATE TABLE IF NOT EXISTS market_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source text NOT NULL,
  source_creator_id text NOT NULL,
  name text NOT NULL,
  avatar_url text,
  followers integer,
  engagement_rate numeric(6,3),
  region text,
  rating numeric(4,2),
  snapshot_date timestamp NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (source, source_creator_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS market_product_creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES market_creators(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES market_products(id) ON DELETE CASCADE,
  video_count integer,
  sales_for_product integer,
  snapshot_date timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (creator_id, product_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_market_product_creators_product ON market_product_creators (product_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_market_creators_ws_date ON market_creators (workspace_id, snapshot_date);
