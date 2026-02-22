ALTER TABLE public.org_seller_permissions
  ADD COLUMN IF NOT EXISTS can_assign_leads boolean NOT NULL DEFAULT true;
