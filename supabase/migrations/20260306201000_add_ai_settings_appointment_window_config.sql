-- Add configurable appointment windows per event type for AI scheduling
-- Default: 09:00-17:00 Monday-Friday for all supported event types

DO $$
DECLARE
  v_default jsonb := jsonb_build_object(
    'call', jsonb_build_object('start', '09:00', 'end', '17:00', 'days', jsonb_build_array('mon', 'tue', 'wed', 'thu', 'fri')),
    'visit', jsonb_build_object('start', '09:00', 'end', '17:00', 'days', jsonb_build_array('mon', 'tue', 'wed', 'thu', 'fri')),
    'meeting', jsonb_build_object('start', '09:00', 'end', '17:00', 'days', jsonb_build_array('mon', 'tue', 'wed', 'thu', 'fri')),
    'installation', jsonb_build_object('start', '09:00', 'end', '17:00', 'days', jsonb_build_array('mon', 'tue', 'wed', 'thu', 'fri'))
  );
BEGIN
  ALTER TABLE IF EXISTS public.ai_settings
    ADD COLUMN IF NOT EXISTS appointment_window_config jsonb;

  UPDATE public.ai_settings
  SET appointment_window_config = v_default
  WHERE appointment_window_config IS NULL
    OR jsonb_typeof(appointment_window_config) <> 'object';

  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN appointment_window_config SET DEFAULT v_default;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.conname = 'ai_settings_appointment_window_config_obj_chk'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_appointment_window_config_obj_chk
      CHECK (
        appointment_window_config IS NULL
        OR (
          jsonb_typeof(appointment_window_config) = 'object'
          AND appointment_window_config ? 'call'
          AND appointment_window_config ? 'visit'
          AND appointment_window_config ? 'meeting'
          AND appointment_window_config ? 'installation'
        )
      );
  END IF;
END
$$;