CREATE OR REPLACE FUNCTION public.crm_bridge_org_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_member_count integer := 0;
  v_instance_count integer := 0;
  v_lead_count integer := 0;
  v_proposal_count integer := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    o.id,
    o.name,
    o.owner_id,
    o.plan,
    o.subscription_status,
    o.status,
    o.trial_ends_at,
    o.grace_ends_at,
    o.current_period_end,
    o.created_at,
    o.updated_at
  INTO v_org
  FROM public.organizations o
  WHERE o.id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'org_id', p_org_id
    );
  END IF;

  SELECT count(*)::integer INTO v_member_count
  FROM public.organization_members
  WHERE org_id = p_org_id;

  SELECT count(*)::integer INTO v_instance_count
  FROM public.whatsapp_instances
  WHERE org_id = p_org_id;

  SELECT count(*)::integer INTO v_lead_count
  FROM public.leads
  WHERE org_id = p_org_id;

  SELECT count(*)::integer INTO v_proposal_count
  FROM public.propostas
  WHERE org_id = p_org_id;

  RETURN jsonb_build_object(
    'found', true,
    'org', jsonb_build_object(
      'id', v_org.id,
      'name', v_org.name,
      'owner_id', v_org.owner_id,
      'plan', v_org.plan,
      'subscription_status', v_org.subscription_status,
      'status', v_org.status,
      'trial_ends_at', v_org.trial_ends_at,
      'grace_ends_at', v_org.grace_ends_at,
      'current_period_end', v_org.current_period_end,
      'created_at', v_org.created_at,
      'updated_at', v_org.updated_at
    ),
    'stats', jsonb_build_object(
      'member_count', v_member_count,
      'instance_count', v_instance_count,
      'lead_count', v_lead_count,
      'proposal_count', v_proposal_count
    )
  );
END;
$$;
