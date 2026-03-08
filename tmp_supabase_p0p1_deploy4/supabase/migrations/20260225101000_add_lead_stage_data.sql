-- Fase 1: structured AI agent data by pipeline stage (JSONB namespace)

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_stage_data jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_leads_stage_data_gin
  ON public.leads USING gin (lead_stage_data);

CREATE INDEX IF NOT EXISTS idx_leads_financing_status
  ON public.leads ((lead_stage_data -> 'financiamento' ->> 'financing_status'))
  WHERE (lead_stage_data -> 'financiamento' ->> 'financing_status') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_negotiation_status
  ON public.leads ((lead_stage_data -> 'negociacao' ->> 'negotiation_status'))
  WHERE (lead_stage_data -> 'negociacao' ->> 'negotiation_status') IS NOT NULL;

COMMENT ON COLUMN public.leads.lead_stage_data IS
  'JSONB namespaced by stage. Stores structured AI agent data (BANT, no-show, negotiation, financing).';
