-- M21: Reconcile P0.3 KB RLS policies (idempotent)
-- Goal: keep staging/repo/prod aligned after manual emergency SQL

ALTER TABLE IF EXISTS public.kb_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kb_item_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.objection_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.testimonials ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.kb_items ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.kb_item_chunks ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.company_profile ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.objection_responses ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE IF EXISTS public.testimonials ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_m20_kb_items_org_id ON public.kb_items (org_id);
CREATE INDEX IF NOT EXISTS idx_m20_kb_item_chunks_org_id ON public.kb_item_chunks (org_id);
CREATE INDEX IF NOT EXISTS idx_m20_company_profile_org_id ON public.company_profile (org_id);
CREATE INDEX IF NOT EXISTS idx_m20_objection_responses_org_id ON public.objection_responses (org_id);
CREATE INDEX IF NOT EXISTS idx_m20_testimonials_org_id ON public.testimonials (org_id);

DROP POLICY IF EXISTS m20_service_all ON public.kb_items;
DROP POLICY IF EXISTS m20_auth_select_org ON public.kb_items;
DROP POLICY IF EXISTS m20_auth_insert_org ON public.kb_items;
DROP POLICY IF EXISTS m20_auth_update_org ON public.kb_items;
DROP POLICY IF EXISTS m20_auth_delete_org ON public.kb_items;

CREATE POLICY m20_service_all ON public.kb_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY m20_auth_select_org ON public.kb_items FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_insert_org ON public.kb_items FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_update_org ON public.kb_items FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id)) WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_delete_org ON public.kb_items FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS m20_service_all ON public.kb_item_chunks;
DROP POLICY IF EXISTS m20_auth_select_org ON public.kb_item_chunks;
DROP POLICY IF EXISTS m20_auth_insert_org ON public.kb_item_chunks;
DROP POLICY IF EXISTS m20_auth_update_org ON public.kb_item_chunks;
DROP POLICY IF EXISTS m20_auth_delete_org ON public.kb_item_chunks;

CREATE POLICY m20_service_all ON public.kb_item_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY m20_auth_select_org ON public.kb_item_chunks FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_insert_org ON public.kb_item_chunks FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_update_org ON public.kb_item_chunks FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id)) WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_delete_org ON public.kb_item_chunks FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS m20_service_all ON public.company_profile;
DROP POLICY IF EXISTS m20_auth_select_org ON public.company_profile;
DROP POLICY IF EXISTS m20_auth_insert_org ON public.company_profile;
DROP POLICY IF EXISTS m20_auth_update_org ON public.company_profile;
DROP POLICY IF EXISTS m20_auth_delete_org ON public.company_profile;

CREATE POLICY m20_service_all ON public.company_profile FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY m20_auth_select_org ON public.company_profile FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_insert_org ON public.company_profile FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_update_org ON public.company_profile FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id)) WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_delete_org ON public.company_profile FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS m20_service_all ON public.objection_responses;
DROP POLICY IF EXISTS m20_auth_select_org ON public.objection_responses;
DROP POLICY IF EXISTS m20_auth_insert_org ON public.objection_responses;
DROP POLICY IF EXISTS m20_auth_update_org ON public.objection_responses;
DROP POLICY IF EXISTS m20_auth_delete_org ON public.objection_responses;

CREATE POLICY m20_service_all ON public.objection_responses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY m20_auth_select_org ON public.objection_responses FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_insert_org ON public.objection_responses FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_update_org ON public.objection_responses FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id)) WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_delete_org ON public.objection_responses FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS m20_service_all ON public.testimonials;
DROP POLICY IF EXISTS m20_auth_select_org ON public.testimonials;
DROP POLICY IF EXISTS m20_auth_insert_org ON public.testimonials;
DROP POLICY IF EXISTS m20_auth_update_org ON public.testimonials;
DROP POLICY IF EXISTS m20_auth_delete_org ON public.testimonials;

CREATE POLICY m20_service_all ON public.testimonials FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY m20_auth_select_org ON public.testimonials FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_insert_org ON public.testimonials FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_update_org ON public.testimonials FOR UPDATE TO authenticated USING (public.user_belongs_to_org(org_id)) WITH CHECK (public.user_belongs_to_org(org_id));
CREATE POLICY m20_auth_delete_org ON public.testimonials FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

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
