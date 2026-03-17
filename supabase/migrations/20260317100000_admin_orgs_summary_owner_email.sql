-- Add owner_email to _admin_orgs_summary view for email-based search
-- Must DROP first because adding a column between existing ones changes column order
DROP VIEW IF EXISTS public._admin_orgs_summary;

CREATE VIEW public._admin_orgs_summary AS
SELECT
  o.id,
  o.name,
  o.owner_id,
  o.created_at,
  o.status,
  o.plan,
  o.plan_limits,
  o.suspended_at,
  o.suspension_reason,
  u.email AS owner_email,
  (
    SELECT count(*)
    FROM public.organization_members m
    WHERE m.org_id = o.id
  ) AS member_count,
  (
    SELECT count(*)
    FROM public.leads l
    WHERE l.org_id = o.id
  ) AS lead_count,
  (
    SELECT count(*)
    FROM public.propostas p
    WHERE p.org_id = o.id
  ) AS proposal_count,
  (
    SELECT count(*)
    FROM public.whatsapp_instances w
    WHERE w.org_id = o.id
  ) AS instance_count
FROM public.organizations o
LEFT JOIN auth.users u ON o.owner_id = u.id;

REVOKE ALL ON public._admin_orgs_summary FROM anon, authenticated;
GRANT SELECT ON public._admin_orgs_summary TO service_role;
