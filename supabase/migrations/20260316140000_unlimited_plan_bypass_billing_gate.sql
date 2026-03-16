-- Fix: Unlimited plan orgs must bypass all billing gates.
-- When plan = 'unlimited', force subscription_status = 'active' and access_state = 'full'
-- so the frontend never shows the checkout wizard or blocks access.

CREATE OR REPLACE FUNCTION public.get_org_billing_info(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_features jsonb := '{}'::jsonb;
  v_usage jsonb := '{}'::jsonb;
  v_credit_balances jsonb := '{}'::jsonb;
  v_active_addons jsonb := '[]'::jsonb;
  v_effective_limits jsonb := '{}'::jsonb;
  v_access_state text := 'blocked';
  v_subscription_status text;
  v_cycle text;
  v_broadcast_used integer := 0;
  v_ai_used integer := 0;
  v_automations_used integer := 0;
  v_proposals_generated integer := 0;
  v_campaigns_created integer := 0;
  v_leads_created integer := 0;
  v_broadcast_pack integer := 0;
  v_ai_pack integer := 0;
  v_automations_pack integer := 0;
  v_whatsapp_addon integer := 0;
  v_plan_max integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    o.id,
    o.plan,
    o.plan_limits,
    o.subscription_status,
    o.trial_ends_at,
    o.grace_ends_at,
    o.current_period_end
  INTO v_org
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT COALESCE(p.features, '{}'::jsonb)
    INTO v_features
  FROM public._admin_subscription_plans p
  WHERE p.plan_key = v_org.plan
  LIMIT 1;

  v_cycle := public.billing_current_cycle();

  SELECT
    COALESCE(MAX(CASE WHEN counter_key = 'broadcast_credits_used' THEN value END), 0),
    COALESCE(MAX(CASE WHEN counter_key = 'ai_requests_used' THEN value END), 0),
    COALESCE(MAX(CASE WHEN counter_key = 'automations_used' THEN value END), 0),
    COALESCE(MAX(CASE WHEN counter_key = 'proposals_generated' THEN value END), 0),
    COALESCE(MAX(CASE WHEN counter_key = 'campaigns_created' THEN value END), 0),
    COALESCE(MAX(CASE WHEN counter_key = 'leads_created' THEN value END), 0)
  INTO
    v_broadcast_used,
    v_ai_used,
    v_automations_used,
    v_proposals_generated,
    v_campaigns_created,
    v_leads_created
  FROM public.usage_counters
  WHERE org_id = p_org_id
    AND billing_cycle = v_cycle;

  v_usage := jsonb_build_object(
    'broadcast_credits_used', v_broadcast_used,
    'ai_requests_used', v_ai_used,
    'automations_used', v_automations_used,
    'proposals_generated', v_proposals_generated,
    'campaigns_created', v_campaigns_created,
    'leads_created', v_leads_created
  );

  SELECT COALESCE(jsonb_object_agg(credit_type, balance), '{}'::jsonb)
    INTO v_credit_balances
  FROM public.credit_balances
  WHERE org_id = p_org_id;

  v_broadcast_pack := COALESCE((v_credit_balances ->> 'broadcast_credits')::integer, 0);
  v_ai_pack := COALESCE((v_credit_balances ->> 'ai_requests')::integer, 0);
  v_automations_pack := COALESCE((v_credit_balances ->> 'automations')::integer, 0);

  SELECT COALESCE(sum(a.quantity * c.credit_amount), 0)
    INTO v_whatsapp_addon
  FROM public.addon_subscriptions a
  JOIN public._admin_addon_catalog c
    ON c.addon_key = a.addon_key
  WHERE a.org_id = p_org_id
    AND a.status = 'active'
    AND c.addon_type = 'recurring'
    AND c.limit_key = 'max_whatsapp_instances';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'addon_key', a.addon_key,
        'quantity', a.quantity
      )
      ORDER BY a.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_active_addons
  FROM public.addon_subscriptions a
  WHERE a.org_id = p_org_id
    AND a.status = 'active';

  v_effective_limits := COALESCE(v_org.plan_limits, '{}'::jsonb);

  v_plan_max := COALESCE((v_effective_limits ->> 'monthly_broadcast_credits')::integer, NULL);
  IF v_plan_max IS NOT NULL AND v_plan_max <> -1 THEN
    v_effective_limits := jsonb_set(
      v_effective_limits,
      '{monthly_broadcast_credits}',
      to_jsonb(v_plan_max + v_broadcast_pack),
      true
    );
  END IF;

  v_plan_max := COALESCE((v_effective_limits ->> 'included_ai_requests_month')::integer, NULL);
  IF v_plan_max IS NOT NULL AND v_plan_max <> -1 THEN
    v_effective_limits := jsonb_set(
      v_effective_limits,
      '{included_ai_requests_month}',
      to_jsonb(v_plan_max + v_ai_pack),
      true
    );
  END IF;

  v_plan_max := COALESCE((v_effective_limits ->> 'max_automations_month')::integer, NULL);
  IF v_plan_max IS NOT NULL AND v_plan_max <> -1 THEN
    v_effective_limits := jsonb_set(
      v_effective_limits,
      '{max_automations_month}',
      to_jsonb(v_plan_max + v_automations_pack),
      true
    );
  END IF;

  v_plan_max := COALESCE((v_effective_limits ->> 'max_whatsapp_instances')::integer, NULL);
  IF v_plan_max IS NOT NULL AND v_plan_max <> -1 THEN
    v_effective_limits := jsonb_set(
      v_effective_limits,
      '{max_whatsapp_instances}',
      to_jsonb(v_plan_max + v_whatsapp_addon),
      true
    );
  END IF;

  -- Unlimited plan: force full access, skip all billing gates
  IF v_org.plan = 'unlimited' THEN
    v_access_state := 'full';
    v_subscription_status := 'active';
  ELSE
    v_access_state := public.billing_compute_access_state(
      v_org.subscription_status,
      v_org.trial_ends_at,
      v_org.grace_ends_at
    );
    v_subscription_status := v_org.subscription_status;
  END IF;

  RETURN jsonb_build_object(
    'plan', v_org.plan,
    'plan_limits', COALESCE(v_org.plan_limits, '{}'::jsonb),
    'features', COALESCE(v_features, '{}'::jsonb),
    'subscription_status', v_subscription_status,
    'trial_ends_at', v_org.trial_ends_at,
    'grace_ends_at', v_org.grace_ends_at,
    'current_period_end', v_org.current_period_end,
    'access_state', v_access_state,
    'usage', v_usage,
    'effective_limits', v_effective_limits,
    'credit_balances', v_credit_balances,
    'active_addons', v_active_addons
  );
END;
$$;
