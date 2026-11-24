CREATE FUNCTION public.bootstrap_unlimited_signup_org(p_owner_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('solarzap-signup:' || p_owner_id::text, 0));

  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE owner_id = p_owner_id
  ORDER BY created_at, id
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  INSERT INTO public.organizations (name, owner_id, plan, plan_limits, subscription_status, onboarding_state)
  SELECT p_name, p_owner_id, plan_key, limits, 'active', '"active"'::jsonb
  FROM public._admin_subscription_plans
  WHERE plan_key = 'unlimited' AND is_active AND limits->>'max_leads' = '-1'
  RETURNING id INTO v_org_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Plano Ilimitado sem limites configurados';
  END IF;

  INSERT INTO public.org_billing_timeline (org_id, event_type, actor, payload)
  VALUES (v_org_id, 'plan_activated', 'org_admin', '{"source":"bootstrap_self","plan":"unlimited"}'::jsonb);

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_unlimited_signup_org(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_unlimited_signup_org(uuid, text) TO service_role;
