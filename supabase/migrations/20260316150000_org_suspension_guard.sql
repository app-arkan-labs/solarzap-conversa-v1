-- Fase 1 + 5 + 8: Suspension guard helpers, RLS write-block, and audit log
-- Safe: all CREATE OR REPLACE / IF NOT EXISTS — fully idempotent

-- =====================================================================
-- 1.1  Helper: is_org_suspended(uuid) → boolean
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_org_suspended(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT o.status = 'suspended' FROM public.organizations o WHERE o.id = p_org_id),
    true
  );
$$;

-- =====================================================================
-- 1.2  Helper: assert_org_active(uuid) → boolean
-- =====================================================================
CREATE OR REPLACE FUNCTION public.assert_org_active(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT o.status = 'active' FROM public.organizations o WHERE o.id = p_org_id),
    false
  );
$$;

-- =====================================================================
-- 8.1  Audit table: _admin_suspension_log
-- =====================================================================
CREATE TABLE IF NOT EXISTS public._admin_suspension_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES public.organizations(id),
  blocked_action text NOT NULL,
  blocked_at  timestamptz NOT NULL DEFAULT now(),
  details     jsonb
);

ALTER TABLE public._admin_suspension_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = '_admin_suspension_log'
      AND policyname = 'admin_suspension_log_deny_all'
  ) THEN
    CREATE POLICY admin_suspension_log_deny_all
      ON public._admin_suspension_log FOR ALL TO authenticated
      USING (false);
  END IF;
END;
$$;

-- =====================================================================
-- 5. RLS — block writes for suspended orgs (authenticated role only)
-- =====================================================================

-- ---------- broadcast_campaigns ----------
DROP POLICY IF EXISTS broadcast_campaigns_auth_insert ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_insert
  ON public.broadcast_campaigns FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS broadcast_campaigns_auth_update ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_update
  ON public.broadcast_campaigns FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS broadcast_campaigns_auth_delete ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_auth_delete
  ON public.broadcast_campaigns FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

-- ---------- broadcast_recipients (no org_id — join through campaign) ----------
DROP POLICY IF EXISTS broadcast_recipients_auth_insert ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_auth_insert
  ON public.broadcast_recipients FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.broadcast_campaigns c
      WHERE c.id = broadcast_recipients.campaign_id
        AND public.user_belongs_to_org(c.org_id)
        AND NOT public.is_org_suspended(c.org_id))
  );

DROP POLICY IF EXISTS broadcast_recipients_auth_update ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_auth_update
  ON public.broadcast_recipients FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.broadcast_campaigns c
      WHERE c.id = broadcast_recipients.campaign_id
        AND public.user_belongs_to_org(c.org_id)
        AND NOT public.is_org_suspended(c.org_id))
  );

DROP POLICY IF EXISTS broadcast_recipients_auth_delete ON public.broadcast_recipients;
CREATE POLICY broadcast_recipients_auth_delete
  ON public.broadcast_recipients FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.broadcast_campaigns c
      WHERE c.id = broadcast_recipients.campaign_id
        AND public.user_belongs_to_org(c.org_id)
        AND NOT public.is_org_suspended(c.org_id))
  );

-- ---------- leads (INSERT allowed for service_role via webhook, block for authenticated) ----------
DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update
  ON public.leads FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete
  ON public.leads FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

-- ---------- interacoes ----------
DROP POLICY IF EXISTS m3_auth_insert_org ON public.interacoes;
CREATE POLICY m3_auth_insert_org
  ON public.interacoes FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS m3_auth_update_org ON public.interacoes;
CREATE POLICY m3_auth_update_org
  ON public.interacoes FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS m3_auth_delete_org ON public.interacoes;
CREATE POLICY m3_auth_delete_org
  ON public.interacoes FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

-- ---------- propostas ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'propostas') THEN
    DROP POLICY IF EXISTS m3_auth_insert_org ON public.propostas;
    CREATE POLICY m3_auth_insert_org
      ON public.propostas FOR INSERT TO authenticated
      WITH CHECK (
        public.user_belongs_to_org(org_id)
        AND NOT public.is_org_suspended(org_id)
      );

    DROP POLICY IF EXISTS m3_auth_update_org ON public.propostas;
    CREATE POLICY m3_auth_update_org
      ON public.propostas FOR UPDATE TO authenticated
      USING (
        public.user_belongs_to_org(org_id)
        AND NOT public.is_org_suspended(org_id)
      );

    DROP POLICY IF EXISTS m3_auth_delete_org ON public.propostas;
    CREATE POLICY m3_auth_delete_org
      ON public.propostas FOR DELETE TO authenticated
      USING (
        public.user_belongs_to_org(org_id)
        AND NOT public.is_org_suspended(org_id)
      );
  END IF;
END;
$$;

-- ---------- whatsapp_instances ----------
DROP POLICY IF EXISTS m3_auth_insert_org ON public.whatsapp_instances;
CREATE POLICY m3_auth_insert_org
  ON public.whatsapp_instances FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS m3_auth_update_org ON public.whatsapp_instances;
CREATE POLICY m3_auth_update_org
  ON public.whatsapp_instances FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS m3_auth_delete_org ON public.whatsapp_instances;
CREATE POLICY m3_auth_delete_org
  ON public.whatsapp_instances FOR DELETE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

-- ---------- notification_settings ----------
DROP POLICY IF EXISTS notification_settings_auth_insert ON public.notification_settings;
CREATE POLICY notification_settings_auth_insert
  ON public.notification_settings FOR INSERT TO authenticated
  WITH CHECK (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );

DROP POLICY IF EXISTS notification_settings_auth_update ON public.notification_settings;
CREATE POLICY notification_settings_auth_update
  ON public.notification_settings FOR UPDATE TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND NOT public.is_org_suspended(org_id)
  );
