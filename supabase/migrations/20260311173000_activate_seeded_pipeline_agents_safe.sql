-- Activates special pipeline agents only for rows that still look like untouched
-- seed/migration defaults. This avoids flipping rows that were changed later by an operator.

UPDATE public.ai_stage_config
SET is_active = true,
    updated_at = now()
WHERE pipeline_stage = 'chamada_realizada'
  AND is_active = false
  AND COALESCE(prompt_override, '') = ''
  AND updated_at = TIMESTAMPTZ '2026-03-11 13:14:01.350977+00';

UPDATE public.ai_stage_config
SET is_active = true,
    updated_at = now()
WHERE pipeline_stage = 'agente_disparos'
  AND is_active = false
  AND COALESCE(prompt_override, '') = ''
  AND updated_at = TIMESTAMPTZ '2026-03-11 13:14:05.138642+00';

UPDATE public.ai_stage_config
SET is_active = true,
    updated_at = now()
WHERE pipeline_stage = 'follow_up'
  AND is_active = false
  AND COALESCE(prompt_override, '') = ''
  AND updated_at = TIMESTAMPTZ '2026-03-11 13:14:08.78807+00';
