-- Mirror migration for M3 (Path B executed SQL)
-- Includes: org-scoped RLS, helper functions, policy backup, RPC hardening,
-- and transitional remediation for interacoes org_id fill.
-- NOTE: Transitional trigger m3_fill_interacoes_org_transitional_trg is temporary until M5/M6.

-- === Applied: _deploy_tmp/m3_apply.sql ===

-- M3 apply (Path B): org-scoped RLS + RPC hardening
-- Idempotent and safe to rerun.

-- 0) Helper functions
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        CASE
            WHEN p_org_id IS NULL THEN false
            WHEN auth.role() = 'service_role' THEN true
            WHEN auth.uid() IS NULL THEN false
            ELSE EXISTS (
                SELECT 1
                FROM public.organization_members om
                WHERE om.user_id = auth.uid()
                  AND om.org_id = p_org_id
            )
        END
$$;

CREATE OR REPLACE FUNCTION public.m3_resolve_primary_org_for_auth_user()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT (array_agg(om.org_id ORDER BY om.org_id))[1]
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.m3_ai_fill_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org uuid;
BEGIN
    IF NEW.org_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    v_org := public.m3_resolve_primary_org_for_auth_user();
    IF v_org IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User has no organization membership';
    END IF;

    NEW.org_id := v_org;
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_org(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.m3_resolve_primary_org_for_auth_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.m3_resolve_primary_org_for_auth_user() TO service_role;

-- 1) Backup current policies/functions (once per run tag)
CREATE TABLE IF NOT EXISTS public._rls_policy_backup (
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

CREATE INDEX IF NOT EXISTS idx_rls_policy_backup_run_tag
    ON public._rls_policy_backup(run_tag);

CREATE TABLE IF NOT EXISTS public._m3_function_backup (
    id bigserial PRIMARY KEY,
    run_tag text NOT NULL,
    backed_up_at timestamptz NOT NULL DEFAULT now(),
    function_signature text NOT NULL,
    function_def text NOT NULL,
    UNIQUE (run_tag, function_signature)
);

DO $$
DECLARE
    v_run_tag CONSTANT text := 'm3_20260218_org_scoped';
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public._rls_policy_backup b
        WHERE b.run_tag = v_run_tag
    ) THEN
        INSERT INTO public._rls_policy_backup (
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
                            CASE
                                WHEN role_name = 'public' THEN 'PUBLIC'
                                ELSE quote_ident(role_name)
                            END,
                            ', '
                            ORDER BY role_name
                        )
                        FROM unnest(p.roles) AS role_name
                    ),
                    'PUBLIC'
                ),
                CASE WHEN p.qual IS NOT NULL THEN format(' USING (%s)', p.qual) ELSE '' END,
                CASE WHEN p.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', p.with_check) ELSE '' END
            ) AS create_sql
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename IN (
              'leads',
              'interacoes',
              'whatsapp_instances',
              'propostas',
              'appointments',
              'deals',
              'lead_stage_history',
              'comentarios_leads',
              'ai_settings',
              'ai_stage_config',
              'ai_agent_runs',
              'ai_summaries',
              'ai_action_logs'
          );
    END IF;

    INSERT INTO public._m3_function_backup (run_tag, function_signature, function_def)
    SELECT
        v_run_tag,
        p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        pg_get_functiondef(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('knowledge_search_v2', 'knowledge_search_v3')
    ON CONFLICT (run_tag, function_signature) DO NOTHING;
END
$$;

-- 2) Ensure RLS is enabled and drop existing policies on target tables
DO $$
DECLARE
    v_table text;
    r record;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'leads',
        'interacoes',
        'whatsapp_instances',
        'propostas',
        'appointments',
        'deals',
        'lead_stage_history',
        'comentarios_leads',
        'ai_settings',
        'ai_stage_config',
        'ai_agent_runs',
        'ai_summaries',
        'ai_action_logs'
    ]
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
              AND t.table_name = v_table
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
        END IF;
    END LOOP;

    FOR r IN
        SELECT p.schemaname, p.tablename, p.policyname
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename IN (
              'leads',
              'interacoes',
              'whatsapp_instances',
              'propostas',
              'appointments',
              'deals',
              'lead_stage_history',
              'comentarios_leads',
              'ai_settings',
              'ai_stage_config',
              'ai_agent_runs',
              'ai_summaries',
              'ai_action_logs'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END
$$;

-- 3) Core policies (org scoped + transitional writes for org_id NULL)
DO $$
DECLARE
    v_table text;
    has_user_id boolean;
    has_lead_id boolean;
    strict_expr text;
    transition_expr text;
    rw_expr text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'leads',
        'interacoes',
        'whatsapp_instances',
        'propostas',
        'appointments',
        'deals',
        'lead_stage_history',
        'comentarios_leads'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
              AND t.table_name = v_table
        ) THEN
            CONTINUE;
        END IF;

        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table
              AND c.column_name = 'user_id'
        ) INTO has_user_id;

        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table
              AND c.column_name = 'lead_id'
        ) INTO has_lead_id;

        strict_expr := 'public.user_belongs_to_org(org_id)';
        transition_expr := NULL;

        IF has_user_id THEN
            transition_expr := '(org_id IS NULL AND user_id = auth.uid())';
        END IF;

        IF has_lead_id THEN
            IF transition_expr IS NULL THEN
                transition_expr := '(org_id IS NULL AND lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.user_belongs_to_org(l.org_id)))';
            ELSE
                transition_expr := '(' || transition_expr || ' OR (org_id IS NULL AND lead_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND public.user_belongs_to_org(l.org_id))))';
            END IF;
        END IF;

        rw_expr := strict_expr;
        IF transition_expr IS NOT NULL THEN
            rw_expr := '(' || strict_expr || ' OR ' || transition_expr || ')';
        END IF;

        EXECUTE format(
            'CREATE POLICY m3_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            v_table
        );

        EXECUTE format(
            'CREATE POLICY m3_auth_select_org ON public.%I FOR SELECT TO authenticated USING (%s)',
            v_table,
            rw_expr
        );

        EXECUTE format(
            'CREATE POLICY m3_auth_insert_org ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
            v_table,
            rw_expr
        );

        EXECUTE format(
            'CREATE POLICY m3_auth_update_org ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
            v_table,
            rw_expr,
            rw_expr
        );

        EXECUTE format(
            'CREATE POLICY m3_auth_delete_org ON public.%I FOR DELETE TO authenticated USING (%s)',
            v_table,
            rw_expr
        );
    END LOOP;
END
$$;

-- 4) AI write compatibility trigger (app still writes ai_settings / ai_stage_config directly)
DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['ai_settings', 'ai_stage_config']
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table
              AND c.column_name = 'org_id'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS m3_fill_org_id_before_write ON public.%I', v_table);
            EXECUTE format(
                'CREATE TRIGGER m3_fill_org_id_before_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.m3_ai_fill_org_id()',
                v_table
            );
        END IF;
    END LOOP;
END
$$;

-- 5) AI policies
DO $$
DECLARE
    v_table text;
    has_org_id boolean;
    select_expr text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'ai_settings',
        'ai_stage_config',
        'ai_agent_runs',
        'ai_summaries',
        'ai_action_logs'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
              AND t.table_name = v_table
        ) THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'CREATE POLICY m3_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            v_table
        );

        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table
              AND c.column_name = 'org_id'
        ) INTO has_org_id;

        IF has_org_id THEN
            select_expr := 'public.user_belongs_to_org(org_id)';
            IF v_table = 'ai_stage_config' THEN
                -- Transitional read for legacy rows with org_id NULL (will be captured on update trigger path).
                select_expr := '(' || select_expr || ' OR org_id IS NULL)';
            END IF;

            EXECUTE format(
                'CREATE POLICY m3_auth_select_org ON public.%I FOR SELECT TO authenticated USING (%s)',
                v_table,
                select_expr
            );

            IF v_table IN ('ai_settings', 'ai_stage_config') THEN
                EXECUTE format(
                    'CREATE POLICY m3_auth_insert_org ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id))',
                    v_table
                );
                EXECUTE format(
                    'CREATE POLICY m3_auth_update_org ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (public.user_belongs_to_org(org_id))',
                    v_table,
                    select_expr
                );
            END IF;
        END IF;
    END LOOP;
END
$$;

-- 6) Harden RPCs that accept external org_id
DO $$
BEGIN
    IF to_regprocedure('public.knowledge_search_v2(uuid,text,integer)') IS NOT NULL THEN
        EXECUTE $v2$
            CREATE OR REPLACE FUNCTION public.knowledge_search_v2(
                p_org_id uuid,
                p_query_text text,
                p_limit integer DEFAULT 10
            )
            RETURNS TABLE(
                item_id uuid,
                item_type text,
                title_or_name text,
                content_snippet text,
                priority integer
            )
            LANGUAGE plpgsql
            AS $function$
            BEGIN
                IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
                    RAISE EXCEPTION 'Unauthorized: User does not belong to organization';
                END IF;

                RETURN QUERY
                WITH combined_items AS (
                    SELECT
                        cp.id,
                        'company_info'::text AS type,
                        'Sobre a Empresa'::text AS title,
                        'Elevator: ' || COALESCE(cp.elevator_pitch, '') || ' | ' ||
                        'Diferenciais: ' || COALESCE(cp.differentials, '') || ' | ' ||
                        'Processo: ' || COALESCE(cp.installation_process, '') || ' | ' ||
                        'Garantia: ' || COALESCE(cp.warranty_info, '') || ' | ' ||
                        'Pagamento: ' || COALESCE(cp.payment_options, '') AS content,
                        0 AS priority,
                        cp.org_id
                    FROM public.company_profile cp
                    WHERE cp.org_id = p_org_id

                    UNION ALL

                    SELECT
                        t.id,
                        'testimonial'::text AS type,
                        COALESCE(t.display_name, 'Cliente') AS title,
                        COALESCE(t.quote_short, '') || ' ' || COALESCE(t.story_long, '') AS content,
                        1 AS priority,
                        t.org_id
                    FROM public.testimonials t
                    WHERE t.org_id = p_org_id
                      AND t.status = 'approved'
                      AND t.consent_status <> 'none'

                    UNION ALL

                    SELECT
                        o.id,
                        'objection'::text AS type,
                        o.question AS title,
                        o.response AS content,
                        o.priority + 10 AS priority,
                        o.org_id
                    FROM public.objection_responses o
                    WHERE o.org_id = p_org_id

                    UNION ALL

                    SELECT
                        k.id,
                        'kb_item'::text AS type,
                        COALESCE(k.title, 'Documento') AS title,
                        COALESCE(k.body, '') AS content,
                        5 AS priority,
                        k.org_id
                    FROM public.kb_items k
                    WHERE k.org_id = p_org_id
                      AND k.status::text = 'approved'
                )
                SELECT
                    ci.id,
                    ci.type,
                    ci.title,
                    ci.content,
                    ci.priority
                FROM combined_items ci
                WHERE ci.type = 'company_info'
                   OR (
                       p_query_text IS NOT NULL
                       AND (
                           ci.content ILIKE '%' || p_query_text || '%'
                           OR ci.title ILIKE '%' || p_query_text || '%'
                       )
                   )
                ORDER BY ci.priority ASC, ci.title ASC
                LIMIT p_limit;
            END;
            $function$;
        $v2$;
    END IF;

    IF to_regprocedure('public.knowledge_search_v3(uuid,text,integer)') IS NOT NULL THEN
        EXECUTE $v3$
            CREATE OR REPLACE FUNCTION public.knowledge_search_v3(
                p_org_id uuid,
                p_query_text text,
                p_limit integer DEFAULT 12
            )
            RETURNS TABLE(
                item_id uuid,
                item_type text,
                title_or_name text,
                content_snippet text,
                priority integer
            )
            LANGUAGE plpgsql
            AS $function$
            BEGIN
                IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
                    RAISE EXCEPTION 'Unauthorized: User does not belong to organization';
                END IF;

                RETURN QUERY
                WITH q AS (
                    SELECT
                        NULLIF(TRIM(COALESCE(p_query_text, '')), '') AS query_text,
                        CASE
                            WHEN NULLIF(TRIM(COALESCE(p_query_text, '')), '') IS NULL THEN NULL
                            ELSE (
                                SELECT
                                    CASE
                                        WHEN COUNT(*) = 0 THEN NULL
                                        ELSE to_tsquery('portuguese', string_agg(lexeme || ':*', ' | '))
                                    END
                                FROM (
                                    SELECT lexeme
                                    FROM (
                                        SELECT DISTINCT lexeme
                                        FROM unnest(tsvector_to_array(to_tsvector('portuguese', p_query_text))) AS lexeme
                                        WHERE length(lexeme) >= 3
                                    ) d
                                    ORDER BY length(lexeme) DESC, lexeme ASC
                                    LIMIT 14
                                ) t
                            )
                        END AS tsq
                ),
                combined_items AS (
                    SELECT
                        cp.id AS id,
                        'company_info'::text AS type,
                        'Sobre a Empresa'::text AS title,
                        'Elevator: ' || COALESCE(cp.elevator_pitch, '') || ' | ' ||
                        'Diferenciais: ' || COALESCE(cp.differentials, '') || ' | ' ||
                        'Processo: ' || COALESCE(cp.installation_process, '') || ' | ' ||
                        'Garantia: ' || COALESCE(cp.warranty_info, '') || ' | ' ||
                        'Pagamento: ' || COALESCE(cp.payment_options, '') AS content,
                        0 AS priority,
                        NULL::float AS rank
                    FROM public.company_profile cp
                    WHERE cp.org_id = p_org_id

                    UNION ALL

                    SELECT
                        t.id,
                        'testimonial'::text AS type,
                        COALESCE(t.display_name, 'Cliente') AS title,
                        COALESCE(t.quote_short, '') || ' ' || COALESCE(t.story_long, '') AS content,
                        1 AS priority,
                        NULL::float AS rank
                    FROM public.testimonials t
                    WHERE t.org_id = p_org_id
                      AND t.status = 'approved'
                      AND t.consent_status <> 'none'

                    UNION ALL

                    SELECT
                        o.id,
                        'objection'::text AS type,
                        o.question AS title,
                        o.response AS content,
                        o.priority + 10 AS priority,
                        NULL::float AS rank
                    FROM public.objection_responses o
                    WHERE o.org_id = p_org_id

                    UNION ALL

                    SELECT
                        c.id,
                        'kb_chunk'::text AS type,
                        COALESCE(k.title, 'Documento') AS title,
                        c.chunk_text AS content,
                        5 AS priority,
                        ts_rank(c.tsv, q.tsq) AS rank
                    FROM public.kb_item_chunks c
                    JOIN public.kb_items k ON k.id = c.kb_item_id
                    CROSS JOIN q
                    WHERE c.org_id = p_org_id
                      AND k.org_id = p_org_id
                      AND k.status = 'approved'
                      AND q.tsq IS NOT NULL
                      AND c.tsv @@ q.tsq

                    UNION ALL

                    SELECT
                        k.id,
                        'kb_item'::text AS type,
                        COALESCE(k.title, 'Documento') AS title,
                        COALESCE(k.body, '') AS content,
                        6 AS priority,
                        ts_rank(to_tsvector('portuguese', COALESCE(k.title, '') || ' ' || COALESCE(k.body, '')), q.tsq) AS rank
                    FROM public.kb_items k
                    CROSS JOIN q
                    WHERE k.org_id = p_org_id
                      AND k.status = 'approved'
                      AND q.tsq IS NOT NULL
                      AND to_tsvector('portuguese', COALESCE(k.title, '') || ' ' || COALESCE(k.body, '')) @@ q.tsq
                )
                SELECT
                    ci.id,
                    ci.type,
                    ci.title,
                    LEFT(ci.content, 2800) AS content_snippet,
                    ci.priority
                FROM combined_items ci
                ORDER BY ci.priority ASC, ci.rank DESC NULLS LAST, ci.title ASC
                LIMIT p_limit;
            END;
            $function$;
        $v3$;
    END IF;
END
$$;

SELECT jsonb_pretty(
    jsonb_build_object(
        'apply_ok', true,
        'run_tag', 'm3_20260218_org_scoped',
        'backup_policy_rows', (
            SELECT count(*)
            FROM public._rls_policy_backup
            WHERE run_tag = 'm3_20260218_org_scoped'
        ),
        'backup_function_rows', (
            SELECT count(*)
            FROM public._m3_function_backup
            WHERE run_tag = 'm3_20260218_org_scoped'
        )
    )
) AS m3_apply_report;

-- === Applied: _deploy_tmp/m3_fix_interacoes_nulls.sql ===

-- M3 cycle remediation (Type A): fix NULL org_id in interacoes.
-- Idempotent: only updates rows with org_id IS NULL.

SELECT jsonb_build_object(
  'phase', 'before',
  'interacoes_null_org_id', (SELECT count(*)::bigint FROM public.interacoes WHERE org_id IS NULL)
) AS m3_fix_interacoes_before;

DO $$
DECLARE
  v_owner_org uuid;
  v_owner_user uuid;
  has_joined_at boolean;
BEGIN
  has_joined_at := EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_members'
      AND column_name = 'joined_at'
  );

  IF has_joined_at THEN
    SELECT om.org_id, om.user_id
      INTO v_owner_org, v_owner_user
    FROM public.organization_members om
    WHERE om.role = 'owner'
    ORDER BY om.joined_at ASC NULLS LAST, om.org_id ASC
    LIMIT 1;
  ELSE
    SELECT om.org_id, om.user_id
      INTO v_owner_org, v_owner_user
    FROM public.organization_members om
    WHERE om.role = 'owner'
    ORDER BY om.org_id ASC
    LIMIT 1;
  END IF;

  IF v_owner_org IS NULL OR v_owner_user IS NULL THEN
    SELECT om.org_id, om.user_id
      INTO v_owner_org, v_owner_user
    FROM public.organization_members om
    ORDER BY om.org_id ASC, om.user_id ASC
    LIMIT 1;
  END IF;

  IF v_owner_org IS NULL THEN
    RAISE EXCEPTION 'm3_fix_interacoes_nulls: no org available in organization_members';
  END IF;

  -- 1) lead_id -> leads.org_id
  UPDATE public.interacoes i
     SET org_id = l.org_id,
         user_id = COALESCE(i.user_id, l.user_id)
    FROM public.leads l
   WHERE i.org_id IS NULL
     AND i.lead_id IS NOT NULL
     AND l.id = i.lead_id
     AND l.org_id IS NOT NULL;

  -- 2) user_id -> organization_members.org_id (deterministic pick via array_agg()[1])
  WITH om_one AS (
    SELECT
      om.user_id,
      (array_agg(om.org_id ORDER BY om.org_id))[1] AS org_id
    FROM public.organization_members om
    GROUP BY om.user_id
  )
  UPDATE public.interacoes i
     SET org_id = o.org_id
    FROM om_one o
   WHERE i.org_id IS NULL
     AND i.user_id IS NOT NULL
     AND i.user_id = o.user_id;

  -- 3) instance_name -> whatsapp_instances.org_id
  WITH wi_one AS (
    SELECT
      wi.instance_name,
      (array_agg(wi.org_id ORDER BY wi.org_id))[1] AS org_id,
      (array_agg(wi.user_id ORDER BY wi.user_id))[1] AS user_id
    FROM public.whatsapp_instances wi
    WHERE wi.instance_name IS NOT NULL
      AND wi.org_id IS NOT NULL
    GROUP BY wi.instance_name
  )
  UPDATE public.interacoes i
     SET org_id = w.org_id,
         user_id = COALESCE(i.user_id, w.user_id)
    FROM wi_one w
   WHERE i.org_id IS NULL
     AND i.instance_name IS NOT NULL
     AND i.instance_name = w.instance_name;

  -- 4) deterministic fallback -> primary owner org
  UPDATE public.interacoes i
     SET org_id = v_owner_org,
         user_id = COALESCE(i.user_id, v_owner_user)
   WHERE i.org_id IS NULL;
END
$$;

SELECT jsonb_build_object(
  'phase', 'after',
  'interacoes_null_org_id', (SELECT count(*)::bigint FROM public.interacoes WHERE org_id IS NULL)
) AS m3_fix_interacoes_after;

-- === Applied: _deploy_tmp/m3_interacoes_org_trigger.sql ===

-- M3 transitional trigger: auto-fill org_id/user_id in interacoes writes.
-- Transitional only (to be removed when app writes org_id explicitly in M5/M6).

CREATE OR REPLACE FUNCTION public.m3_fill_interacoes_org_transitional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_user uuid;
  v_owner_org uuid;
  v_owner_user uuid;
  has_joined_at boolean;
BEGIN
  -- a) lead_id -> leads.{org_id,user_id}
  IF NEW.lead_id IS NOT NULL THEN
    SELECT l.org_id, l.user_id
      INTO v_org, v_user
    FROM public.leads l
    WHERE l.id = NEW.lead_id
    LIMIT 1;

    IF NEW.user_id IS NULL AND v_user IS NOT NULL THEN
      NEW.user_id := v_user;
    END IF;

    IF NEW.org_id IS NULL AND v_org IS NOT NULL THEN
      NEW.org_id := v_org;
    END IF;
  END IF;

  -- b) user_id -> organization_members.org_id
  IF NEW.org_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT (array_agg(om.org_id ORDER BY om.org_id))[1]
      INTO v_org
    FROM public.organization_members om
    WHERE om.user_id = NEW.user_id;

    IF v_org IS NOT NULL THEN
      NEW.org_id := v_org;
    END IF;
  END IF;

  -- c) instance_name -> whatsapp_instances.{org_id,user_id}
  IF NEW.org_id IS NULL AND NEW.instance_name IS NOT NULL THEN
    SELECT
      (array_agg(wi.org_id ORDER BY wi.org_id))[1],
      (array_agg(wi.user_id ORDER BY wi.user_id))[1]
      INTO v_org, v_user
    FROM public.whatsapp_instances wi
    WHERE wi.instance_name = NEW.instance_name
      AND wi.org_id IS NOT NULL;

    IF NEW.org_id IS NULL AND v_org IS NOT NULL THEN
      NEW.org_id := v_org;
    END IF;
    IF NEW.user_id IS NULL AND v_user IS NOT NULL THEN
      NEW.user_id := v_user;
    END IF;
  END IF;

  -- d) fallback primary owner org
  IF NEW.org_id IS NULL THEN
    has_joined_at := EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organization_members'
        AND column_name = 'joined_at'
    );

    IF has_joined_at THEN
      SELECT om.org_id, om.user_id
        INTO v_owner_org, v_owner_user
      FROM public.organization_members om
      WHERE om.role = 'owner'
      ORDER BY om.joined_at ASC NULLS LAST, om.org_id ASC
      LIMIT 1;
    ELSE
      SELECT om.org_id, om.user_id
        INTO v_owner_org, v_owner_user
      FROM public.organization_members om
      WHERE om.role = 'owner'
      ORDER BY om.org_id ASC
      LIMIT 1;
    END IF;

    IF v_owner_org IS NULL OR v_owner_user IS NULL THEN
      SELECT om.org_id, om.user_id
        INTO v_owner_org, v_owner_user
      FROM public.organization_members om
      ORDER BY om.org_id ASC, om.user_id ASC
      LIMIT 1;
    END IF;

    IF v_owner_org IS NOT NULL THEN
      NEW.org_id := v_owner_org;
    END IF;
    IF NEW.user_id IS NULL AND v_owner_user IS NOT NULL THEN
      NEW.user_id := v_owner_user;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS m3_fill_interacoes_org_transitional_trg ON public.interacoes;
CREATE TRIGGER m3_fill_interacoes_org_transitional_trg
BEFORE INSERT OR UPDATE ON public.interacoes
FOR EACH ROW
EXECUTE FUNCTION public.m3_fill_interacoes_org_transitional();

SELECT jsonb_build_object(
  'trigger_created', true,
  'trigger_name', 'm3_fill_interacoes_org_transitional_trg',
  'function_name', 'm3_fill_interacoes_org_transitional'
) AS m3_interacoes_trigger_report;
