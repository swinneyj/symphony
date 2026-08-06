-- 0003_market_momentum.sql
-- Market research: momentum score (rank trajectory across snapshots).
-- Positive = climbing the rankings. Computed at ingest time from the
-- most recent prior snapshot of the same source+product.
--
-- Apply with: node scripts/apply-migration.mjs migrations/0003_market_momentum.sql

ALTER TABLE market_products ADD COLUMN IF NOT EXISTS momentum_score numeric(8, 2);

CREATE INDEX IF NOT EXISTS idx_market_products_momentum
  ON market_products(workspace_id, momentum_score DESC)
  WHERE momentum_score IS NOT NULL;
