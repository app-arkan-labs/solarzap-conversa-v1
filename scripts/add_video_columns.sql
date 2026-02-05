-- Migration to add Robust Video Sending columns
-- Created at: 2026-01-28

ALTER TABLE interacoes 
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS send_mode TEXT, -- 'video', 'document', 'text', 'image'
ADD COLUMN IF NOT EXISTS fallback_from TEXT; -- 'video' (if fallback occurred)

-- Optional: Add index on send_mode if needed for future filtering
CREATE INDEX IF NOT EXISTS idx_interacoes_send_mode ON interacoes(send_mode);
