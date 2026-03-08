-- Safe prerequisite for billing catalog v2
-- Ensures _admin_subscription_plans exists before P0 migration runs.

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

ALTER TABLE public._admin_subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

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

DROP POLICY IF EXISTS authenticated_read_active ON public._admin_subscription_plans;
CREATE POLICY authenticated_read_active
  ON public._admin_subscription_plans
  FOR SELECT
  TO authenticated
  USING (is_active = true);
