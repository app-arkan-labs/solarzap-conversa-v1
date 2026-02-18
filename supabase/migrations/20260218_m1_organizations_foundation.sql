-- M1: Organizations Foundation

-- 1) Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    owner_id uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- 2) Organization members table
CREATE TABLE IF NOT EXISTS public.organization_members (
    org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'user', 'consultant')),
    can_view_team_leads boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

-- 3) Performance indexes
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(org_id);

-- 4) Basic RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.organizations;
CREATE POLICY "service_role_all" ON public.organizations FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all" ON public.organization_members;
CREATE POLICY "service_role_all" ON public.organization_members FOR ALL USING (auth.role() = 'service_role');

-- Backfill: one organization per existing user + owner membership
INSERT INTO public.organizations (name, owner_id)
SELECT
    'Organizacao de ' || (COALESCE(email, id::text)),
    id
FROM auth.users
WHERE id NOT IN (SELECT owner_id FROM public.organizations)
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_members (org_id, user_id, role, can_view_team_leads)
SELECT
    o.id,
    o.owner_id,
    'owner',
    true
FROM public.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = o.id AND m.user_id = o.owner_id
)
ON CONFLICT DO NOTHING;
