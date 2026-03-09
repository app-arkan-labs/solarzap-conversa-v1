-- Persist average monthly electricity bill as financial reference for proposals.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS conta_luz_mensal numeric;
