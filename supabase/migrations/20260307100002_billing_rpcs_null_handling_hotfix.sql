-- Hotfix P1: check_plan_limit null handling for counters/pack balances
-- Ensures current/projected/allowed are never null when no counter/balance row exists.

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
    SELECT uc.value
      INTO v_current
    FROM public.usage_counters uc
    WHERE uc.org_id = p_org_id
      AND uc.billing_cycle = v_cycle
      AND uc.counter_key = v_counter_key;
  ELSE
    v_current := 0;
  END IF;

  v_current := COALESCE(v_current, 0);

  IF v_credit_type IS NOT NULL THEN
    SELECT cb.balance
      INTO v_pack_remaining
    FROM public.credit_balances cb
    WHERE cb.org_id = p_org_id
      AND cb.credit_type = v_credit_type;
  END IF;

  v_pack_remaining := COALESCE(v_pack_remaining, 0);

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
