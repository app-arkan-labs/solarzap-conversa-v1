-- Blueprint Definitivo v2 — P1: Modelo de Dados Billing + Metering
-- Escopo: colunas em organizations + tabelas de metering/billing + RLS + backfill.

-- 1) organizations: colunas de billing
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('none', 'pending_checkout', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_state jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill compatível com legado:
-- - orgs pagas (plan != free): active
-- - orgs free: none
UPDATE public.organizations
SET subscription_status = 'active'
WHERE COALESCE(plan, 'free') <> 'free'
  AND COALESCE(subscription_status, 'none') = 'none';

UPDATE public.organizations
SET subscription_status = 'none'
WHERE COALESCE(plan, 'free') = 'free'
  AND subscription_status IS NULL;

-- 2) usage_events (append-only)
CREATE TABLE IF NOT EXISTS public.usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  billing_cycle text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_org_cycle
  ON public.usage_events (org_id, billing_cycle);

CREATE INDEX IF NOT EXISTS idx_usage_events_org_type_cycle
  ON public.usage_events (org_id, event_type, billing_cycle);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_events_service_all ON public.usage_events;
CREATE POLICY usage_events_service_all
  ON public.usage_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS usage_events_auth_select ON public.usage_events;
CREATE POLICY usage_events_auth_select
  ON public.usage_events
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(org_id));

-- 3) usage_counters (agregados)
CREATE TABLE IF NOT EXISTS public.usage_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  billing_cycle text NOT NULL,
  counter_key text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, billing_cycle, counter_key)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_counters_service_all ON public.usage_counters;
CREATE POLICY usage_counters_service_all
  ON public.usage_counters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS usage_counters_auth_select ON public.usage_counters;
CREATE POLICY usage_counters_auth_select
  ON public.usage_counters
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(org_id));

-- 4) credit_balances (saldo carryover de packs)
CREATE TABLE IF NOT EXISTS public.credit_balances (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credit_type text NOT NULL,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, credit_type)
);

ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_balances_service_all ON public.credit_balances;
CREATE POLICY credit_balances_service_all
  ON public.credit_balances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS credit_balances_auth_select ON public.credit_balances;
CREATE POLICY credit_balances_auth_select
  ON public.credit_balances
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(org_id));

-- 5) billing_events (audit trail Stripe)
CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  stripe_event_id text UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_events_service_all ON public.billing_events;
CREATE POLICY billing_events_service_all
  ON public.billing_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6) addon_subscriptions (add-ons recorrentes ativos)
CREATE TABLE IF NOT EXISTS public.addon_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  addon_key text NOT NULL REFERENCES public._admin_addon_catalog(addon_key),
  quantity integer NOT NULL DEFAULT 1,
  stripe_subscription_item_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  canceled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_org_status
  ON public.addon_subscriptions (org_id, status);

ALTER TABLE public.addon_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS addon_subscriptions_service_all ON public.addon_subscriptions;
CREATE POLICY addon_subscriptions_service_all
  ON public.addon_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS addon_subscriptions_auth_select ON public.addon_subscriptions;
CREATE POLICY addon_subscriptions_auth_select
  ON public.addon_subscriptions
  FOR SELECT
  TO authenticated
  USING (public.user_belongs_to_org(org_id));
