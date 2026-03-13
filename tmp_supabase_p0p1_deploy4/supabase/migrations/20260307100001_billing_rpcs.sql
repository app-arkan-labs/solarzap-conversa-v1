-- Blueprint Definitivo v2 — P1: RPCs de metering e billing
-- Regra crítica aplicada: check_plan_limit(p_org_id, p_limit_key, p_quantity DEFAULT 1)

-- Helpers internos
CREATE OR REPLACE FUNCTION public.billing_current_cycle()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(now(), 'YYYY-MM')
$$;

CREATE OR REPLACE FUNCTION public.billing_counter_key_from_event(p_event_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_event_type
    WHEN 'broadcast_credit_consumed' THEN RETURN 'broadcast_credits_used';
    WHEN 'ai_request' THEN RETURN 'ai_requests_used';
    WHEN 'automation_execution' THEN RETURN 'automations_used';
    WHEN 'proposal_generated' THEN RETURN 'proposals_generated';
    WHEN 'lead_created' THEN RETURN 'leads_created';
    WHEN 'campaign_created' THEN RETURN 'campaigns_created';
    ELSE RETURN p_event_type || '_used';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_counter_key_from_limit(p_limit_key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_limit_key
    WHEN 'monthly_broadcast_credits' THEN RETURN 'broadcast_credits_used';
    WHEN 'included_ai_requests_month' THEN RETURN 'ai_requests_used';
    WHEN 'max_automations_month' THEN RETURN 'automations_used';
    WHEN 'max_proposals_month' THEN RETURN 'proposals_generated';
    WHEN 'max_campaigns_month' THEN RETURN 'campaigns_created';
    ELSE RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_credit_type_from_limit(p_limit_key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_limit_key
    WHEN 'monthly_broadcast_credits' THEN RETURN 'broadcast_credits';
    WHEN 'included_ai_requests_month' THEN RETURN 'ai_requests';
    WHEN 'max_automations_month' THEN RETURN 'automations';
    ELSE RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_compute_access_state(
  p_subscription_status text,
  p_trial_ends_at timestamptz,
  p_grace_ends_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  CASE COALESCE(p_subscription_status, 'none')
    WHEN 'none' THEN
      RETURN 'blocked';
    WHEN 'pending_checkout' THEN
      RETURN 'blocked';
    WHEN 'trialing' THEN
      IF p_trial_ends_at IS NOT NULL AND p_trial_ends_at > now() THEN
        RETURN 'full';
      END IF;
      RETURN 'blocked';
    WHEN 'active' THEN
      RETURN 'full';
    WHEN 'past_due' THEN
      IF p_grace_ends_at IS NOT NULL AND p_grace_ends_at > now() THEN
        RETURN 'read_only';
      END IF;
      RETURN 'blocked';
    WHEN 'canceled' THEN
      RETURN 'blocked';
    WHEN 'unpaid' THEN
      RETURN 'blocked';
    ELSE
      RETURN 'blocked';
  END CASE;
END;
$$;

-- record_usage(p_org_id, p_event_type, p_quantity, p_metadata)
CREATE OR REPLACE FUNCTION public.record_usage(
  p_org_id uuid,
  p_event_type text,
  p_quantity integer DEFAULT 1,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle text;
  v_counter_key text;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'p_event_type is required';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'p_quantity must be > 0';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_cycle := public.billing_current_cycle();
  v_counter_key := public.billing_counter_key_from_event(p_event_type);

  INSERT INTO public.usage_events (org_id, event_type, quantity, metadata, billing_cycle)
  VALUES (p_org_id, p_event_type, p_quantity, COALESCE(p_metadata, '{}'::jsonb), v_cycle);

  INSERT INTO public.usage_counters (org_id, billing_cycle, counter_key, value, updated_at)
  VALUES (p_org_id, v_cycle, v_counter_key, p_quantity, now())
  ON CONFLICT (org_id, billing_cycle, counter_key)
  DO UPDATE SET
    value = public.usage_counters.value + EXCLUDED.value,
    updated_at = now();

  RETURN jsonb_build_object(
    'org_id', p_org_id,
    'event_type', p_event_type,
    'counter_key', v_counter_key,
    'quantity', p_quantity,
    'billing_cycle', v_cycle
  );
END;
$$;

-- Garantir que não exista a versão antiga de 2 parâmetros
DROP FUNCTION IF EXISTS public.check_plan_limit(uuid, text);

-- check_plan_limit(p_org_id, p_limit_key, p_quantity DEFAULT 1)
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_org_id uuid,
  p_limit_key text,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_limits jsonb;
  v_plan_max integer;
  v_current integer := 0;
  v_projected integer := 0;
  v_effective_max integer := 0;
  v_pack_remaining integer := 0;
  v_recurring_increment integer := 0;
  v_counter_key text;
  v_credit_type text;
  v_cycle text;
  v_has_leads_deleted_at boolean := false;
  v_has_company_profile boolean := false;
  v_allowed boolean;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF p_limit_key IS NULL OR btrim(p_limit_key) = '' THEN
    RAISE EXCEPTION 'p_limit_key is required';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'p_quantity must be > 0';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT o.plan_limits
    INTO v_plan_limits
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF v_plan_limits IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'current', 0,
      'projected', p_quantity,
      'effective_max', 0,
      'pack_remaining', 0
    );
  END IF;

  v_plan_max := COALESCE((v_plan_limits ->> p_limit_key)::integer, 0);

  SELECT COALESCE(sum(a.quantity * c.credit_amount), 0)
    INTO v_recurring_increment
  FROM public.addon_subscriptions a
  JOIN public._admin_addon_catalog c
    ON c.addon_key = a.addon_key
  WHERE a.org_id = p_org_id
    AND a.status = 'active'
    AND c.addon_type = 'recurring'
    AND c.limit_key = p_limit_key;

  v_counter_key := public.billing_counter_key_from_limit(p_limit_key);
  v_credit_type := public.billing_credit_type_from_limit(p_limit_key);
  v_cycle := public.billing_current_cycle();

  IF p_limit_key = 'max_leads' THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'leads'
        AND column_name = 'deleted_at'
    )
    INTO v_has_leads_deleted_at;

    IF v_has_leads_deleted_at THEN
      EXECUTE 'SELECT count(*)::int FROM public.leads WHERE org_id = $1 AND deleted_at IS NULL'
      INTO v_current
      USING p_org_id;
    ELSE
      EXECUTE 'SELECT count(*)::int FROM public.leads WHERE org_id = $1'
      INTO v_current
      USING p_org_id;
    END IF;

  ELSIF p_limit_key = 'max_whatsapp_instances' THEN
    SELECT count(*)::int
      INTO v_current
    FROM public.whatsapp_instances
    WHERE org_id = p_org_id;

  ELSIF p_limit_key = 'max_members' THEN
    SELECT count(*)::int
      INTO v_current
    FROM public.organization_members
    WHERE org_id = p_org_id;

  ELSIF p_limit_key = 'max_proposal_themes' THEN
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'company_profile'
    )
    INTO v_has_company_profile;

    IF v_has_company_profile THEN
      EXECUTE 'SELECT count(distinct proposal_theme)::int FROM public.company_profile WHERE org_id = $1'
      INTO v_current
      USING p_org_id;
    ELSE
      v_current := 0;
    END IF;

  ELSIF v_counter_key IS NOT NULL THEN
    SELECT COALESCE(uc.value, 0)
      INTO v_current
    FROM public.usage_counters uc
    WHERE uc.org_id = p_org_id
      AND uc.billing_cycle = v_cycle
      AND uc.counter_key = v_counter_key;
  ELSE
    v_current := 0;
  END IF;

  IF v_credit_type IS NOT NULL THEN
    SELECT COALESCE(cb.balance, 0)
      INTO v_pack_remaining
    FROM public.credit_balances cb
    WHERE cb.org_id = p_org_id
      AND cb.credit_type = v_credit_type;
  END IF;

  IF v_plan_max = -1 THEN
    v_projected := v_current + p_quantity;
    RETURN jsonb_build_object(
      'allowed', true,
      'current', v_current,
      'projected', v_projected,
      'effective_max', -1,
      'pack_remaining', v_pack_remaining
    );
  END IF;

  v_effective_max := GREATEST(COALESCE(v_plan_max, 0), 0)
                   + GREATEST(COALESCE(v_recurring_increment, 0), 0)
                   + GREATEST(COALESCE(v_pack_remaining, 0), 0);

  v_projected := v_current + p_quantity;
  v_allowed := v_projected <= v_effective_max;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current', v_current,
    'projected', v_projected,
    'effective_max', v_effective_max,
    'pack_remaining', v_pack_remaining
  );
END;
$$;

-- get_org_billing_info(p_org_id)
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

  v_access_state := public.billing_compute_access_state(
    v_org.subscription_status,
    v_org.trial_ends_at,
    v_org.grace_ends_at
  );

  RETURN jsonb_build_object(
    'plan', v_org.plan,
    'plan_limits', COALESCE(v_org.plan_limits, '{}'::jsonb),
    'features', COALESCE(v_features, '{}'::jsonb),
    'subscription_status', v_org.subscription_status,
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

GRANT EXECUTE ON FUNCTION public.record_usage(uuid, text, integer, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_plan_limit(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_org_billing_info(uuid) TO authenticated, service_role;
