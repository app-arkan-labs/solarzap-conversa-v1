-- Admin Phase 2: organization status and plans

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'churned')),
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_limits jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.organizations
SET
  status = COALESCE(status, 'active'),
  plan = COALESCE(plan, 'free'),
  plan_limits = COALESCE(plan_limits, '{}'::jsonb)
WHERE status IS NULL OR plan IS NULL OR plan_limits IS NULL;

CREATE OR REPLACE VIEW public._admin_orgs_summary AS
SELECT
  o.id,
  o.name,
  o.owner_id,
  o.created_at,
  o.status,
  o.plan,
  o.plan_limits,
  o.suspended_at,
  o.suspension_reason,
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
