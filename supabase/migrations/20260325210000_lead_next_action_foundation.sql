-- Lead Next Action foundation
-- Incremental, additive and safe to rerun.

ALTER TABLE public.lead_tasks
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS completed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_summary text NULL,
  ADD COLUMN IF NOT EXISTS linked_appointment_id bigint NULL REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_tasks_task_kind_check'
  ) THEN
    ALTER TABLE public.lead_tasks
      ADD CONSTRAINT lead_tasks_task_kind_check
      CHECK (task_kind IN ('generic', 'next_action', 'follow_up_ai', 'system'));
  END IF;
END
$$;

UPDATE public.lead_tasks
SET task_kind = 'follow_up_ai'
WHERE created_by = 'ai'
  AND task_kind = 'generic';

CREATE INDEX IF NOT EXISTS idx_lead_tasks_org_user_status_due
  ON public.lead_tasks(org_id, user_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead_kind_status
  ON public.lead_tasks(lead_id, task_kind, status);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_linked_appointment
  ON public.lead_tasks(linked_appointment_id)
  WHERE linked_appointment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_tasks_one_open_next_action_per_lead
  ON public.lead_tasks(lead_id)
  WHERE status = 'open' AND task_kind = 'next_action';

ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view tasks they own or belong to" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can view tasks they own" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can insert tasks they own" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can update their own tasks" ON public.lead_tasks;
DROP POLICY IF EXISTS "Users can delete their own tasks" ON public.lead_tasks;
DROP POLICY IF EXISTS lead_tasks_select_org ON public.lead_tasks;
DROP POLICY IF EXISTS lead_tasks_insert_org ON public.lead_tasks;
DROP POLICY IF EXISTS lead_tasks_update_org ON public.lead_tasks;
DROP POLICY IF EXISTS lead_tasks_delete_org ON public.lead_tasks;

CREATE POLICY lead_tasks_select_org
ON public.lead_tasks
FOR SELECT
TO authenticated
USING (public.user_belongs_to_org(org_id));

CREATE POLICY lead_tasks_insert_org
ON public.lead_tasks
FOR INSERT
TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

CREATE POLICY lead_tasks_update_org
ON public.lead_tasks
FOR UPDATE
TO authenticated
USING (public.user_belongs_to_org(org_id))
WITH CHECK (public.user_belongs_to_org(org_id));

CREATE POLICY lead_tasks_delete_org
ON public.lead_tasks
FOR DELETE
TO authenticated
USING (public.user_belongs_to_org(org_id));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = '_admin_feature_flags'
  ) THEN
    INSERT INTO public._admin_feature_flags (flag_key, description, default_enabled)
    VALUES (
      'lead_next_action_v1',
      'Enables last action and next action operational layer in Conversas.',
      false
    )
    ON CONFLICT (flag_key) DO UPDATE
      SET description = EXCLUDED.description;
  END IF;
END
$$;
