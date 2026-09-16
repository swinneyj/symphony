-- 0023: Clone benchmark sessions, provider runs, and human quality ratings.

CREATE TABLE IF NOT EXISTS clone_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),
  script text NOT NULL,
  voice_id uuid REFERENCES voices(id) ON DELETE SET NULL,
  avatar_reference_url text,
  quality_mode text NOT NULL DEFAULT 'standard',
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clone_benchmark_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id uuid NOT NULL REFERENCES clone_benchmarks(id) ON DELETE CASCADE,
  voice_provider text,
  avatar_provider text,
  voice_model_id text,
  avatar_model_id text,
  status text NOT NULL DEFAULT 'queued',
  output_url text,
  error text,
  cost_usd numeric(12,6),
  generation_time_ms integer,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clone_benchmark_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES clone_benchmark_runs(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  face_likeness integer CHECK (face_likeness BETWEEN 1 AND 5),
  voice_likeness integer CHECK (voice_likeness BETWEEN 1 AND 5),
  lip_sync integer CHECK (lip_sync BETWEEN 1 AND 5),
  movement_naturalness integer CHECK (movement_naturalness BETWEEN 1 AND 5),
  overall_realism integer CHECK (overall_realism BETWEEN 1 AND 5),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, user_id)
);

CREATE INDEX IF NOT EXISTS clone_benchmark_runs_benchmark_idx ON clone_benchmark_runs (benchmark_id);
CREATE INDEX IF NOT EXISTS clone_benchmark_ratings_run_idx ON clone_benchmark_ratings (run_id);
