-- 0017_product_watchlist_unique.sql
-- product_watchlist exists but was created WITHOUT the UNIQUE constraint
-- declared in 0005 (verified: only PK + NOT NULL constraints, 0 rows).
-- Add it so ON CONFLICT upserts (scripts/ingest-product-research.mjs) work.
ALTER TABLE product_watchlist
  ADD CONSTRAINT product_watchlist_ws_source_sku_key
  UNIQUE (workspace_id, source, source_product_id);
