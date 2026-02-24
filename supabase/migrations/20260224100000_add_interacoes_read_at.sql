-- Sprint 2, Item #3/#4: Add read_at column to interacoes for unread tracking
-- This migration is idempotent (safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'interacoes'
      AND column_name = 'read_at'
  ) THEN
    ALTER TABLE public.interacoes ADD COLUMN read_at timestamptz DEFAULT NULL;
    COMMENT ON COLUMN public.interacoes.read_at IS 'Timestamp when a client message was read by the seller. NULL = unread.';
    -- Index for efficient unread counting per lead
    CREATE INDEX IF NOT EXISTS idx_interacoes_lead_read ON public.interacoes (lead_id, read_at) WHERE read_at IS NULL;
  END IF;
END $$;
