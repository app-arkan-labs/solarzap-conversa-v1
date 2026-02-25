-- Add org_id to proposal_delivery_events for multi-tenant filtering
ALTER TABLE public.proposal_delivery_events
  ADD COLUMN IF NOT EXISTS org_id uuid;

-- Backfill from proposal_versions
UPDATE public.proposal_delivery_events pde
SET org_id = pv.org_id
FROM public.proposal_versions pv
WHERE pde.proposal_version_id = pv.id
  AND pde.org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pde_org_id
  ON public.proposal_delivery_events(org_id);
