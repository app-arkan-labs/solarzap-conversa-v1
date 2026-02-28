-- Ensure authenticated users can read only their own organization memberships.
-- This policy is required by frontend auth/org bootstrap and should not depend on leads (M4) migrations.

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS m4_org_members_self_select ON public.organization_members;
DROP POLICY IF EXISTS org_members_self_select ON public.organization_members;

CREATE POLICY org_members_self_select
ON public.organization_members
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
