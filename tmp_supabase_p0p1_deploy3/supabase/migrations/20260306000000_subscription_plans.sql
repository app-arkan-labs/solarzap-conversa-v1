-- Subscription Plans & Billing Foundation
-- Phase: Admin Panel Financial Module

-- ==========================================================
-- 1) Subscription plans catalog
-- ==========================================================
CREATE TABLE IF NOT EXISTS public._admin_subscription_plans (
  plan_key text PRIMARY KEY,
  display_name text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly', 'lifetime')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._admin_subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_authenticated ON public._admin_subscription_plans;
CREATE POLICY deny_authenticated
  ON public._admin_subscription_plans
  FOR ALL
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS service_role_all ON public._admin_subscription_plans;
CREATE POLICY service_role_all
  ON public._admin_subscription_plans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read active plans (for upgrade wall)
DROP POLICY IF EXISTS authenticated_read_active ON public._admin_subscription_plans;
CREATE POLICY authenticated_read_active
  ON public._admin_subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ==========================================================
-- 2) Seed default plans
-- ==========================================================
INSERT INTO public._admin_subscription_plans (plan_key, display_name, price_cents, billing_cycle, limits, features, sort_order)
VALUES
  ('free', 'Grátis', 0, 'monthly', 
   '{"max_members": 1, "max_leads": 30, "max_proposals_month": 5, "max_whatsapp_instances": 0, "max_broadcasts_month": 0, "max_proposal_themes": 1}'::jsonb,
   '{"ai_enabled": false, "google_integration_enabled": false, "appointments_enabled": false, "advanced_reports_enabled": false}'::jsonb,
   0),
  ('starter', 'Starter', 6900, 'monthly',
   '{"max_members": 3, "max_leads": 200, "max_proposals_month": 30, "max_whatsapp_instances": 1, "max_broadcasts_month": 5, "max_proposal_themes": 3}'::jsonb,
   '{"ai_enabled": true, "google_integration_enabled": false, "appointments_enabled": true, "advanced_reports_enabled": true}'::jsonb,
   10),
  ('pro', 'Pro', 14900, 'monthly',
   '{"max_members": 10, "max_leads": 1000, "max_proposals_month": 150, "max_whatsapp_instances": 3, "max_broadcasts_month": 50, "max_proposal_themes": -1}'::jsonb,
   '{"ai_enabled": true, "google_integration_enabled": true, "appointments_enabled": true, "advanced_reports_enabled": true}'::jsonb,
   20),
  ('business', 'Business', 29900, 'monthly',
   '{"max_members": -1, "max_leads": -1, "max_proposals_month": -1, "max_whatsapp_instances": 10, "max_broadcasts_month": -1, "max_proposal_themes": -1}'::jsonb,
   '{"ai_enabled": true, "google_integration_enabled": true, "appointments_enabled": true, "advanced_reports_enabled": true}'::jsonb,
   30)
ON CONFLICT (plan_key) DO NOTHING;

-- ==========================================================
-- 3) Add billing columns to organizations
-- ==========================================================
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS plan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Backfill plan_started_at for existing orgs
UPDATE public.organizations
SET plan_started_at = created_at
WHERE plan_started_at IS NULL;

-- ==========================================================
-- 4) Update the admin orgs summary view to include billing info
-- ==========================================================
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
  o.billing_email,
  o.plan_started_at,
  o.plan_expires_at,
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

-- ==========================================================
-- 5) Function for app to read own org plan limits (for enforcement)
-- ==========================================================
CREATE OR REPLACE FUNCTION public.get_org_plan_info(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT jsonb_build_object(
    'plan', o.plan,
    'plan_limits', o.plan_limits,
    'plan_started_at', o.plan_started_at,
    'plan_expires_at', o.plan_expires_at,
    'status', o.status
  )
  INTO v_result
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_result IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_plan_info(uuid) TO authenticated, service_role;
