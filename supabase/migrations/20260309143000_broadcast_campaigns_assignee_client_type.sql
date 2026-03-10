ALTER TABLE public.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_client_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'broadcast_campaigns_lead_client_type_chk'
      AND conrelid = 'public.broadcast_campaigns'::regclass
  ) THEN
    ALTER TABLE public.broadcast_campaigns
      ADD CONSTRAINT broadcast_campaigns_lead_client_type_chk
      CHECK (lead_client_type IN ('residencial', 'comercial', 'industrial', 'rural', 'usina'));
  END IF;
END;
$$;

UPDATE public.broadcast_campaigns
SET assigned_to_user_id = user_id
WHERE assigned_to_user_id IS NULL;

UPDATE public.broadcast_campaigns
SET lead_client_type = 'residencial'
WHERE nullif(btrim(coalesce(lead_client_type, '')), '') IS NULL;

ALTER TABLE public.broadcast_campaigns
  ALTER COLUMN lead_client_type SET DEFAULT 'residencial';

ALTER TABLE public.broadcast_campaigns
  ALTER COLUMN lead_client_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_org_assigned_to
  ON public.broadcast_campaigns (org_id, assigned_to_user_id);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_org_lead_client_type
  ON public.broadcast_campaigns (org_id, lead_client_type);
