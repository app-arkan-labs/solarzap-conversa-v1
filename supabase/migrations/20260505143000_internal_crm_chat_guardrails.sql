CREATE TABLE IF NOT EXISTS internal_crm.webhook_ignored_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid REFERENCES internal_crm.whatsapp_instances(id) ON DELETE SET NULL,
  event text NOT NULL,
  reason text NOT NULL,
  raw_remote_jid text,
  normalized_remote_jid text,
  phone text,
  wa_message_id text,
  from_me boolean,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_webhook_ignored_events_created_at
  ON internal_crm.webhook_ignored_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_webhook_ignored_events_reason
  ON internal_crm.webhook_ignored_events (reason, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_webhook_ignored_events_message
  ON internal_crm.webhook_ignored_events (wa_message_id, created_at DESC)
  WHERE wa_message_id IS NOT NULL;

ALTER TABLE internal_crm.webhook_ignored_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_crm_webhook_ignored_events_service_all ON internal_crm.webhook_ignored_events;
CREATE POLICY internal_crm_webhook_ignored_events_service_all
  ON internal_crm.webhook_ignored_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_webhook_ignored_events_auth_read ON internal_crm.webhook_ignored_events;
CREATE POLICY internal_crm_webhook_ignored_events_auth_read
  ON internal_crm.webhook_ignored_events
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

WITH ranked_conversations AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, whatsapp_instance_id, channel
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM internal_crm.conversations
  WHERE channel = 'whatsapp'
    AND whatsapp_instance_id IS NOT NULL
    AND status IN ('open', 'resolved')
)
UPDATE internal_crm.conversations AS conversations
SET status = 'archived',
    updated_at = now()
FROM ranked_conversations
WHERE ranked_conversations.id = conversations.id
  AND ranked_conversations.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_conversations_active_whatsapp_unique
  ON internal_crm.conversations (client_id, whatsapp_instance_id, channel)
  WHERE channel = 'whatsapp'
    AND whatsapp_instance_id IS NOT NULL
    AND status IN ('open', 'resolved');

DELETE FROM internal_crm.messages AS messages
USING (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY whatsapp_instance_id, wa_message_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM internal_crm.messages
  WHERE whatsapp_instance_id IS NOT NULL
    AND wa_message_id IS NOT NULL
) AS ranked_messages
WHERE ranked_messages.id = messages.id
  AND ranked_messages.rn > 1;

DROP INDEX IF EXISTS internal_crm.idx_internal_crm_messages_wa_message_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_messages_instance_wa_message_id
  ON internal_crm.messages (whatsapp_instance_id, wa_message_id)
  WHERE whatsapp_instance_id IS NOT NULL
    AND wa_message_id IS NOT NULL;
