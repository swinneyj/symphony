-- 0019_market_unique_constraints.sql
-- market_products / market_creators / market_product_creators exist but were
-- created WITHOUT the UNIQUE constraints declared in migrations 0002 and 0004
-- (verified: only PK + NOT NULL constraints present). Every ON CONFLICT upsert
-- in adopt-market-product / ingest-creators therefore threw
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- (bulk-add from influencer lists reported as "3 failed", 0 added).
-- Add them so ON CONFLICT upserts work. Verified 0 duplicate rows before adding.
ALTER TABLE market_products
  ADD CONSTRAINT market_products_source_spid_date_key
  UNIQUE (source, source_product_id, snapshot_date);

ALTER TABLE market_creators
  ADD CONSTRAINT market_creators_source_scid_date_key
  UNIQUE (source, source_creator_id, snapshot_date);

ALTER TABLE market_product_creators
  ADD CONSTRAINT market_product_creators_creator_product_date_key
  UNIQUE (creator_id, product_id, snapshot_date);
