-- M2 mirror migration: org_id nullable on core tables + AI rename + backfill
-- Path B execution was done via SQL runner (no supabase db push).

-- 1) Core tables: add nullable org_id + index + base backfill by user_id -> organization_members
DO $$
DECLARE
    tbl text;
    idx_name text;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'leads',
            'interacoes',
            'whatsapp_instances',
            'propostas',
            'appointments',
            'deals',
            'lead_stage_history',
            'comentarios_leads'
        ])
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);',
            tbl
        );

        idx_name := format('idx_%s_org_id', tbl);
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id);', idx_name, tbl);

        IF EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_schema = 'public'
              AND c.table_name = tbl
              AND c.column_name = 'user_id'
        ) THEN
            EXECUTE format(
                'UPDATE public.%I AS t
                 SET org_id = om.org_id
                 FROM (
                     SELECT user_id, (array_agg(org_id ORDER BY org_id))[1] AS org_id
                     FROM public.organization_members
                     WHERE user_id IS NOT NULL
                     GROUP BY user_id
                 ) AS om
                 WHERE t.org_id IS NULL
                   AND t.user_id = om.user_id;',
                tbl
            );
        END IF;
    END LOOP;
END
$$;

-- 2) AI tables: rename company_id -> org_id when needed
DO $$
DECLARE
    tbl text;
    has_company_id boolean;
    has_org_id boolean;
BEGIN
    FOR tbl IN
        SELECT unnest(ARRAY[
            'ai_settings',
            'ai_stage_config',
            'ai_agent_runs',
            'ai_summaries',
            'ai_action_logs'
        ])
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
              AND t.table_name = tbl
        ) THEN
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.table_name = tbl
                  AND c.column_name = 'company_id'
            ) INTO has_company_id;

            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.table_name = tbl
                  AND c.column_name = 'org_id'
            ) INTO has_org_id;

            IF has_company_id AND NOT has_org_id THEN
                EXECUTE format('ALTER TABLE public.%I RENAME COLUMN company_id TO org_id;', tbl);
            END IF;
        END IF;
    END LOOP;
END
$$;

-- 3) Additional deterministic backfills (idempotent)
DO $$
BEGIN
    -- leads by instance_name -> whatsapp_instances
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'instance_name'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'user_id'
    ) THEN
        WITH wi_map AS (
            SELECT
                instance_name,
                (array_agg(org_id ORDER BY org_id))[1] AS org_id,
                (array_agg(user_id ORDER BY user_id))[1] AS user_id
            FROM public.whatsapp_instances
            WHERE instance_name IS NOT NULL
            GROUP BY instance_name
        )
        UPDATE public.leads l
        SET
            org_id = wi.org_id,
            user_id = COALESCE(l.user_id, wi.user_id)
        FROM wi_map wi
        WHERE l.org_id IS NULL
          AND l.instance_name = wi.instance_name
          AND (l.user_id IS NULL OR l.user_id = wi.user_id);
    END IF;

    -- leads by membership
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'user_id'
    ) THEN
        WITH om_map AS (
            SELECT user_id, (array_agg(org_id ORDER BY org_id))[1] AS org_id
            FROM public.organization_members
            WHERE user_id IS NOT NULL
            GROUP BY user_id
        )
        UPDATE public.leads l
        SET org_id = om.org_id
        FROM om_map om
        WHERE l.org_id IS NULL
          AND l.user_id = om.user_id;
    END IF;

    -- propostas by user_id then lead_id
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'propostas' AND column_name = 'user_id'
    ) THEN
        WITH om_map AS (
            SELECT user_id, (array_agg(org_id ORDER BY org_id))[1] AS org_id
            FROM public.organization_members
            WHERE user_id IS NOT NULL
            GROUP BY user_id
        )
        UPDATE public.propostas p
        SET org_id = om.org_id
        FROM om_map om
        WHERE p.org_id IS NULL
          AND p.user_id = om.user_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'propostas' AND column_name = 'lead_id'
    ) THEN
        UPDATE public.propostas p
        SET org_id = l.org_id
        FROM public.leads l
        WHERE p.org_id IS NULL
          AND p.lead_id = l.id
          AND l.org_id IS NOT NULL;
    END IF;

    -- interacoes by user_id, lead_id, then instance_name
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interacoes' AND column_name = 'user_id'
    ) THEN
        WITH om_map AS (
            SELECT user_id, (array_agg(org_id ORDER BY org_id))[1] AS org_id
            FROM public.organization_members
            WHERE user_id IS NOT NULL
            GROUP BY user_id
        )
        UPDATE public.interacoes i
        SET org_id = om.org_id
        FROM om_map om
        WHERE i.org_id IS NULL
          AND i.user_id = om.user_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interacoes' AND column_name = 'lead_id'
    ) THEN
        UPDATE public.interacoes i
        SET org_id = l.org_id
        FROM public.leads l
        WHERE i.org_id IS NULL
          AND i.lead_id = l.id
          AND l.org_id IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interacoes' AND column_name = 'instance_name'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interacoes' AND column_name = 'user_id'
    ) THEN
        WITH wi_map AS (
            SELECT
                instance_name,
                (array_agg(org_id ORDER BY org_id))[1] AS org_id,
                (array_agg(user_id ORDER BY user_id))[1] AS user_id
            FROM public.whatsapp_instances
            WHERE instance_name IS NOT NULL
            GROUP BY instance_name
        )
        UPDATE public.interacoes i
        SET
            org_id = wi.org_id,
            user_id = COALESCE(i.user_id, wi.user_id)
        FROM wi_map wi
        WHERE i.org_id IS NULL
          AND i.instance_name = wi.instance_name
          AND (i.user_id IS NULL OR i.user_id = wi.user_id);
    END IF;

    -- comentarios by lead_id
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'comentarios_leads' AND column_name = 'lead_id'
    ) THEN
        UPDATE public.comentarios_leads c
        SET org_id = l.org_id
        FROM public.leads l
        WHERE c.org_id IS NULL
          AND c.lead_id = l.id
          AND l.org_id IS NOT NULL;
    END IF;
END
$$;

-- 4) Orphan patch: primary owner fallback for legacy rows still null
DO $$
DECLARE
    v_org uuid;
    v_owner uuid;
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
        INTO v_org, v_owner
        FROM public.organization_members om
        WHERE om.role = 'owner'
        ORDER BY om.joined_at ASC NULLS LAST, om.org_id ASC
        LIMIT 1;
    ELSE
        SELECT om.org_id, om.user_id
        INTO v_org, v_owner
        FROM public.organization_members om
        WHERE om.role = 'owner'
        ORDER BY om.org_id ASC
        LIMIT 1;
    END IF;

    IF v_org IS NULL OR v_owner IS NULL THEN
        RAISE EXCEPTION 'No primary owner found in organization_members';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'instance_name'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'user_id'
    ) THEN
        EXECUTE format(
            'UPDATE public.leads
             SET org_id = %L::uuid,
                 user_id = %L::uuid
             WHERE org_id IS NULL
               AND user_id IS NULL
               AND instance_name = ''legacy_migration'';',
            v_org,
            v_owner
        );
    ELSE
        EXECUTE format(
            'UPDATE public.leads
             SET org_id = %L::uuid
             WHERE org_id IS NULL
               AND id IN (1,2,3,4,5);',
            v_org
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'propostas' AND column_name = 'lead_id'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'propostas' AND column_name = 'user_id'
    ) THEN
        UPDATE public.propostas p
        SET
            org_id = l.org_id,
            user_id = COALESCE(p.user_id, l.user_id)
        FROM public.leads l
        WHERE p.org_id IS NULL
          AND p.lead_id = l.id
          AND l.org_id IS NOT NULL;
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'propostas' AND column_name = 'lead_id'
    ) THEN
        UPDATE public.propostas p
        SET org_id = l.org_id
        FROM public.leads l
        WHERE p.org_id IS NULL
          AND p.lead_id = l.id
          AND l.org_id IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'propostas' AND column_name = 'user_id'
    ) THEN
        EXECUTE format(
            'UPDATE public.propostas
             SET org_id = %L::uuid,
                 user_id = COALESCE(user_id, %L::uuid)
             WHERE org_id IS NULL;',
            v_org,
            v_owner
        );
    ELSE
        EXECUTE format(
            'UPDATE public.propostas
             SET org_id = %L::uuid
             WHERE org_id IS NULL;',
            v_org
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interacoes' AND column_name = 'lead_id'
    )
    AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interacoes' AND column_name = 'user_id'
    ) THEN
        UPDATE public.interacoes i
        SET
            org_id = l.org_id,
            user_id = COALESCE(i.user_id, l.user_id)
        FROM public.leads l
        WHERE i.org_id IS NULL
          AND i.lead_id = l.id
          AND l.org_id IS NOT NULL;
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interacoes' AND column_name = 'lead_id'
    ) THEN
        UPDATE public.interacoes i
        SET org_id = l.org_id
        FROM public.leads l
        WHERE i.org_id IS NULL
          AND i.lead_id = l.id
          AND l.org_id IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'interacoes' AND column_name = 'user_id'
    ) THEN
        EXECUTE format(
            'UPDATE public.interacoes
             SET org_id = %L::uuid,
                 user_id = COALESCE(user_id, %L::uuid)
             WHERE org_id IS NULL;',
            v_org,
            v_owner
        );
    ELSE
        EXECUTE format(
            'UPDATE public.interacoes
             SET org_id = %L::uuid
             WHERE org_id IS NULL;',
            v_org
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'comentarios_leads' AND column_name = 'lead_id'
    ) THEN
        UPDATE public.comentarios_leads c
        SET org_id = l.org_id
        FROM public.leads l
        WHERE c.org_id IS NULL
          AND c.lead_id = l.id
          AND l.org_id IS NOT NULL;
    END IF;
END
$$;
