DO $$
DECLARE
  v_default jsonb := jsonb_build_object(
    'start', '09:00',
    'end', '18:00',
    'days', jsonb_build_array('mon', 'tue', 'wed', 'thu', 'fri'),
    'preferred_time', NULL
  );
BEGIN
  ALTER TABLE IF EXISTS public.ai_settings
    ADD COLUMN IF NOT EXISTS follow_up_window_config jsonb;

  UPDATE public.ai_settings
  SET follow_up_window_config = v_default
  WHERE follow_up_window_config IS NULL
    OR jsonb_typeof(follow_up_window_config) <> 'object'
    OR NOT (follow_up_window_config ? 'start')
    OR NOT (follow_up_window_config ? 'end')
    OR NOT (follow_up_window_config ? 'days')
    OR jsonb_typeof(follow_up_window_config->'days') <> 'array';

  ALTER TABLE IF EXISTS public.ai_settings
    ALTER COLUMN follow_up_window_config SET DEFAULT v_default;
END
$$;
