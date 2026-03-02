-- Harden proposals RPC contracts:
-- - keep backward compatibility with premium_payload.share_url
-- - support newer premium_payload.share.url structure

CREATE OR REPLACE FUNCTION public.get_lead_proposals(
  p_org_id uuid,
  p_lead_id bigint
)
RETURNS TABLE (
  proposal_version_id uuid,
  proposta_id bigint,
  lead_id bigint,
  lead_name text,
  lead_phone text,
  lead_stage text,
  owner_user_id uuid,
  version_no integer,
  created_at timestamptz,
  status text,
  segment text,
  source text,
  valor_projeto numeric,
  pdf_url text,
  share_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pv.id AS proposal_version_id,
    pv.proposta_id::bigint AS proposta_id,
    pv.lead_id::bigint AS lead_id,
    COALESCE(l.nome, ('Lead ' || pv.lead_id::text))::text AS lead_name,
    COALESCE(l.telefone, l.phone_e164, '')::text AS lead_phone,
    COALESCE(l.status_pipeline, '')::text AS lead_stage,
    COALESCE(l.assigned_to_user_id, l.user_id)::uuid AS owner_user_id,
    COALESCE(pv.version_no, 1)::integer AS version_no,
    pv.created_at,
    COALESCE(pv.status, 'draft')::text AS status,
    COALESCE(pv.segment, '')::text AS segment,
    COALESCE(pv.source, '')::text AS source,
    p.valor_projeto::numeric AS valor_projeto,
    COALESCE(
      pv.premium_payload ->> 'public_pdf_url',
      pv.premium_payload ->> 'client_pdf_url',
      pv.premium_payload ->> 'pdf_url'
    )::text AS pdf_url,
    COALESCE(
      pv.premium_payload ->> 'share_url',
      pv.premium_payload -> 'share' ->> 'url'
    )::text AS share_url
  FROM public.proposal_versions pv
  INNER JOIN public.leads l
    ON l.id = pv.lead_id
   AND l.org_id = p_org_id
  LEFT JOIN public.propostas p
    ON p.id = pv.proposta_id
   AND (p.org_id = p_org_id OR p.org_id IS NULL)
  WHERE pv.org_id = p_org_id
    AND pv.lead_id = p_lead_id
    AND (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.org_id = p_org_id
          AND om.user_id = auth.uid()
      )
    )
  ORDER BY pv.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_proposals(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_owner uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  proposal_version_id uuid,
  proposta_id bigint,
  lead_id bigint,
  lead_name text,
  lead_phone text,
  lead_stage text,
  owner_user_id uuid,
  version_no integer,
  created_at timestamptz,
  status text,
  segment text,
  source text,
  valor_projeto numeric,
  pdf_url text,
  share_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pv.id AS proposal_version_id,
    pv.proposta_id::bigint AS proposta_id,
    pv.lead_id::bigint AS lead_id,
    COALESCE(l.nome, ('Lead ' || pv.lead_id::text))::text AS lead_name,
    COALESCE(l.telefone, l.phone_e164, '')::text AS lead_phone,
    COALESCE(l.status_pipeline, '')::text AS lead_stage,
    COALESCE(l.assigned_to_user_id, l.user_id)::uuid AS owner_user_id,
    COALESCE(pv.version_no, 1)::integer AS version_no,
    pv.created_at,
    COALESCE(pv.status, 'draft')::text AS status,
    COALESCE(pv.segment, '')::text AS segment,
    COALESCE(pv.source, '')::text AS source,
    p.valor_projeto::numeric AS valor_projeto,
    COALESCE(
      pv.premium_payload ->> 'public_pdf_url',
      pv.premium_payload ->> 'client_pdf_url',
      pv.premium_payload ->> 'pdf_url'
    )::text AS pdf_url,
    COALESCE(
      pv.premium_payload ->> 'share_url',
      pv.premium_payload -> 'share' ->> 'url'
    )::text AS share_url
  FROM public.proposal_versions pv
  INNER JOIN public.leads l
    ON l.id = pv.lead_id
   AND l.org_id = p_org_id
  LEFT JOIN public.propostas p
    ON p.id = pv.proposta_id
   AND (p.org_id = p_org_id OR p.org_id IS NULL)
  WHERE pv.org_id = p_org_id
    AND (
      auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.org_id = p_org_id
          AND om.user_id = auth.uid()
      )
    )
    AND (
      p_search IS NULL
      OR p_search = ''
      OR l.nome ILIKE ('%' || p_search || '%')
      OR COALESCE(l.telefone, '') ILIKE ('%' || p_search || '%')
      OR COALESCE(l.phone_e164, '') ILIKE ('%' || p_search || '%')
    )
    AND (
      p_status IS NULL
      OR p_status = ''
      OR pv.status = p_status
    )
    AND (
      p_stage IS NULL
      OR p_stage = ''
      OR l.status_pipeline = p_stage
    )
    AND (
      p_owner IS NULL
      OR COALESCE(l.assigned_to_user_id, l.user_id) = p_owner
    )
    AND (
      p_date_from IS NULL
      OR pv.created_at::date >= p_date_from
    )
    AND (
      p_date_to IS NULL
      OR pv.created_at::date <= p_date_to
    )
  ORDER BY pv.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_lead_proposals(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_proposals(uuid, bigint) TO service_role;

GRANT EXECUTE ON FUNCTION public.list_proposals(uuid, text, text, text, uuid, date, date, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_proposals(uuid, text, text, text, uuid, date, date, integer, integer) TO service_role;

