-- Admin Phase 2: feature flags

CREATE TABLE IF NOT EXISTS public._admin_feature_flags (
  flag_key text PRIMARY KEY,
  description text,
  default_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public._admin_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_authenticated ON public._admin_feature_flags;
CREATE POLICY deny_authenticated
  ON public._admin_feature_flags
  FOR ALL
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS service_role_all ON public._admin_feature_flags;
CREATE POLICY service_role_all
  ON public._admin_feature_flags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public._admin_org_feature_overrides (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flag_key text NOT NULL REFERENCES public._admin_feature_flags(flag_key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (org_id, flag_key)
);

ALTER TABLE public._admin_org_feature_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_authenticated ON public._admin_org_feature_overrides;
CREATE POLICY deny_authenticated
  ON public._admin_org_feature_overrides
  FOR ALL
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS service_role_all ON public._admin_org_feature_overrides;
CREATE POLICY service_role_all
  ON public._admin_org_feature_overrides
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_org_feature_flags(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      f.flag_key,
      COALESCE(o.enabled, f.default_enabled)
    ),
    '{}'::jsonb
  )
  INTO v_result
  FROM public._admin_feature_flags f
  LEFT JOIN public._admin_org_feature_overrides o
    ON o.flag_key = f.flag_key
   AND o.org_id = p_org_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_feature_flags(uuid) TO authenticated, service_role;
