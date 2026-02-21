-- P0.3: Knowledge Base multi-tenant hardening
-- - org_id mandatory + indexed
-- - strict org-scoped RLS on KB tables
-- - storage policies scoped by org prefix

DO $$
DECLARE
  v_default_org uuid;
BEGIN
  SELECT om.org_id
    INTO v_default_org
  FROM public.organization_members om
  WHERE om.role = 'owner'
  ORDER BY om.created_at ASC NULLS LAST, om.org_id ASC
  LIMIT 1;

  IF v_default_org IS NULL THEN
    SELECT om.org_id
      INTO v_default_org
    FROM public.organization_members om
    ORDER BY om.created_at ASC NULLS LAST, om.org_id ASC
    LIMIT 1;
  END IF;

  IF to_regclass('public.kb_items') IS NOT NULL THEN
    UPDATE public.kb_items k
    SET org_id = om_org.org_id
    FROM LATERAL (
      SELECT om.org_id
      FROM public.organization_members om
      WHERE om.user_id = k.created_by
      ORDER BY om.created_at ASC NULLS LAST, om.org_id ASC
      LIMIT 1
    ) om_org
    WHERE k.org_id IS NULL
      AND k.created_by IS NOT NULL;

    IF v_default_org IS NOT NULL THEN
      UPDATE public.kb_items k
      SET org_id = v_default_org
      WHERE k.org_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.kb_item_chunks') IS NOT NULL AND to_regclass('public.kb_items') IS NOT NULL THEN
    UPDATE public.kb_item_chunks c
    SET org_id = k.org_id
    FROM public.kb_items k
    WHERE c.kb_item_id = k.id
      AND c.org_id IS NULL
      AND k.org_id IS NOT NULL;

    IF v_default_org IS NOT NULL THEN
      UPDATE public.kb_item_chunks c
      SET org_id = v_default_org
      WHERE c.org_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.testimonials') IS NOT NULL THEN
    UPDATE public.testimonials t
    SET org_id = om_org.org_id
    FROM LATERAL (
      SELECT om.org_id
      FROM public.organization_members om
      WHERE om.user_id = t.created_by
      ORDER BY om.created_at ASC NULLS LAST, om.org_id ASC
      LIMIT 1
    ) om_org
    WHERE t.org_id IS NULL
      AND t.created_by IS NOT NULL;

    IF v_default_org IS NOT NULL THEN
      UPDATE public.testimonials t
      SET org_id = v_default_org
      WHERE t.org_id IS NULL;
    END IF;
  END IF;

  IF to_regclass('public.company_profile') IS NOT NULL AND v_default_org IS NOT NULL THEN
    UPDATE public.company_profile cp
    SET org_id = v_default_org
    WHERE cp.org_id IS NULL;
  END IF;

  IF to_regclass('public.objection_responses') IS NOT NULL AND v_default_org IS NOT NULL THEN
    UPDATE public.objection_responses o
    SET org_id = v_default_org
    WHERE o.org_id IS NULL;
  END IF;
END
$$;

DO $$
DECLARE
  v_table text;
  v_null_count bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'kb_items',
    'kb_item_chunks',
    'company_profile',
    'objection_responses',
    'testimonials'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_m20_%I_org_id ON public.%I (org_id)', v_table, v_table);

    EXECUTE format('SELECT count(*)::bigint FROM public.%I WHERE org_id IS NULL', v_table)
      INTO v_null_count;

    IF v_null_count > 0 THEN
      RAISE EXCEPTION 'KB hardening aborted: %.org_id still has % NULL rows', v_table, v_null_count;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', v_table);
  END LOOP;
END
$$;

DO $$
DECLARE
  v_table text;
  r record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'kb_items',
    'kb_item_chunks',
    'company_profile',
    'objection_responses',
    'testimonials'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

    FOR r IN
      SELECT p.policyname
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, v_table);
    END LOOP;

    EXECUTE format('CREATE POLICY m20_service_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', v_table);
    EXECUTE format('CREATE POLICY m20_auth_select_org ON public.%I FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id))', v_table);
    EXECUTE format('CREATE POLICY m20_auth_insert_org ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id))', v_table);
    EXECUTE format('CREATE POLICY m20_auth_update_org ON public.%I FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id)) WITH CHECK (public.user_belongs_to_org(org_id))', v_table);
    EXECUTE format('CREATE POLICY m20_auth_delete_org ON public.%I FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id))', v_table);
  END LOOP;
END
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-base', 'knowledge-base', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can read knowledge-base" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload knowledge-base" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update knowledge-base" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete knowledge-base" ON storage.objects;
DROP POLICY IF EXISTS "kb_storage_service_all" ON storage.objects;
DROP POLICY IF EXISTS "kb_storage_select_org" ON storage.objects;
DROP POLICY IF EXISTS "kb_storage_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "kb_storage_update_org" ON storage.objects;
DROP POLICY IF EXISTS "kb_storage_delete_org" ON storage.objects;

CREATE POLICY "kb_storage_service_all"
ON storage.objects
FOR ALL TO service_role
USING (bucket_id = 'knowledge-base')
WITH CHECK (bucket_id = 'knowledge-base');

CREATE POLICY "kb_storage_select_org"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'knowledge-base'
  AND (
    (
      split_part(name, '/', 1) = 'org'
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 2)
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 1)
      )
    )
  )
);

CREATE POLICY "kb_storage_insert_org"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-base'
  AND (
    (
      split_part(name, '/', 1) = 'org'
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 2)
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 1)
      )
    )
  )
);

CREATE POLICY "kb_storage_update_org"
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'knowledge-base'
  AND (
    (
      split_part(name, '/', 1) = 'org'
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 2)
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 1)
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'knowledge-base'
  AND (
    (
      split_part(name, '/', 1) = 'org'
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 2)
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 1)
      )
    )
  )
);

CREATE POLICY "kb_storage_delete_org"
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'knowledge-base'
  AND (
    (
      split_part(name, '/', 1) = 'org'
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 2)
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
          AND om.org_id::text = split_part(name, '/', 1)
      )
    )
  )
);

