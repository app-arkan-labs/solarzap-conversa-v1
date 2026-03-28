ALTER TABLE public._admin_system_admins
  ADD COLUMN IF NOT EXISTS crm_role text NOT NULL DEFAULT 'none'
  CHECK (crm_role IN ('none', 'owner', 'sales', 'cs', 'finance', 'ops', 'read_only'));

UPDATE public._admin_system_admins
SET crm_role = CASE
  WHEN system_role = 'super_admin' THEN 'owner'
  ELSE 'none'
END
WHERE crm_role IS NULL OR crm_role = 'none';
