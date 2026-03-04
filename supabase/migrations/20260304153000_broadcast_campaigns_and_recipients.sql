CREATE TABLE IF NOT EXISTS public.broadcast_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  instance_name text NOT NULL,
  interval_seconds integer NOT NULL DEFAULT 15,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed', 'canceled')),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  source_channel text NOT NULL DEFAULT 'cold_list',
  pipeline_stage text NOT NULL DEFAULT 'novo_lead',
  ai_enabled boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_campaigns_messages_array_chk CHECK (jsonb_typeof(messages) = 'array')
);

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.broadcast_campaigns(id) ON DELETE CASCADE,
  lead_id bigint REFERENCES public.leads(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_org_status
  ON public.broadcast_campaigns (org_id, status);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign_status
  ON public.broadcast_recipients (campaign_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_recipients_campaign_phone
  ON public.broadcast_recipients (campaign_id, phone);

CREATE OR REPLACE FUNCTION public.broadcast_campaigns_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_broadcast_campaigns_updated_at ON public.broadcast_campaigns;
CREATE TRIGGER tr_broadcast_campaigns_updated_at
  BEFORE UPDATE ON public.broadcast_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_campaigns_set_updated_at();

ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcast_campaigns_service_all ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_service_all ON public.broadcast_campaigns
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS broadcast_campaigns_auth_select ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_select ON public.broadcast_campaigns
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS broadcast_campaigns_auth_insert ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_insert ON public.broadcast_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS broadcast_campaigns_auth_update ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_update ON public.broadcast_campaigns
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS broadcast_campaigns_auth_delete ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_delete ON public.broadcast_campaigns
  FOR DELETE TO authenticated
  USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS broadcast_recipients_service_all ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_service_all ON public.broadcast_recipients
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS broadcast_recipients_auth_select ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_auth_select ON public.broadcast_recipients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.broadcast_campaigns c
      WHERE c.id = broadcast_recipients.campaign_id
        AND public.user_belongs_to_org(c.org_id)
    )
  );

DROP POLICY IF EXISTS broadcast_recipients_auth_insert ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_auth_insert ON public.broadcast_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.broadcast_campaigns c
      WHERE c.id = broadcast_recipients.campaign_id
        AND public.user_belongs_to_org(c.org_id)
    )
  );

DROP POLICY IF EXISTS broadcast_recipients_auth_update ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_auth_update ON public.broadcast_recipients
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.broadcast_campaigns c
      WHERE c.id = broadcast_recipients.campaign_id
        AND public.user_belongs_to_org(c.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.broadcast_campaigns c
      WHERE c.id = broadcast_recipients.campaign_id
        AND public.user_belongs_to_org(c.org_id)
    )
  );

DROP POLICY IF EXISTS broadcast_recipients_auth_delete ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_auth_delete ON public.broadcast_recipients
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.broadcast_campaigns c
      WHERE c.id = broadcast_recipients.campaign_id
        AND public.user_belongs_to_org(c.org_id)
    )
  );
