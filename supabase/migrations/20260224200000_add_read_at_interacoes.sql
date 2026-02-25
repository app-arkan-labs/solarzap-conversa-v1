-- Add read_at column to interacoes for persistent unread tracking
ALTER TABLE interacoes ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index for fast unread lookups per lead+user
CREATE INDEX IF NOT EXISTS idx_interacoes_read_at
  ON interacoes (lead_id, user_id)
  WHERE read_at IS NULL;
