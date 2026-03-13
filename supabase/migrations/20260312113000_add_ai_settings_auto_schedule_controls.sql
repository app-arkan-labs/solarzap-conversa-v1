DO $$
BEGIN
  ALTER TABLE IF EXISTS public.ai_settings
    ADD COLUMN IF NOT EXISTS auto_schedule_call_enabled boolean,
    ADD COLUMN IF NOT EXISTS auto_schedule_visit_enabled boolean,
    ADD COLUMN IF NOT EXISTS auto_schedule_call_min_days integer,
    ADD COLUMN IF NOT EXISTS auto_schedule_visit_min_days integer;

  UPDATE public.ai_settings
  SET auto_schedule_call_enabled = true
  WHERE auto_schedule_call_enabled IS NULL;

  UPDATE public.ai_settings
  SET auto_schedule_visit_enabled = true
  WHERE auto_schedule_visit_enabled IS NULL;

  UPDATE public.ai_settings
  SET auto_schedule_call_min_days = GREATEST(0, COALESCE(auto_schedule_call_min_days, 0))
  WHERE auto_schedule_call_min_days IS NULL OR auto_schedule_call_min_days < 0;

  UPDATE public.ai_settings
  SET auto_schedule_visit_min_days = GREATEST(0, COALESCE(auto_schedule_visit_min_days, 0))
  WHERE auto_schedule_visit_min_days IS NULL OR auto_schedule_visit_min_days < 0;

  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN auto_schedule_call_enabled SET DEFAULT true;
  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN auto_schedule_visit_enabled SET DEFAULT true;
  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN auto_schedule_call_min_days SET DEFAULT 0;
  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN auto_schedule_visit_min_days SET DEFAULT 0;

  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN auto_schedule_call_enabled SET NOT NULL;
  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN auto_schedule_visit_enabled SET NOT NULL;
  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN auto_schedule_call_min_days SET NOT NULL;
  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN auto_schedule_visit_min_days SET NOT NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.conname = 'ai_settings_auto_schedule_call_min_days_chk'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_auto_schedule_call_min_days_chk
      CHECK (auto_schedule_call_min_days >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.conname = 'ai_settings_auto_schedule_visit_min_days_chk'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_auto_schedule_visit_min_days_chk
      CHECK (auto_schedule_visit_min_days >= 0);
  END IF;
END
$$;
