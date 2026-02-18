-- M4 apply: assigned lead visibility + leads RLS
-- Path B only. Idempotent.

-- A) Backup current leads policies (one-time per run_tag)
CREATE TABLE IF NOT EXISTS public._rls_policy_backup_m4 (
  id bigserial PRIMARY KEY,
  run_tag text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  table_schema text NOT NULL,
  table_name text NOT NULL,
  policy_name text NOT NULL,
  permissive text NOT NULL,
  cmd text NOT NULL,
  roles text[] NOT NULL,
  qual text,
  with_check text,
  create_sql text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rls_policy_backup_m4_run_tag
  ON public._rls_policy_backup_m4(run_tag);

CREATE TABLE IF NOT EXISTS public._m4_function_backup (
  id bigserial PRIMARY KEY,
  run_tag text NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  function_signature text NOT NULL,
  function_def text NOT NULL,
  UNIQUE (run_tag, function_signature)
);

DO $$
DECLARE
  v_run_tag CONSTANT text := 'm4_20260218_lead_visibility';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public._rls_policy_backup_m4 b
    WHERE b.run_tag = v_run_tag
  ) THEN
    INSERT INTO public._rls_policy_backup_m4 (
      run_tag,
      table_schema,
      table_name,
      policy_name,
      permissive,
      cmd,
      roles,
      qual,
      with_check,
      create_sql
    )
    SELECT
      v_run_tag,
      p.schemaname,
      p.tablename,
      p.policyname,
      p.permissive,
      p.cmd,
      p.roles,
      p.qual,
      p.with_check,
      format(
        'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
        p.policyname,
        p.schemaname,
        p.tablename,
        p.permissive,
        p.cmd,
        COALESCE(
          (
            SELECT string_agg(
              CASE WHEN role_name = 'public' THEN 'PUBLIC' ELSE quote_ident(role_name) END,
              ', '
              ORDER BY role_name
            )
            FROM unnest(p.roles) role_name
          ),
          'PUBLIC'
        ),
        CASE WHEN p.qual IS NOT NULL THEN format(' USING (%s)', p.qual) ELSE '' END,
        CASE WHEN p.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', p.with_check) ELSE '' END
      )
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'leads';
  END IF;

  INSERT INTO public._m4_function_backup (run_tag, function_signature, function_def)
  SELECT
    v_run_tag,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'upsert_lead_canonical'
    AND pg_get_function_identity_arguments(p.oid) =
      'p_user_id uuid, p_instance_name text, p_phone_e164 text, p_telefone text, p_name text, p_push_name text, p_source text'
  ON CONFLICT (run_tag, function_signature) DO NOTHING;
END
$$;

-- B/C) Add new assignment column + index
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to
  ON public.leads(assigned_to_user_id);

-- D) Backfill assignment
UPDATE public.leads
SET assigned_to_user_id = user_id
WHERE assigned_to_user_id IS NULL
  AND user_id IS NOT NULL;

-- E/F) Rebuild leads policies
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.policyname
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = 'leads'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', r.policyname);
  END LOOP;

  -- Keep explicit RLS enabled
  ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

  -- service_role all access
  CREATE POLICY leads_svc
  ON public.leads
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

  -- team-aware visibility select
  CREATE POLICY leads_visibility
  ON public.leads
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    public.user_belongs_to_org(org_id)
    AND (
      assigned_to_user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id = leads.org_id
          AND (
            om.role IN ('owner', 'admin')
            OR om.can_view_team_leads = true
          )
      )
    )
  );

  CREATE POLICY leads_insert
  ON public.leads
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_belongs_to_org(org_id));

  CREATE POLICY leads_update
  ON public.leads
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

  CREATE POLICY leads_delete
  ON public.leads
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (public.user_belongs_to_org(org_id));
END
$$;

-- Ensure leads visibility subquery can read caller membership under RLS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name = 'organization_members'
  ) THEN
    ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS m4_org_members_self_select ON public.organization_members;
    CREATE POLICY m4_org_members_self_select
    ON public.organization_members
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
  END IF;
END
$$;

-- G) Patch upsert_lead_canonical with assigned_to behavior (if function exists)
DO $$
BEGIN
  IF to_regprocedure(
    'public.upsert_lead_canonical(uuid,text,text,text,text,text,text)'
  ) IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.upsert_lead_canonical(
        p_user_id uuid,
        p_instance_name text,
        p_phone_e164 text,
        p_telefone text,
        p_name text DEFAULT NULL::text,
        p_push_name text DEFAULT NULL::text,
        p_source text DEFAULT 'whatsapp'::text
      )
      RETURNS TABLE(id bigint, created_at timestamp with time zone, updated_at timestamp with time zone)
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $function$
      DECLARE
          v_lead_id BIGINT;
          v_created_at TIMESTAMP WITH TIME ZONE;
          v_updated_at TIMESTAMP WITH TIME ZONE;
          v_tombstone_exists BOOLEAN;
      BEGIN
          -- M0 SECURITY: caller must match p_user_id (service_role has auth.uid()=NULL -> skip)
          IF auth.uid() IS NOT NULL AND p_user_id != auth.uid() THEN
            RAISE EXCEPTION 'Unauthorized: p_user_id must match auth.uid()';
          END IF;

          -- 1. Try to find existing lead by E164 (exact match)
          SELECT l.id, l.created_at, l.updated_at INTO v_lead_id, v_created_at, v_updated_at
          FROM leads l
          WHERE l.user_id = p_user_id
            AND l.phone_e164 = p_phone_e164
          LIMIT 1;

          -- 2. If not found, try by legacy telefone column (looser match)
          IF v_lead_id IS NULL AND p_telefone IS NOT NULL THEN
              SELECT l.id, l.created_at, l.updated_at INTO v_lead_id, v_created_at, v_updated_at
              FROM leads l
              WHERE l.user_id = p_user_id
                AND l.telefone = p_telefone
              LIMIT 1;
          END IF;

          -- 3. If still not found, check tombstone before creating
          IF v_lead_id IS NULL THEN
              SELECT EXISTS (
                  SELECT 1 FROM deleted_threads
                  WHERE user_id = p_user_id
                    AND phone_e164 = p_phone_e164
                    AND deleted_at > NOW() - INTERVAL '30 days'
              ) INTO v_tombstone_exists;
              
              IF v_tombstone_exists THEN
                  DELETE FROM deleted_threads
                  WHERE user_id = p_user_id
                    AND phone_e164 = p_phone_e164;
                  RAISE NOTICE 'Creating fresh lead for phone % after tombstone deletion', p_phone_e164;
              END IF;
              
              INSERT INTO leads (
                  user_id,
                  assigned_to_user_id,
                  instance_name,
                  phone_e164,
                  telefone,
                  nome,
                  source,
                  created_at,
                  updated_at
              ) VALUES (
                  p_user_id,
                  p_user_id,
                  p_instance_name,
                  p_phone_e164,
                  p_telefone,
                  COALESCE(p_name, p_push_name, p_telefone),
                  p_source,
                  NOW(),
                  NOW()
              )
              RETURNING leads.id, leads.created_at, leads.updated_at INTO v_lead_id, v_created_at, v_updated_at;
          
          ELSE
              UPDATE leads
              SET 
                  updated_at = NOW(),
                  instance_name = COALESCE(leads.instance_name, p_instance_name),
                  assigned_to_user_id = COALESCE(leads.assigned_to_user_id, p_user_id),
                  nome = CASE 
                      WHEN leads.nome = leads.telefone AND p_push_name IS NOT NULL THEN p_push_name 
                      ELSE leads.nome 
                  END
              WHERE leads.id = v_lead_id
              RETURNING leads.updated_at INTO v_updated_at;
          END IF;

          RETURN QUERY SELECT v_lead_id, v_created_at, v_updated_at;
      END;
      $function$;
    $fn$;
  END IF;
END
$$;

SELECT jsonb_pretty(
  jsonb_build_object(
    'apply_ok', true,
    'run_tag', 'm4_20260218_lead_visibility',
    'assigned_to_null_count', (SELECT count(*)::bigint FROM public.leads WHERE assigned_to_user_id IS NULL),
    'leads_policy_count', (SELECT count(*)::bigint FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads')
  )
) AS m4_apply_report;
