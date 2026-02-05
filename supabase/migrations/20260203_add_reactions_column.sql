-- Migration: Add reactions column to interacoes table
-- Date: 2026-02-03

-- Add reactions JSONB column for storing emoji reactions
ALTER TABLE interacoes 
ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '[]'::jsonb;

-- Add index for faster queries on messages with reactions
CREATE INDEX IF NOT EXISTS idx_interacoes_reactions 
ON interacoes USING GIN (reactions) 
WHERE reactions != '[]'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN interacoes.reactions IS 'Array of reactions: [{emoji: "❤️", fromMe: boolean, timestamp: ISO string}]';
