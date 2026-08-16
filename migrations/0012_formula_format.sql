-- 0012: BatchBot formula parity — format column (ai / no_ai / hybrid)
-- for the "All formats" filter, mirroring batchbot.io's formula library.
ALTER TABLE video_formulas ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'ai';
