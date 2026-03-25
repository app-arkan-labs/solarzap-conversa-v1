-- IA per-instance profile + auto-schedule assignees (additive, backward compatible)

DO $$
BEGIN
  ALTER TABLE IF EXISTS public.whatsapp_instances
    ADD COLUMN IF NOT EXISTS assistant_identity_name text,
    ADD COLUMN IF NOT EXISTS assistant_prompt_override text,
    ADD COLUMN IF NOT EXISTS assistant_prompt_override_version integer,
    ADD COLUMN IF NOT EXISTS assistant_prompt_updated_at timestamptz;
END
$$;

UPDATE public.whatsapp_instances
SET assistant_prompt_override_version = 0
WHERE assistant_prompt_override_version IS NULL;

ALTER TABLE IF EXISTS public.whatsapp_instances
  ALTER COLUMN assistant_prompt_override_version SET DEFAULT 0;

ALTER TABLE IF EXISTS public.whatsapp_instances
  ALTER COLUMN assistant_prompt_override_version SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'whatsapp_instances'
      AND c.conname = 'whatsapp_instances_assistant_prompt_override_version_chk'
  ) THEN
    ALTER TABLE public.whatsapp_instances
      ADD CONSTRAINT whatsapp_instances_assistant_prompt_override_version_chk
      CHECK (assistant_prompt_override_version >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  ALTER TABLE IF EXISTS public.ai_settings
    ADD COLUMN IF NOT EXISTS auto_schedule_call_assign_to_user_id uuid,
    ADD COLUMN IF NOT EXISTS auto_schedule_visit_assign_to_user_id uuid;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.conname = 'ai_settings_auto_schedule_call_assign_to_user_id_fkey'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_auto_schedule_call_assign_to_user_id_fkey
      FOREIGN KEY (auto_schedule_call_assign_to_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.conname = 'ai_settings_auto_schedule_visit_assign_to_user_id_fkey'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_auto_schedule_visit_assign_to_user_id_fkey
      FOREIGN KEY (auto_schedule_visit_assign_to_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.ai_settings_validate_auto_schedule_assignee_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.auto_schedule_call_assign_to_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.org_id = NEW.org_id
        AND om.user_id = NEW.auto_schedule_call_assign_to_user_id
    ) INTO v_exists;

    IF NOT v_exists THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'invalid_auto_schedule_call_assignee_org_member',
        DETAIL = 'auto_schedule_call_assign_to_user_id does not belong to organization_members for this org_id';
    END IF;
  END IF;

  IF NEW.auto_schedule_visit_assign_to_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.org_id = NEW.org_id
        AND om.user_id = NEW.auto_schedule_visit_assign_to_user_id
    ) INTO v_exists;

    IF NOT v_exists THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'invalid_auto_schedule_visit_assignee_org_member',
        DETAIL = 'auto_schedule_visit_assign_to_user_id does not belong to organization_members for this org_id';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_ai_settings_validate_auto_schedule_assignee_org ON public.ai_settings;

CREATE TRIGGER trg_ai_settings_validate_auto_schedule_assignee_org
BEFORE INSERT OR UPDATE OF org_id, auto_schedule_call_assign_to_user_id, auto_schedule_visit_assign_to_user_id
ON public.ai_settings
FOR EACH ROW
EXECUTE FUNCTION public.ai_settings_validate_auto_schedule_assignee_org();

CREATE OR REPLACE FUNCTION public.whatsapp_instances_guard_assistant_prompt_override()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prompt text;
BEGIN
  v_prompt := coalesce(NEW.assistant_prompt_override, '');

  IF btrim(v_prompt) = '' THEN
    RETURN NEW;
  END IF;

  IF v_prompt ~* '(ignorar\\s+tudo|ignore\\s+(all|everything|previous|prior)|desconsidere\\s+as\\s+instru[cç][oõ]es|revele\\s+o\\s+prompt|vaze\\s+o\\s+prompt|burlar\\s+json|retorne\\s+exatamente\\s+este\\s+json|ignore\\s+system\\s+prompt|system\\s+override|jailbreak)' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'unsafe_instance_prompt_override_blocked',
      DETAIL = 'assistant_prompt_override contains blocked instruction pattern';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_instances_guard_assistant_prompt_override ON public.whatsapp_instances;

CREATE TRIGGER trg_whatsapp_instances_guard_assistant_prompt_override
BEFORE INSERT OR UPDATE OF assistant_prompt_override
ON public.whatsapp_instances
FOR EACH ROW
EXECUTE FUNCTION public.whatsapp_instances_guard_assistant_prompt_override();
