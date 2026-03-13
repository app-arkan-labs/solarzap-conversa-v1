-- Blueprint Definitivo v2 — P0: Catálogo e Add-on Catalog
-- Escopo: atualização do catálogo de planos + criação do catálogo de add-ons.

-- 1) _admin_subscription_plans: garantir coluna stripe_price_id
ALTER TABLE public._admin_subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id text;

-- 2) Migrar chaves legadas de plano para as chaves finais (starter->start, business->scale)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public._admin_subscription_plans
    WHERE plan_key = 'starter'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public._admin_subscription_plans
      WHERE plan_key = 'start'
    ) THEN
      DELETE FROM public._admin_subscription_plans
      WHERE plan_key = 'starter';
    ELSE
      UPDATE public._admin_subscription_plans
      SET plan_key = 'start'
      WHERE plan_key = 'starter';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public._admin_subscription_plans
    WHERE plan_key = 'business'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public._admin_subscription_plans
      WHERE plan_key = 'scale'
    ) THEN
      DELETE FROM public._admin_subscription_plans
      WHERE plan_key = 'business';
    ELSE
      UPDATE public._admin_subscription_plans
      SET plan_key = 'scale'
      WHERE plan_key = 'business';
    END IF;
  END IF;
END
$$;

-- 3) Atualizar catálogo para o modelo comercial final v2
-- Mantemos o plano free para legados, mas a oferta pública é apenas Start/Pro/Scale.
INSERT INTO public._admin_subscription_plans (
  plan_key,
  display_name,
  price_cents,
  billing_cycle,
  stripe_price_id,
  limits,
  features,
  sort_order,
  is_active
)
VALUES
  (
    'free',
    'Grátis',
    0,
    'monthly',
    NULL,
    '{"max_leads":30,"max_whatsapp_instances":0,"monthly_broadcast_credits":0,"max_campaigns_month":0,"max_proposals_month":5,"max_members":1,"max_proposal_themes":1,"max_automations_month":0,"included_ai_requests_month":0}'::jsonb,
    '{"ai_enabled":false,"google_integration_enabled":false,"appointments_enabled":false,"advanced_reports_enabled":false,"advanced_tracking_enabled":false}'::jsonb,
    0,
    true
  ),
  (
    'start',
    'Start',
    19900,
    'monthly',
    NULL,
    '{"max_leads":300,"max_whatsapp_instances":1,"monthly_broadcast_credits":50,"max_campaigns_month":5,"max_proposals_month":50,"max_members":3,"max_proposal_themes":3,"max_automations_month":5000,"included_ai_requests_month":500}'::jsonb,
    '{"ai_enabled":true,"google_integration_enabled":false,"appointments_enabled":true,"advanced_reports_enabled":true,"advanced_tracking_enabled":false}'::jsonb,
    10,
    true
  ),
  (
    'pro',
    'Pro',
    29900,
    'monthly',
    NULL,
    '{"max_leads":1500,"max_whatsapp_instances":3,"monthly_broadcast_credits":200,"max_campaigns_month":20,"max_proposals_month":300,"max_members":10,"max_proposal_themes":-1,"max_automations_month":20000,"included_ai_requests_month":2000}'::jsonb,
    '{"ai_enabled":true,"google_integration_enabled":true,"appointments_enabled":true,"advanced_reports_enabled":true,"advanced_tracking_enabled":false}'::jsonb,
    20,
    true
  ),
  (
    'scale',
    'Scale',
    36900,
    'monthly',
    NULL,
    '{"max_leads":-1,"max_whatsapp_instances":10,"monthly_broadcast_credits":1000,"max_campaigns_month":-1,"max_proposals_month":-1,"max_members":-1,"max_proposal_themes":-1,"max_automations_month":100000,"included_ai_requests_month":10000}'::jsonb,
    '{"ai_enabled":true,"google_integration_enabled":true,"appointments_enabled":true,"advanced_reports_enabled":true,"advanced_tracking_enabled":true}'::jsonb,
    30,
    true
  )
ON CONFLICT (plan_key)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  price_cents = EXCLUDED.price_cents,
  billing_cycle = EXCLUDED.billing_cycle,
  stripe_price_id = COALESCE(public._admin_subscription_plans.stripe_price_id, EXCLUDED.stripe_price_id),
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 4) Garantir somente as 4 chaves do catálogo (free/start/pro/scale)
DELETE FROM public._admin_subscription_plans
WHERE plan_key IN ('starter', 'business');

-- 5) Compatibilidade legada: alinhar organizations.plan para novas chaves
UPDATE public.organizations
SET plan = 'start'
WHERE plan = 'starter';

UPDATE public.organizations
SET plan = 'scale'
WHERE plan = 'business';

-- 6) _admin_addon_catalog
CREATE TABLE IF NOT EXISTS public._admin_addon_catalog (
  addon_key text PRIMARY KEY,
  addon_type text NOT NULL CHECK (addon_type IN ('recurring', 'prepaid_pack')),
  display_name text NOT NULL,
  price_cents integer NOT NULL,
  stripe_price_id text,
  limit_key text NOT NULL,
  credit_amount integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public._admin_addon_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_authenticated ON public._admin_addon_catalog;
CREATE POLICY deny_authenticated
  ON public._admin_addon_catalog
  FOR ALL
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS service_role_all ON public._admin_addon_catalog;
CREATE POLICY service_role_all
  ON public._admin_addon_catalog
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_read_active ON public._admin_addon_catalog;
CREATE POLICY authenticated_read_active
  ON public._admin_addon_catalog
  FOR SELECT
  TO authenticated
  USING (is_active = true);

INSERT INTO public._admin_addon_catalog (
  addon_key,
  addon_type,
  display_name,
  price_cents,
  stripe_price_id,
  limit_key,
  credit_amount,
  is_active,
  sort_order
)
VALUES
  ('whatsapp_extra', 'recurring', 'WhatsApp extra (+1 número)', 5990, NULL, 'max_whatsapp_instances', 1, true, 10),
  ('automations_10k', 'prepaid_pack', 'Automações excedentes (+10K)', 3900, NULL, 'automations', 10000, true, 20),
  ('ai_pack_1k', 'prepaid_pack', 'IA Pack 1K', 7900, NULL, 'ai_requests', 1000, true, 30),
  ('ai_pack_5k', 'prepaid_pack', 'IA Pack 5K', 29900, NULL, 'ai_requests', 5000, true, 40),
  ('ai_pack_20k', 'prepaid_pack', 'IA Pack 20K', 99900, NULL, 'ai_requests', 20000, true, 50),
  ('disparo_pack_1k', 'prepaid_pack', 'Disparo Pack 1K', 4900, NULL, 'broadcast_credits', 1000, true, 60),
  ('disparo_pack_5k', 'prepaid_pack', 'Disparo Pack 5K', 14900, NULL, 'broadcast_credits', 5000, true, 70),
  ('disparo_pack_25k', 'prepaid_pack', 'Disparo Pack 25K', 39900, NULL, 'broadcast_credits', 25000, true, 80)
ON CONFLICT (addon_key)
DO UPDATE SET
  addon_type = EXCLUDED.addon_type,
  display_name = EXCLUDED.display_name,
  price_cents = EXCLUDED.price_cents,
  stripe_price_id = COALESCE(public._admin_addon_catalog.stripe_price_id, EXCLUDED.stripe_price_id),
  limit_key = EXCLUDED.limit_key,
  credit_amount = EXCLUDED.credit_amount,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- 7) Backfill seguro: free com plan_limits vazio recebe limits do catálogo free
UPDATE public.organizations o
SET plan_limits = p.limits
FROM public._admin_subscription_plans p
WHERE p.plan_key = 'free'
  AND o.plan = 'free'
  AND (
    o.plan_limits IS NULL
    OR o.plan_limits = '{}'::jsonb
  );
