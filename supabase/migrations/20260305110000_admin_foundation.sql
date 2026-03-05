-- Admin foundation (Phase 1)

-- ==========================================================
-- 1) _admin_system_admins
-- ==========================================================
CREATE TABLE IF NOT EXISTS public._admin_system_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  system_role text NOT NULL CHECK (
    system_role IN ('super_admin', 'ops', 'support', 'billing', 'read_only')
  ),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

ALTER TABLE public._admin_system_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_authenticated ON public._admin_system_admins;
CREATE POLICY deny_authenticated
  ON public._admin_system_admins
  FOR ALL
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS service_role_all ON public._admin_system_admins;
CREATE POLICY service_role_all
  ON public._admin_system_admins
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ==========================================================
-- 2) _admin_audit_log (append-only)
-- ==========================================================
CREATE TABLE IF NOT EXISTS public._admin_audit_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NOT NULL,
  actor_system_role text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  org_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  user_agent text,
  reason text
);

ALTER TABLE public._admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_authenticated ON public._admin_audit_log;
CREATE POLICY deny_authenticated
  ON public._admin_audit_log
  FOR ALL
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS service_role_read ON public._admin_audit_log;
CREATE POLICY service_role_read
  ON public._admin_audit_log
  FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS service_role_insert ON public._admin_audit_log;
CREATE POLICY service_role_insert
  ON public._admin_audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

REVOKE UPDATE, DELETE ON public._admin_audit_log FROM service_role;

CREATE OR REPLACE FUNCTION public._admin_audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public._admin_audit_log;
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public._admin_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public._admin_audit_log_immutable();

CREATE INDEX IF NOT EXISTS idx_admin_audit_ts
  ON public._admin_audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor
  ON public._admin_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target
  ON public._admin_audit_log(target_type, target_id);

-- ==========================================================
-- 3) _admin_orgs_summary (view + protection)
-- ==========================================================
CREATE OR REPLACE VIEW public._admin_orgs_summary AS
SELECT
  o.id,
  o.name,
  o.owner_id,
  o.created_at,
  'active'::text AS status,
  'free'::text AS plan,
  '{}'::jsonb AS plan_limits,
  null::timestamptz AS suspended_at,
  null::text AS suspension_reason,
  (
    SELECT count(*)
    FROM public.organization_members m
    WHERE m.org_id = o.id
  ) AS member_count,
  (
    SELECT count(*)
    FROM public.leads l
    WHERE l.org_id = o.id
  ) AS lead_count,
  (
    SELECT count(*)
    FROM public.propostas p
    WHERE p.org_id = o.id
  ) AS proposal_count,
  (
    SELECT count(*)
    FROM public.whatsapp_instances w
    WHERE w.org_id = o.id
  ) AS instance_count
FROM public.organizations o;

REVOKE ALL ON public._admin_orgs_summary FROM anon, authenticated;
GRANT SELECT ON public._admin_orgs_summary TO service_role;
