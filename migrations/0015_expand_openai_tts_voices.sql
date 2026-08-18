INSERT INTO voices (name, provider, provider_voice_id, is_cloned)
SELECT v.name, 'openai_tts', v.voice_id, false
FROM (VALUES
  ('Ash', 'ash'), ('Ballad', 'ballad'), ('Coral', 'coral'), ('Marin', 'marin'),
  ('Sage', 'sage'), ('Verse', 'verse'), ('Cedar', 'cedar')
) AS v(name, voice_id)
WHERE NOT EXISTS (
  SELECT 1 FROM voices existing
  WHERE existing.workspace_id IS NULL AND existing.provider = 'openai_tts'
    AND existing.provider_voice_id = v.voice_id
);
