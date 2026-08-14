-- 0011_llm_usage.sql
-- LLM usage ledger: one row per real LLM API call, recorded from the response's
-- `usage` object so token/cost figures in the UI are actuals, not guesses.
--
-- `surface` = product feature that made the call ("fill" | "agent" | "remix").
-- `entity_type`/`entity_id` attach the row to an ad_source / formula / batch so
-- the app can roll spend up per source, per formula, or per video batch.
--
-- Apply: psql against Neon, or `npx drizzle-kit push` with DATABASE_URL set
-- (diffs src/db/schema.ts against the live DB).

CREATE TABLE IF NOT EXISTS llm_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),
  surface text NOT NULL,                    -- 'fill' | 'agent' | 'remix'
  entity_type text,                         -- 'ad_source' | 'formula' | 'batch'
  entity_id uuid,
  model text NOT NULL,
  provider text,                            -- gemini | deepseek | openai
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12, 6),
  estimated_input_tokens integer,
  estimated_output_tokens integer,
  estimated_cost_usd numeric(12, 6),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_entity ON llm_usage (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_workspace ON llm_usage (workspace_id, created_at);
