-- Create a new public bucket for Chat Delivery
-- This ensures media URLs are clean (no tokens) and accessible by Evolution API

-- 1. Create Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-delivery', 'chat-delivery', true)
ON CONFLICT (id) DO UPDATE
SET public = true;

-- 2. Policy: Allow Public Read (Anyone can view/download)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'chat-delivery' );

-- 3. Policy: Allow Authenticated Insert (Users can upload)
DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'chat-delivery' );

-- 4. Policy: Allow Authenticated Update/Delete (Optional, for cleanup)
DROP POLICY IF EXISTS "Authenticated Delete" ON storage.objects;
CREATE POLICY "Authenticated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'chat-delivery' );
