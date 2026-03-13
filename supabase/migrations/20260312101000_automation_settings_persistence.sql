CREATE TABLE IF NOT EXISTS public.automation_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_settings_settings_is_object_chk CHECK (jsonb_typeof(settings) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_automation_settings_updated_at
  ON public.automation_settings (updated_at DESC);

CREATE OR REPLACE FUNCTION public.automation_settings_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_automation_settings_updated_at ON public.automation_settings;
CREATE TRIGGER tr_automation_settings_updated_at
  BEFORE UPDATE ON public.automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.automation_settings_set_updated_at();

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_settings_service_all ON public.automation_settings;
CREATE POLICY automation_settings_service_all
ON public.automation_settings
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS automation_settings_auth_select ON public.automation_settings;
CREATE POLICY automation_settings_auth_select
ON public.automation_settings
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS automation_settings_auth_insert ON public.automation_settings;
CREATE POLICY automation_settings_auth_insert
ON public.automation_settings
FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS automation_settings_auth_update ON public.automation_settings;
CREATE POLICY automation_settings_auth_update
ON public.automation_settings
FOR UPDATE TO authenticated
USING (public.user_belongs_to_org(org_id))
WITH CHECK (public.user_belongs_to_org(org_id));
