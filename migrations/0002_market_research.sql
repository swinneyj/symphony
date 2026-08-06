-- 0002_market_research.sql
-- AI Video Studio: market research snapshots (winning-product intel).
-- One-time migration. Apply with scripts/apply-migration.mjs (or Neon SQL editor).
--
-- market_products = normalized snapshot rows from research sources
-- (echotik / fastmoss). Unique per (source, source_product_id, snapshot_date)
-- so refreshes upsert instead of duplicating.

CREATE TABLE IF NOT EXISTS market_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source text NOT NULL,                    -- 'echotik' | 'fastmoss' | ...
  source_product_id text NOT NULL,
  name text NOT NULL,
  image_url text,
  price_min numeric(12,2),
  price_max numeric(12,2),
  currency text DEFAULT 'USD',
  category_l1 text,
  category_l2 text,
  category_l3 text,
  region text,
  rank integer,
  rank_period text,                        -- 'day' | 'week' | 'month'
  sales_7d integer,
  sales_30d integer,
  gmv_30d numeric(14,2),
  growth_rate numeric(8,3),                -- period-over-period sales growth
  commission_rate numeric(6,3),
  video_count integer,
  creator_count integer,
  is_hot boolean DEFAULT false,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,  -- set when adopted
  snapshot_date date NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_product_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_market_products_ws_date
  ON market_products(workspace_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_products_rank
  ON market_products(workspace_id, rank_period, rank);
