-- Expose org suspension status to authenticated members without opening organizations RLS.

CREATE OR REPLACE FUNCTION public.get_org_status(p_org_id uuid)
RETURNS TABLE (
  status text,
  suspension_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    o.status,
    o.suspension_reason
  FROM public.organizations o
  WHERE o.id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_status(uuid) TO authenticated, service_role;
