-- API keys for the Symphony MCP server / agent access (feature/video-studio)
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_id text NOT NULL REFERENCES users(id),
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  revoked_at timestamp
);
CREATE INDEX IF NOT EXISTS api_keys_workspace_id_idx ON api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS api_keys_key_prefix_idx ON api_keys(key_prefix);
