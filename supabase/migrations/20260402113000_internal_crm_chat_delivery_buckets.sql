INSERT INTO storage.buckets (id, name, public)
VALUES
  ('internal-crm-chat-delivery', 'internal-crm-chat-delivery', true),
  ('internal-crm-chat-attachments', 'internal-crm-chat-attachments', true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

DROP POLICY IF EXISTS "internal_crm_chat_delivery_service_all" ON storage.objects;
CREATE POLICY "internal_crm_chat_delivery_service_all"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'internal-crm-chat-delivery')
WITH CHECK (bucket_id = 'internal-crm-chat-delivery');

DROP POLICY IF EXISTS "internal_crm_chat_delivery_auth_read" ON storage.objects;
CREATE POLICY "internal_crm_chat_delivery_auth_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'internal-crm-chat-delivery'
  AND internal_crm.current_user_crm_role() <> 'none'
);

DROP POLICY IF EXISTS "internal_crm_chat_delivery_auth_insert" ON storage.objects;
CREATE POLICY "internal_crm_chat_delivery_auth_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internal-crm-chat-delivery'
  AND internal_crm.current_user_can_write()
);

DROP POLICY IF EXISTS "internal_crm_chat_delivery_auth_update" ON storage.objects;
CREATE POLICY "internal_crm_chat_delivery_auth_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'internal-crm-chat-delivery'
  AND internal_crm.current_user_can_write()
)
WITH CHECK (
  bucket_id = 'internal-crm-chat-delivery'
  AND internal_crm.current_user_can_write()
);

DROP POLICY IF EXISTS "internal_crm_chat_delivery_auth_delete" ON storage.objects;
CREATE POLICY "internal_crm_chat_delivery_auth_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'internal-crm-chat-delivery'
  AND internal_crm.current_user_can_write()
);

DROP POLICY IF EXISTS "internal_crm_chat_attachments_service_all" ON storage.objects;
CREATE POLICY "internal_crm_chat_attachments_service_all"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'internal-crm-chat-attachments')
WITH CHECK (bucket_id = 'internal-crm-chat-attachments');

DROP POLICY IF EXISTS "internal_crm_chat_attachments_auth_read" ON storage.objects;
CREATE POLICY "internal_crm_chat_attachments_auth_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'internal-crm-chat-attachments'
  AND internal_crm.current_user_crm_role() <> 'none'
);

DROP POLICY IF EXISTS "internal_crm_chat_attachments_auth_insert" ON storage.objects;
CREATE POLICY "internal_crm_chat_attachments_auth_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'internal-crm-chat-attachments'
  AND internal_crm.current_user_can_write()
);

DROP POLICY IF EXISTS "internal_crm_chat_attachments_auth_update" ON storage.objects;
CREATE POLICY "internal_crm_chat_attachments_auth_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'internal-crm-chat-attachments'
  AND internal_crm.current_user_can_write()
)
WITH CHECK (
  bucket_id = 'internal-crm-chat-attachments'
  AND internal_crm.current_user_can_write()
);

DROP POLICY IF EXISTS "internal_crm_chat_attachments_auth_delete" ON storage.objects;
CREATE POLICY "internal_crm_chat_attachments_auth_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'internal-crm-chat-attachments'
  AND internal_crm.current_user_can_write()
);
