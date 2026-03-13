DO $$
DECLARE
  v_default jsonb := jsonb_build_object(
    'steps',
    jsonb_build_array(
      jsonb_build_object('step', 1, 'enabled', true, 'delay_minutes', 180),
      jsonb_build_object('step', 2, 'enabled', true, 'delay_minutes', 1440),
      jsonb_build_object('step', 3, 'enabled', true, 'delay_minutes', 2880),
      jsonb_build_object('step', 4, 'enabled', true, 'delay_minutes', 4320),
      jsonb_build_object('step', 5, 'enabled', true, 'delay_minutes', 10080)
    )
  );
BEGIN
  ALTER TABLE public.ai_settings
    ADD COLUMN IF NOT EXISTS follow_up_sequence_config jsonb;

  UPDATE public.ai_settings
  SET follow_up_sequence_config = v_default
  WHERE follow_up_sequence_config IS NULL
    OR jsonb_typeof(follow_up_sequence_config) <> 'object'
    OR NOT (follow_up_sequence_config ? 'steps')
    OR jsonb_typeof(follow_up_sequence_config->'steps') <> 'array';

  ALTER TABLE public.ai_settings
    ALTER COLUMN follow_up_sequence_config SET DEFAULT v_default;
END $$;
