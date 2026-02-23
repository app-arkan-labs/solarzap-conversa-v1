-- P0: Formalise AI-control columns on leads table.
-- These columns are required by handleHumanTakeover (frontend),
-- whatsapp-webhook seller_message_takeover (backend),
-- and ai-pipeline-agent gate checks.
-- Without them, a clean deploy loses all AI pause/resume functionality.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ai_enabled       boolean     DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_paused_reason text,
  ADD COLUMN IF NOT EXISTS ai_paused_at     timestamptz;

-- Partial index for the ai-pipeline-agent gate check (fast lookup of paused leads)
CREATE INDEX IF NOT EXISTS idx_leads_ai_enabled
  ON public.leads (ai_enabled)
  WHERE ai_enabled = false;

COMMENT ON COLUMN public.leads.ai_enabled IS 'Per-lead AI toggle. false = AI paused for this lead.';
COMMENT ON COLUMN public.leads.ai_paused_reason IS 'Why AI was paused: human_takeover | manual';
COMMENT ON COLUMN public.leads.ai_paused_at IS 'Timestamp when AI was paused on this lead';
