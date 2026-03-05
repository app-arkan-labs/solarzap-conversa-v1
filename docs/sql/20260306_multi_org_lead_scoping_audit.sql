-- Run before deploy and again after deploy.
-- Query 1: same user + same phone spread across multiple orgs.
SELECT
  user_id,
  phone_e164,
  count(*) AS lead_count,
  count(DISTINCT org_id) AS org_count,
  array_agg(id ORDER BY id) AS lead_ids,
  array_agg(org_id ORDER BY org_id) AS org_ids
FROM public.leads
WHERE coalesce(phone_e164, '') <> ''
GROUP BY user_id, phone_e164
HAVING count(DISTINCT org_id) > 1
ORDER BY lead_count DESC, user_id, phone_e164;

-- Query 2: legacy leads still missing org_id.
SELECT count(*) AS leads_with_null_org_id
FROM public.leads
WHERE org_id IS NULL;

-- Query 3: summary of rows whose org_id does not match the referenced lead.
WITH mismatches AS (
  SELECT 'interacoes'::text AS table_name, i.id::text AS row_id, i.org_id AS row_org_id, i.lead_id, l.org_id AS lead_org_id
  FROM public.interacoes i
  JOIN public.leads l ON l.id = i.lead_id
  WHERE i.lead_id IS NOT NULL
    AND i.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'propostas'::text, p.id::text, p.org_id, p.lead_id, l.org_id
  FROM public.propostas p
  JOIN public.leads l ON l.id = p.lead_id
  WHERE p.lead_id IS NOT NULL
    AND p.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'appointments'::text, a.id::text, a.org_id, a.lead_id, l.org_id
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.lead_id
  WHERE a.lead_id IS NOT NULL
    AND a.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'deals'::text, d.id::text, d.org_id, d.lead_id, l.org_id
  FROM public.deals d
  JOIN public.leads l ON l.id = d.lead_id
  WHERE d.lead_id IS NOT NULL
    AND d.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'lead_stage_history'::text, h.id::text, h.org_id, h.lead_id, l.org_id
  FROM public.lead_stage_history h
  JOIN public.leads l ON l.id = h.lead_id
  WHERE h.lead_id IS NOT NULL
    AND h.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'comentarios_leads'::text, c.id::text, c.org_id, c.lead_id, l.org_id
  FROM public.comentarios_leads c
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.lead_id IS NOT NULL
    AND c.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'broadcast_recipients'::text, br.id::text, bc.org_id, br.lead_id, l.org_id
  FROM public.broadcast_recipients br
  JOIN public.broadcast_campaigns bc ON bc.id = br.campaign_id
  JOIN public.leads l ON l.id = br.lead_id
  WHERE br.lead_id IS NOT NULL
    AND bc.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'lead_attribution'::text, la.id::text, la.org_id, la.lead_id, l.org_id
  FROM public.lead_attribution la
  JOIN public.leads l ON l.id = la.lead_id
  WHERE la.lead_id IS NOT NULL
    AND la.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'attribution_touchpoints'::text, atp.id::text, atp.org_id, atp.lead_id, l.org_id
  FROM public.attribution_touchpoints atp
  JOIN public.leads l ON l.id = atp.lead_id
  WHERE atp.lead_id IS NOT NULL
    AND atp.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'conversion_events'::text, ce.id::text, ce.org_id, ce.lead_id, l.org_id
  FROM public.conversion_events ce
  JOIN public.leads l ON l.id = ce.lead_id
  WHERE ce.lead_id IS NOT NULL
    AND ce.org_id IS DISTINCT FROM l.org_id
)
SELECT table_name, count(*) AS mismatched_rows
FROM mismatches
GROUP BY table_name
ORDER BY mismatched_rows DESC, table_name;

-- Query 4: detail sample for remediation.
WITH mismatches AS (
  SELECT 'interacoes'::text AS table_name, i.id::text AS row_id, i.org_id AS row_org_id, i.lead_id, l.org_id AS lead_org_id
  FROM public.interacoes i
  JOIN public.leads l ON l.id = i.lead_id
  WHERE i.lead_id IS NOT NULL
    AND i.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'propostas'::text, p.id::text, p.org_id, p.lead_id, l.org_id
  FROM public.propostas p
  JOIN public.leads l ON l.id = p.lead_id
  WHERE p.lead_id IS NOT NULL
    AND p.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'appointments'::text, a.id::text, a.org_id, a.lead_id, l.org_id
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.lead_id
  WHERE a.lead_id IS NOT NULL
    AND a.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'deals'::text, d.id::text, d.org_id, d.lead_id, l.org_id
  FROM public.deals d
  JOIN public.leads l ON l.id = d.lead_id
  WHERE d.lead_id IS NOT NULL
    AND d.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'lead_stage_history'::text, h.id::text, h.org_id, h.lead_id, l.org_id
  FROM public.lead_stage_history h
  JOIN public.leads l ON l.id = h.lead_id
  WHERE h.lead_id IS NOT NULL
    AND h.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'comentarios_leads'::text, c.id::text, c.org_id, c.lead_id, l.org_id
  FROM public.comentarios_leads c
  JOIN public.leads l ON l.id = c.lead_id
  WHERE c.lead_id IS NOT NULL
    AND c.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'broadcast_recipients'::text, br.id::text, bc.org_id, br.lead_id, l.org_id
  FROM public.broadcast_recipients br
  JOIN public.broadcast_campaigns bc ON bc.id = br.campaign_id
  JOIN public.leads l ON l.id = br.lead_id
  WHERE br.lead_id IS NOT NULL
    AND bc.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'lead_attribution'::text, la.id::text, la.org_id, la.lead_id, l.org_id
  FROM public.lead_attribution la
  JOIN public.leads l ON l.id = la.lead_id
  WHERE la.lead_id IS NOT NULL
    AND la.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'attribution_touchpoints'::text, atp.id::text, atp.org_id, atp.lead_id, l.org_id
  FROM public.attribution_touchpoints atp
  JOIN public.leads l ON l.id = atp.lead_id
  WHERE atp.lead_id IS NOT NULL
    AND atp.org_id IS DISTINCT FROM l.org_id

  UNION ALL

  SELECT 'conversion_events'::text, ce.id::text, ce.org_id, ce.lead_id, l.org_id
  FROM public.conversion_events ce
  JOIN public.leads l ON l.id = ce.lead_id
  WHERE ce.lead_id IS NOT NULL
    AND ce.org_id IS DISTINCT FROM l.org_id
)
SELECT *
FROM mismatches
ORDER BY table_name, row_id
LIMIT 500;
