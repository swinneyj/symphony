-- 0001_video_studio.sql
-- AI Video Studio: products + voices + formulas + batches + jobs.
-- One-time migration. Apply against the Neon database (psql or Neon SQL editor)
-- BEFORE merging the feature/video-studio branch to main.
--
-- Tables use IF NOT EXISTS so re-running is safe; enums do not support
-- IF NOT EXISTS in PostgreSQL, so they are plain CREATE TYPE (run once).
--
-- Alternative apply path: `npx drizzle-kit push` with DATABASE_URL set
-- (diffs src/db/schema.ts against the live DB automatically).

-- ── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE product_source AS ENUM ('manual', 'link', 'tiktok_showcase');
CREATE TYPE product_status AS ENUM ('raw', 'processing', 'ready', 'failed');
CREATE TYPE video_provider AS ENUM ('sora', 'seedance', 'kling', 'openai_tts', 'elevenlabs', 'kokoro');
CREATE TYPE video_job_type AS ENUM ('product_process', 'footage', 'overlay', 'slideshow', 'batch_video');
CREATE TYPE video_job_status AS ENUM ('queued', 'running', 'done', 'failed', 'cancelled');
CREATE TYPE video_batch_status AS ENUM ('queued', 'running', 'done', 'partial', 'failed');

-- ── Products ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),
  name text NOT NULL,
  description text,
  price text,
  currency text DEFAULT 'USD',
  original_image_url text,
  processed_image_url text,
  source_type product_source NOT NULL DEFAULT 'manual',
  source_url text,
  tiktok_product_id text,
  status product_status NOT NULL DEFAULT 'raw',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id);

-- ── Voices ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider video_provider NOT NULL DEFAULT 'openai_tts',
  provider_voice_id text,
  is_cloned boolean DEFAULT false,
  sample_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Formulas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS video_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  script_template text NOT NULL,
  scene_prompt_template text,
  motion_preset text DEFAULT 'none',
  voice_id uuid REFERENCES voices(id) ON DELETE SET NULL,
  duration_sec integer DEFAULT 6,
  quality text DEFAULT 'standard',
  is_system boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Batches ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS video_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),
  name text NOT NULL,
  formula_id uuid REFERENCES video_formulas(id) ON DELETE SET NULL,
  voice_id uuid REFERENCES voices(id) ON DELETE SET NULL,
  quality text NOT NULL DEFAULT 'standard',
  provider video_provider DEFAULT 'sora',
  status video_batch_status NOT NULL DEFAULT 'queued',
  total_count integer DEFAULT 0,
  completed_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_batches_workspace ON video_batches(workspace_id);

-- ── Jobs ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS video_batch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES video_batches(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  formula_id uuid REFERENCES video_formulas(id) ON DELETE SET NULL,
  job_type video_job_type NOT NULL DEFAULT 'batch_video',
  status video_job_status NOT NULL DEFAULT 'queued',
  script text,
  footage_url text,
  voiceover_url text,
  final_url text,
  thumbnail_url text,
  error text,
  retries integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Worker polling is index-driven: queued jobs, oldest first.
CREATE INDEX IF NOT EXISTS idx_video_batch_jobs_queued
  ON video_batch_jobs(status, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_video_batch_jobs_product ON video_batch_jobs(product_id);
