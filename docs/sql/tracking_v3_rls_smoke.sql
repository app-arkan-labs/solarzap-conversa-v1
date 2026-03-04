-- Tracking v3 RLS smoke checks
-- Run with a SQL client connected as service_role in a staging/local database.

-- 1) Create two orgs and two users (replace with valid IDs in your environment).
-- 2) Ensure each user is only member of one org in organization_members.
-- 3) Try cross-org reads/writes below as authenticated role using each JWT context.

-- Expected: same-org SELECT/INSERT works, cross-org SELECT/INSERT is denied by RLS.

SELECT
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'lead_attribution',
    'attribution_touchpoints',
    'conversion_events',
    'conversion_deliveries',
    'ad_platform_credentials',
    'org_tracking_settings',
    'ad_trigger_messages'
  )
ORDER BY tablename, policyname;

-- Spot-check UNIQUE constraints:
-- uq_lead_attribution
-- uq_touchpoint_fp
-- uq_conversion_idemp
-- uq_delivery

