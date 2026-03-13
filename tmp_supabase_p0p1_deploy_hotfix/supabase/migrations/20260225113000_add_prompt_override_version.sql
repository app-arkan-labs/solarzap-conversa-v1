-- Fase 4: lightweight prompt versioning in ai_stage_config

ALTER TABLE public.ai_stage_config
  ADD COLUMN IF NOT EXISTS prompt_override_version integer DEFAULT 0;

UPDATE public.ai_stage_config
SET prompt_override_version = 0
WHERE prompt_override_version IS NULL;

COMMENT ON COLUMN public.ai_stage_config.prompt_override_version IS
  'Lightweight version counter for prompt_override. Incremented on each prompt save/restore.';
