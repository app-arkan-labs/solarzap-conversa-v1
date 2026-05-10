-- Internal CRM only: prepare pending inbound media for the safer resolver flow.

UPDATE internal_crm.messages
SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{media_resolver_message}',
      COALESCE(metadata->'media_resolver_message', metadata->'data'),
      true
    ),
    attachment_ready = false,
    attachment_error = false,
    attachment_error_message = 'READY_FOR_MEDIA_RESOLVER_RETRY',
    attachment_attempt_count = 0,
    attachment_last_attempt_at = NULL
WHERE message_type IN ('image', 'video', 'audio', 'document')
  AND attachment_url IS NULL
  AND COALESCE(metadata, '{}'::jsonb) ? 'data'
  AND (
    attachment_ready IS DISTINCT FROM false
    OR attachment_error IS DISTINCT FROM false
    OR attachment_error_message IS DISTINCT FROM 'READY_FOR_MEDIA_RESOLVER_RETRY'
    OR NOT (COALESCE(metadata, '{}'::jsonb) ? 'media_resolver_message')
  );

UPDATE storage.buckets
SET public = true
WHERE id IN ('internal-crm-chat-delivery', 'internal-crm-chat-attachments', 'internal-crm-media');
