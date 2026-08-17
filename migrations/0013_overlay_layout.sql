-- 0013: BatchBot run-view parity — per-line overlay positions (draggable text boxes).
-- overlay_layout jsonb: array of {x, y} fractions (0..1) aligned with the
-- newline-separated overlay_template lines. null = legacy stacked-top behavior.
ALTER TABLE video_formulas ADD COLUMN IF NOT EXISTS overlay_layout jsonb;
