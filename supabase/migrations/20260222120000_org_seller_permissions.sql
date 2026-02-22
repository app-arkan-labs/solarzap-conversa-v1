-- Seller permissions per org — controls what sellers (role=user) can do
-- Owner and Admin always have full access; these only restrict 'user' and 'consultant' roles

CREATE TABLE IF NOT EXISTS public.org_seller_permissions (
    org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    -- Settings tabs visibility for sellers
    tab_ia_agentes boolean NOT NULL DEFAULT true,
    tab_automacoes boolean NOT NULL DEFAULT true,
    tab_integracoes boolean NOT NULL DEFAULT true,
    tab_banco_ia boolean NOT NULL DEFAULT true,
    tab_minha_conta boolean NOT NULL DEFAULT true,
    -- Action permissions for sellers
    can_delete_leads boolean NOT NULL DEFAULT true,
    can_delete_proposals boolean NOT NULL DEFAULT true,
    can_toggle_ai boolean NOT NULL DEFAULT true,
    -- Metadata
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.org_seller_permissions ENABLE ROW LEVEL SECURITY;

-- Service role: full access
DROP POLICY IF EXISTS org_seller_permissions_service ON public.org_seller_permissions;
CREATE POLICY org_seller_permissions_service ON public.org_seller_permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated: read own org
DROP POLICY IF EXISTS org_seller_permissions_auth_select ON public.org_seller_permissions;
CREATE POLICY org_seller_permissions_auth_select ON public.org_seller_permissions
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_org(org_id));

-- Authenticated owner/admin: insert/update own org
DROP POLICY IF EXISTS org_seller_permissions_auth_insert ON public.org_seller_permissions;
CREATE POLICY org_seller_permissions_auth_insert ON public.org_seller_permissions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS org_seller_permissions_auth_update ON public.org_seller_permissions;
CREATE POLICY org_seller_permissions_auth_update ON public.org_seller_permissions
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.org_seller_permissions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_org_seller_permissions_updated_at ON public.org_seller_permissions;
CREATE TRIGGER tr_org_seller_permissions_updated_at
  BEFORE UPDATE ON public.org_seller_permissions
  FOR EACH ROW EXECUTE FUNCTION public.org_seller_permissions_updated_at();
