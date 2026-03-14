-- M7 mirror migration: final org_id hardening.
-- Scope: structural hardening only (NOT NULL + org_id indexes), idempotent and guarded.

DO $$
DECLARE
  v_table text;
  v_idx_name text;
  v_table_exists boolean;
  v_has_org boolean;
  v_null_count bigint;
  v_is_nullable text;
  v_core_tables text[] := ARRAY[
    'leads',
    'interacoes',
    'propostas',
    'whatsapp_instances',
    'appointments',
    'deals',
    'lead_stage_history',
    'comentarios_leads'
  ];
  v_log_tables text[] := ARRAY[
    'ai_agent_runs',
    'ai_action_logs',
    'whatsapp_webhook_events'
  ];
BEGIN
  -- Core tables: strict hardening.
  FOREACH v_table IN ARRAY v_core_tables LOOP
    v_idx_name := format('idx_%s_org_id', v_table);

    SELECT to_regclass(format('public.%I', v_table)) IS NOT NULL
      INTO v_table_exists;
    IF NOT v_table_exists THEN
      RAISE EXCEPTION 'M7 mirror migration aborted: missing core table public.%', v_table;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'org_id'
    )
    INTO v_has_org;
    IF NOT v_has_org THEN
      RAISE EXCEPTION 'M7 mirror migration aborted: missing org_id column on public.%', v_table;
    END IF;

    EXECUTE format('SELECT count(*)::bigint FROM public.%I WHERE org_id IS NULL', v_table)
      INTO v_null_count;
    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'M7 mirror migration aborted: public.%.org_id still has % NULL rows', v_table, v_null_count;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)', v_idx_name, v_table);

    EXECUTE format(
      'SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema = ''public''
          AND table_name = %L
          AND column_name = ''org_id''
        LIMIT 1',
      v_table
    )
    INTO v_is_nullable;

    IF v_is_nullable = 'YES' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', v_table);
    END IF;
  END LOOP;

  -- Log tables: conditional hardening.
  FOREACH v_table IN ARRAY v_log_tables LOOP
    v_idx_name := format('idx_%s_org_id', v_table);

    SELECT to_regclass(format('public.%I', v_table)) IS NOT NULL
      INTO v_table_exists;
    IF NOT v_table_exists THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'org_id'
    )
    INTO v_has_org;
    IF NOT v_has_org THEN
      CONTINUE;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)', v_idx_name, v_table);

    EXECUTE format('SELECT count(*)::bigint FROM public.%I WHERE org_id IS NULL', v_table)
      INTO v_null_count;
    IF v_null_count <> 0 THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema = ''public''
          AND table_name = %L
          AND column_name = ''org_id''
        LIMIT 1',
      v_table
    )
    INTO v_is_nullable;

    IF v_is_nullable = 'YES' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', v_table);
    END IF;
  END LOOP;
END
$$;
