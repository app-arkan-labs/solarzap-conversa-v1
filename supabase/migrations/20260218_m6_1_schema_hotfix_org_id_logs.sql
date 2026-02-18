-- M6.1: formalize schema hotfix for org-aware edge logs
-- Scope: additive/idempotent changes only (no NOT NULL, no RLS/policy changes)

-- A) ai_action_logs.org_id
ALTER TABLE IF EXISTS public.ai_action_logs
  ADD COLUMN IF NOT EXISTS org_id uuid;

CREATE INDEX IF NOT EXISTS idx_ai_action_logs_org_id
  ON public.ai_action_logs (org_id);

DO $$
DECLARE
  v_run_col text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ai_action_logs'
  ) THEN
    SELECT c.column_name
    INTO v_run_col
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'ai_action_logs'
      AND c.column_name IN ('ai_agent_run_id', 'agent_run_id', 'run_id')
    ORDER BY CASE c.column_name
      WHEN 'ai_agent_run_id' THEN 1
      WHEN 'agent_run_id' THEN 2
      WHEN 'run_id' THEN 3
      ELSE 99
    END
    LIMIT 1;

    IF v_run_col IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'ai_agent_runs'
           AND column_name = 'org_id'
       )
    THEN
      EXECUTE format(
        'UPDATE public.ai_action_logs l
            SET org_id = r.org_id
           FROM public.ai_agent_runs r
          WHERE l.org_id IS NULL
            AND l.%I = r.id
            AND r.org_id IS NOT NULL',
        v_run_col
      );
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_action_logs'
        AND column_name = 'lead_id'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'leads'
        AND column_name = 'org_id'
    )
    THEN
      UPDATE public.ai_action_logs l
         SET org_id = ld.org_id
        FROM public.leads ld
       WHERE l.org_id IS NULL
         AND l.lead_id = ld.id
         AND ld.org_id IS NOT NULL;
    END IF;
  END IF;
END
$$;

-- B) whatsapp_webhook_events.org_id
ALTER TABLE IF EXISTS public.whatsapp_webhook_events
  ADD COLUMN IF NOT EXISTS org_id uuid;

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_org_id
  ON public.whatsapp_webhook_events (org_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_webhook_events'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'whatsapp_webhook_events'
        AND column_name = 'instance_name'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'whatsapp_instances'
        AND column_name = 'org_id'
    )
    THEN
      UPDATE public.whatsapp_webhook_events w
         SET org_id = i.org_id
        FROM public.whatsapp_instances i
       WHERE w.org_id IS NULL
         AND w.instance_name = i.instance_name
         AND i.org_id IS NOT NULL;
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'whatsapp_webhook_events'
        AND column_name = 'interaction_id'
    )
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'interacoes'
        AND column_name = 'org_id'
    )
    THEN
      UPDATE public.whatsapp_webhook_events w
         SET org_id = it.org_id
        FROM public.interacoes it
       WHERE w.org_id IS NULL
         AND w.interaction_id = it.id
         AND it.org_id IS NOT NULL;
    END IF;
  END IF;
END
$$;
