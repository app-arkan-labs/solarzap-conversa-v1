ALTER TABLE internal_crm.messages
  ADD COLUMN IF NOT EXISTS attachment_ready boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS attachment_mimetype text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint,
  ADD COLUMN IF NOT EXISTS attachment_error boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_error_message text,
  ADD COLUMN IF NOT EXISTS attachment_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachment_last_attempt_at timestamptz;

UPDATE internal_crm.messages
SET attachment_ready = true
WHERE attachment_url IS NOT NULL
  AND attachment_ready IS DISTINCT FROM true;

CREATE INDEX IF NOT EXISTS idx_internal_crm_messages_media_pending_retry
  ON internal_crm.messages (created_at DESC)
  WHERE attachment_ready = false
    AND message_type IN ('image', 'video', 'audio', 'document');
