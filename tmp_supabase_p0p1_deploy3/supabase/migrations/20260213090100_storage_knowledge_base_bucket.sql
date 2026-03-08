-- Migration: 20260213_storage_knowledge_base_bucket
-- Description: Ensure storage bucket exists for Knowledge Base uploads and allow authenticated CRUD.

-- Create bucket if missing (id is the bucket_id used by storage.objects.bucket_id).
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-base', 'knowledge-base', false)
ON CONFLICT (id) DO NOTHING;

-- Policies for knowledge-base bucket.
-- NOTE: This is permissive (any authenticated user). Matches current project's general KB RLS patterns.

DROP POLICY IF EXISTS "Authenticated can read knowledge-base" ON storage.objects;
CREATE POLICY "Authenticated can read knowledge-base"
ON storage.objects FOR SELECT
USING (bucket_id = 'knowledge-base' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can upload knowledge-base" ON storage.objects;
CREATE POLICY "Authenticated can upload knowledge-base"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'knowledge-base' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can update knowledge-base" ON storage.objects;
CREATE POLICY "Authenticated can update knowledge-base"
ON storage.objects FOR UPDATE
USING (bucket_id = 'knowledge-base' AND auth.role() = 'authenticated')
WITH CHECK (bucket_id = 'knowledge-base' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can delete knowledge-base" ON storage.objects;
CREATE POLICY "Authenticated can delete knowledge-base"
ON storage.objects FOR DELETE
USING (bucket_id = 'knowledge-base' AND auth.role() = 'authenticated');

