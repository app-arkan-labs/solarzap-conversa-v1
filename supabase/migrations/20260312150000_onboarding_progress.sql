CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  current_step text NOT NULL DEFAULT 'profile',
  completed_steps text[] NOT NULL DEFAULT '{}'::text[],
  skipped_steps text[] NOT NULL DEFAULT '{}'::text[],
  tour_completed_tabs text[] NOT NULL DEFAULT '{}'::text[],
  is_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

-- Normalize legacy shape (single-key by user) into org-scoped rows.
DELETE FROM public.onboarding_progress
WHERE org_id IS NULL;

ALTER TABLE public.onboarding_progress
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN org_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.onboarding_progress'::regclass
      AND conname = 'onboarding_progress_pkey'
  ) THEN
    ALTER TABLE public.onboarding_progress
      DROP CONSTRAINT onboarding_progress_pkey;
  END IF;

  ALTER TABLE public.onboarding_progress
    ADD CONSTRAINT onboarding_progress_pkey PRIMARY KEY (user_id, org_id);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_org_id
  ON public.onboarding_progress (org_id);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_is_complete
  ON public.onboarding_progress (is_complete);

CREATE OR REPLACE FUNCTION public.onboarding_progress_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_onboarding_progress_updated_at ON public.onboarding_progress;
CREATE TRIGGER tr_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.onboarding_progress_set_updated_at();

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_progress_service_all ON public.onboarding_progress;
CREATE POLICY onboarding_progress_service_all
ON public.onboarding_progress
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS onboarding_progress_auth_select ON public.onboarding_progress;
CREATE POLICY onboarding_progress_auth_select
ON public.onboarding_progress
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  AND public.user_belongs_to_org(org_id)
);

DROP POLICY IF EXISTS onboarding_progress_auth_insert ON public.onboarding_progress;
CREATE POLICY onboarding_progress_auth_insert
ON public.onboarding_progress
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.user_belongs_to_org(org_id)
);

DROP POLICY IF EXISTS onboarding_progress_auth_update ON public.onboarding_progress;
CREATE POLICY onboarding_progress_auth_update
ON public.onboarding_progress
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND public.user_belongs_to_org(org_id)
)
WITH CHECK (
  user_id = auth.uid()
  AND public.user_belongs_to_org(org_id)
);
