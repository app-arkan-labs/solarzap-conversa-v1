-- Delete one proposal version in org scope and cleanup orphan proposta records.
CREATE OR REPLACE FUNCTION public.delete_proposal_version(
  p_org_id uuid,
  p_proposal_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_role text;
  v_can_delete_proposals boolean := true;
  v_target_proposta_id bigint;
  v_remaining_versions bigint;
BEGIN
  IF p_org_id IS NULL OR p_proposal_version_id IS NULL THEN
    RAISE EXCEPTION 'Parametros invalidos para exclusao de proposta'
      USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Sem permissao para excluir propostas'
      USING ERRCODE = '42501';
  END IF;

  IF auth.role() <> 'service_role' THEN
    SELECT om.role
      INTO v_member_role
      FROM public.organization_members om
     WHERE om.org_id = p_org_id
       AND om.user_id = auth.uid()
     LIMIT 1;

    IF v_member_role IS NULL THEN
      RAISE EXCEPTION 'Sem permissao para excluir propostas'
        USING ERRCODE = '42501';
    END IF;

    IF v_member_role IN ('user', 'consultant') THEN
      SELECT COALESCE(
               (
                 SELECT osp.can_delete_proposals
                   FROM public.org_seller_permissions osp
                  WHERE osp.org_id = p_org_id
                  LIMIT 1
               ),
               true
             )
        INTO v_can_delete_proposals;

      IF NOT v_can_delete_proposals THEN
        RAISE EXCEPTION 'Sem permissao para excluir propostas'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  SELECT pv.proposta_id
    INTO v_target_proposta_id
    FROM public.proposal_versions pv
   WHERE pv.id = p_proposal_version_id
     AND pv.org_id = p_org_id
   LIMIT 1;

  IF v_target_proposta_id IS NULL THEN
    RAISE EXCEPTION 'Versao de proposta nao encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.proposal_versions pv
   WHERE pv.id = p_proposal_version_id
     AND pv.org_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versao de proposta nao encontrada'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::bigint
    INTO v_remaining_versions
    FROM public.proposal_versions pv
   WHERE pv.proposta_id = v_target_proposta_id;

  IF v_remaining_versions = 0 THEN
    DELETE FROM public.propostas p
     WHERE p.id = v_target_proposta_id
       AND (p.org_id = p_org_id OR p.org_id IS NULL);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_proposal_version(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_proposal_version(uuid, uuid) TO service_role;
