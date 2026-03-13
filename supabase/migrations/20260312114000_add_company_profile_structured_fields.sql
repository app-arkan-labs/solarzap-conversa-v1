DO $$
BEGIN
  ALTER TABLE IF EXISTS public.company_profile
    ADD COLUMN IF NOT EXISTS headquarters_city text,
    ADD COLUMN IF NOT EXISTS headquarters_state text,
    ADD COLUMN IF NOT EXISTS headquarters_address text,
    ADD COLUMN IF NOT EXISTS headquarters_zip text,
    ADD COLUMN IF NOT EXISTS service_area_summary text,
    ADD COLUMN IF NOT EXISTS service_cities jsonb,
    ADD COLUMN IF NOT EXISTS service_states jsonb,
    ADD COLUMN IF NOT EXISTS business_hours_text text,
    ADD COLUMN IF NOT EXISTS public_phone text,
    ADD COLUMN IF NOT EXISTS public_whatsapp text,
    ADD COLUMN IF NOT EXISTS technical_visit_is_free boolean,
    ADD COLUMN IF NOT EXISTS technical_visit_fee_notes text,
    ADD COLUMN IF NOT EXISTS supports_financing boolean,
    ADD COLUMN IF NOT EXISTS supports_card_installments boolean,
    ADD COLUMN IF NOT EXISTS payment_policy_summary text,
    ADD COLUMN IF NOT EXISTS call_channel_options jsonb;

  UPDATE public.company_profile
  SET service_cities = '[]'::jsonb
  WHERE service_cities IS NULL
     OR jsonb_typeof(service_cities) <> 'array';

  UPDATE public.company_profile
  SET service_states = '[]'::jsonb
  WHERE service_states IS NULL
     OR jsonb_typeof(service_states) <> 'array';

  UPDATE public.company_profile
  SET call_channel_options = jsonb_build_array('whatsapp', 'call')
  WHERE call_channel_options IS NULL
     OR jsonb_typeof(call_channel_options) <> 'array';

  ALTER TABLE IF EXISTS public.company_profile
    ALTER COLUMN service_cities SET DEFAULT '[]'::jsonb;
  ALTER TABLE IF EXISTS public.company_profile
    ALTER COLUMN service_states SET DEFAULT '[]'::jsonb;
  ALTER TABLE IF EXISTS public.company_profile
    ALTER COLUMN call_channel_options SET DEFAULT jsonb_build_array('whatsapp', 'call');

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'company_profile'
      AND c.conname = 'company_profile_service_cities_array_chk'
  ) THEN
    ALTER TABLE public.company_profile
      ADD CONSTRAINT company_profile_service_cities_array_chk
      CHECK (service_cities IS NULL OR jsonb_typeof(service_cities) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'company_profile'
      AND c.conname = 'company_profile_service_states_array_chk'
  ) THEN
    ALTER TABLE public.company_profile
      ADD CONSTRAINT company_profile_service_states_array_chk
      CHECK (service_states IS NULL OR jsonb_typeof(service_states) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'company_profile'
      AND c.conname = 'company_profile_call_channel_options_array_chk'
  ) THEN
    ALTER TABLE public.company_profile
      ADD CONSTRAINT company_profile_call_channel_options_array_chk
      CHECK (call_channel_options IS NULL OR jsonb_typeof(call_channel_options) = 'array');
  END IF;
END
$$;
