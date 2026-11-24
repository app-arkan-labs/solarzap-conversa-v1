INSERT INTO storage.buckets (id, name, public)
VALUES
  ('chat-attachments', 'chat-attachments', true),
  ('chat-delivery', 'chat-delivery', true),
  ('proposal-assets', 'proposal-assets', true),
  ('testimonials', 'testimonials', true),
  ('exports', 'exports', false),
  ('proposals', 'proposals', false),
  ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

-- The frontend writes to <org_id>/... and WhatsApp inbound media uses org/<org_id>/....
CREATE POLICY solarzap_media_org_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id IN ('chat-attachments', 'chat-delivery', 'proposal-assets', 'testimonials')
  AND EXISTS (
    SELECT 1 FROM public.organization_members AS m
    WHERE m.user_id = auth.uid()
      AND m.org_id::text = CASE
        WHEN (storage.foldername(name))[1] = 'org' THEN (storage.foldername(name))[2]
        ELSE (storage.foldername(name))[1]
      END
  )
);

CREATE POLICY solarzap_media_org_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('chat-attachments', 'chat-delivery', 'proposal-assets', 'testimonials')
  AND EXISTS (
    SELECT 1 FROM public.organization_members AS m
    WHERE m.user_id = auth.uid() AND m.org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY solarzap_proposal_assets_org_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposal-assets'
  AND EXISTS (
    SELECT 1 FROM public.organization_members AS m
    WHERE m.user_id = auth.uid() AND m.org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY solarzap_proposal_assets_org_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'proposal-assets'
  AND EXISTS (
    SELECT 1 FROM public.organization_members AS m
    WHERE m.user_id = auth.uid() AND m.org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY solarzap_exports_owner ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);
