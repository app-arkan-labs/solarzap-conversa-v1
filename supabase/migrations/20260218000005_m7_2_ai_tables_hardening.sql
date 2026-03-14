-- M7.2 mirror migration: AI tables org hardening
-- Date: 2026-02-18

DO $$
DECLARE
  v_table text;
  v_nullable text;
  v_null_count bigint;
  v_has_org boolean;
  v_has_stage_pipeline boolean;
  v_has_stage_status boolean;
  v_stage_col text;
  v_policy_qual text;
  v_constraint_name text;
BEGIN
  -- Guard: ensure target tables/columns exist and have zero NULL org_id before hardening.
  FOREACH v_table IN ARRAY ARRAY['ai_settings','ai_stage_config','ai_summaries'] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'M7.2 migration aborted: missing table public.%', v_table;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_table
        AND column_name = 'org_id'
    ) INTO v_has_org;

    IF NOT v_has_org THEN
      RAISE EXCEPTION 'M7.2 migration aborted: missing org_id column on public.%', v_table;
    END IF;

    EXECUTE format('SELECT count(*)::bigint FROM public.%I WHERE org_id IS NULL', v_table) INTO v_null_count;
    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'M7.2 migration aborted: public.%.org_id has % NULL rows', v_table, v_null_count;
    END IF;
  END LOOP;

  -- NOT NULL hardening (idempotent).
  FOREACH v_table IN ARRAY ARRAY['ai_settings','ai_stage_config','ai_summaries'] LOOP
    EXECUTE format(
      'SELECT is_nullable
         FROM information_schema.columns
        WHERE table_schema = ''public''
          AND table_name = %L
          AND column_name = ''org_id''
        LIMIT 1',
      v_table
    ) INTO v_nullable;

    IF v_nullable = 'YES' THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', v_table);
    END IF;
  END LOOP;

  -- ai_settings UNIQUE(org_id).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ai_settings'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid, true) ILIKE 'UNIQUE (org_id)%'
  ) THEN
    ALTER TABLE public.ai_settings
      ADD CONSTRAINT ai_settings_org_id_key UNIQUE (org_id);
  END IF;

  -- Detect stage column for ai_stage_config unique(org_id, stage_col).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_stage_config' AND column_name = 'pipeline_stage'
  ) INTO v_has_stage_pipeline;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_stage_config' AND column_name = 'status_pipeline'
  ) INTO v_has_stage_status;

  IF v_has_stage_pipeline THEN
    v_stage_col := 'pipeline_stage';
  ELSIF v_has_stage_status THEN
    v_stage_col := 'status_pipeline';
  ELSE
    v_stage_col := NULL;
  END IF;

  IF v_stage_col IS NOT NULL THEN
    FOR v_constraint_name IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'ai_stage_config'
        AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid, true) = format('UNIQUE (%I)', v_stage_col)
    LOOP
      EXECUTE format('ALTER TABLE public.ai_stage_config DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'ai_stage_config'
        AND c.contype = 'u'
        AND pg_get_constraintdef(c.oid, true) = format('UNIQUE (org_id, %I)', v_stage_col)
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.ai_stage_config ADD CONSTRAINT ai_stage_config_org_stage_key UNIQUE (org_id, %I)',
        v_stage_col
      );
    END IF;
  END IF;

  -- Remove transitional OR org_id IS NULL from auth policies on ai_stage_config.
  SELECT p.qual
    INTO v_policy_qual
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'ai_stage_config'
    AND p.policyname = 'm3_auth_select_org'
    AND p.cmd = 'SELECT'
  LIMIT 1;

  IF v_policy_qual IS NOT NULL AND position('org_id IS NULL' in v_policy_qual) > 0 THEN
    EXECUTE 'DROP POLICY IF EXISTS m3_auth_select_org ON public.ai_stage_config';
    EXECUTE 'CREATE POLICY m3_auth_select_org ON public.ai_stage_config FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id))';
  END IF;

  SELECT p.qual
    INTO v_policy_qual
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = 'ai_stage_config'
    AND p.policyname = 'm3_auth_update_org'
    AND p.cmd = 'UPDATE'
  LIMIT 1;

  IF v_policy_qual IS NOT NULL AND position('org_id IS NULL' in v_policy_qual) > 0 THEN
    EXECUTE 'DROP POLICY IF EXISTS m3_auth_update_org ON public.ai_stage_config';
    EXECUTE 'CREATE POLICY m3_auth_update_org ON public.ai_stage_config FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id)) WITH CHECK (public.user_belongs_to_org(org_id))';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ai_settings_org_id ON public.ai_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_stage_config_org_id ON public.ai_stage_config(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_org_id ON public.ai_summaries(org_id);
