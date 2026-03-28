CREATE TABLE IF NOT EXISTS internal_crm.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (
    status IN ('connected', 'disconnected', 'connecting', 'error')
  ),
  ai_enabled boolean NOT NULL DEFAULT false,
  assistant_identity_name text,
  assistant_prompt_override text,
  phone_number text,
  webhook_url text,
  qr_code_base64 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES internal_crm.client_contacts(id) ON DELETE SET NULL,
  whatsapp_instance_id uuid REFERENCES internal_crm.whatsapp_instances(id) ON DELETE SET NULL,
  assigned_to_user_id uuid,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'manual_note')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'archived')),
  subject text,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_conversations_status_last_message
  ON internal_crm.conversations (status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_conversations_client
  ON internal_crm.conversations (client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS internal_crm.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES internal_crm.conversations(id) ON DELETE CASCADE,
  whatsapp_instance_id uuid REFERENCES internal_crm.whatsapp_instances(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  body text,
  message_type text NOT NULL DEFAULT 'text' CHECK (
    message_type IN ('text', 'image', 'audio', 'document', 'video', 'note')
  ),
  attachment_url text,
  wa_message_id text,
  remote_jid text,
  sent_by_user_id uuid,
  read_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (
    delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed')
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_messages_wa_message_id
  ON internal_crm.messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_crm_messages_conversation_created
  ON internal_crm.messages (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS internal_crm.broadcast_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  whatsapp_instance_id uuid REFERENCES internal_crm.whatsapp_instances(id) ON DELETE SET NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'running', 'paused', 'completed', 'canceled')
  ),
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  owner_user_id uuid,
  target_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS internal_crm.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES internal_crm.broadcast_campaigns(id) ON DELETE CASCADE,
  client_id uuid REFERENCES internal_crm.clients(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES internal_crm.client_contacts(id) ON DELETE SET NULL,
  recipient_name text,
  recipient_phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'skipped', 'canceled')
  ),
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_broadcast_recipients_campaign_status
  ON internal_crm.broadcast_recipients (campaign_id, status, created_at);

CREATE TABLE IF NOT EXISTS internal_crm.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT false,
  qualification_enabled boolean NOT NULL DEFAULT false,
  follow_up_enabled boolean NOT NULL DEFAULT false,
  broadcast_assistant_enabled boolean NOT NULL DEFAULT false,
  onboarding_assistant_enabled boolean NOT NULL DEFAULT false,
  model text,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  default_prompt text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_crm.ai_stage_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_code text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  system_prompt text,
  prompt_version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_code)
);

CREATE TABLE IF NOT EXISTS internal_crm.scheduled_agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (
    job_type IN ('qualification', 'follow_up', 'broadcast_assistant', 'onboarding')
  ),
  client_id uuid REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES internal_crm.conversations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'canceled')
  ),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_crm_scheduled_agent_jobs_status_schedule
  ON internal_crm.scheduled_agent_jobs (status, scheduled_at);

CREATE TABLE IF NOT EXISTS internal_crm.ai_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES internal_crm.scheduled_agent_jobs(id) ON DELETE SET NULL,
  client_id uuid REFERENCES internal_crm.clients(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (
    status IN ('pending', 'completed', 'failed', 'skipped')
  ),
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE internal_crm.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.ai_stage_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.scheduled_agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.ai_action_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_crm_whatsapp_instances_service_all ON internal_crm.whatsapp_instances;
CREATE POLICY internal_crm_whatsapp_instances_service_all
  ON internal_crm.whatsapp_instances
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_whatsapp_instances_auth_read ON internal_crm.whatsapp_instances;
CREATE POLICY internal_crm_whatsapp_instances_auth_read
  ON internal_crm.whatsapp_instances
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_whatsapp_instances_auth_write ON internal_crm.whatsapp_instances;
CREATE POLICY internal_crm_whatsapp_instances_auth_write
  ON internal_crm.whatsapp_instances
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_conversations_service_all ON internal_crm.conversations;
CREATE POLICY internal_crm_conversations_service_all
  ON internal_crm.conversations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_conversations_auth_read ON internal_crm.conversations;
CREATE POLICY internal_crm_conversations_auth_read
  ON internal_crm.conversations
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_conversations_auth_write ON internal_crm.conversations;
CREATE POLICY internal_crm_conversations_auth_write
  ON internal_crm.conversations
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_messages_service_all ON internal_crm.messages;
CREATE POLICY internal_crm_messages_service_all
  ON internal_crm.messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_messages_auth_read ON internal_crm.messages;
CREATE POLICY internal_crm_messages_auth_read
  ON internal_crm.messages
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_messages_auth_write ON internal_crm.messages;
CREATE POLICY internal_crm_messages_auth_write
  ON internal_crm.messages
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_broadcast_campaigns_service_all ON internal_crm.broadcast_campaigns;
CREATE POLICY internal_crm_broadcast_campaigns_service_all
  ON internal_crm.broadcast_campaigns
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_broadcast_campaigns_auth_read ON internal_crm.broadcast_campaigns;
CREATE POLICY internal_crm_broadcast_campaigns_auth_read
  ON internal_crm.broadcast_campaigns
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_broadcast_campaigns_auth_write ON internal_crm.broadcast_campaigns;
CREATE POLICY internal_crm_broadcast_campaigns_auth_write
  ON internal_crm.broadcast_campaigns
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_broadcast_recipients_service_all ON internal_crm.broadcast_recipients;
CREATE POLICY internal_crm_broadcast_recipients_service_all
  ON internal_crm.broadcast_recipients
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_broadcast_recipients_auth_read ON internal_crm.broadcast_recipients;
CREATE POLICY internal_crm_broadcast_recipients_auth_read
  ON internal_crm.broadcast_recipients
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_broadcast_recipients_auth_write ON internal_crm.broadcast_recipients;
CREATE POLICY internal_crm_broadcast_recipients_auth_write
  ON internal_crm.broadcast_recipients
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_ai_settings_service_all ON internal_crm.ai_settings;
CREATE POLICY internal_crm_ai_settings_service_all
  ON internal_crm.ai_settings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_ai_settings_auth_read ON internal_crm.ai_settings;
CREATE POLICY internal_crm_ai_settings_auth_read
  ON internal_crm.ai_settings
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_ai_settings_auth_write ON internal_crm.ai_settings;
CREATE POLICY internal_crm_ai_settings_auth_write
  ON internal_crm.ai_settings
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_ai_stage_config_service_all ON internal_crm.ai_stage_config;
CREATE POLICY internal_crm_ai_stage_config_service_all
  ON internal_crm.ai_stage_config
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_ai_stage_config_auth_read ON internal_crm.ai_stage_config;
CREATE POLICY internal_crm_ai_stage_config_auth_read
  ON internal_crm.ai_stage_config
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_ai_stage_config_auth_write ON internal_crm.ai_stage_config;
CREATE POLICY internal_crm_ai_stage_config_auth_write
  ON internal_crm.ai_stage_config
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_scheduled_agent_jobs_service_all ON internal_crm.scheduled_agent_jobs;
CREATE POLICY internal_crm_scheduled_agent_jobs_service_all
  ON internal_crm.scheduled_agent_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_scheduled_agent_jobs_auth_read ON internal_crm.scheduled_agent_jobs;
CREATE POLICY internal_crm_scheduled_agent_jobs_auth_read
  ON internal_crm.scheduled_agent_jobs
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_scheduled_agent_jobs_auth_write ON internal_crm.scheduled_agent_jobs;
CREATE POLICY internal_crm_scheduled_agent_jobs_auth_write
  ON internal_crm.scheduled_agent_jobs
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_ai_action_logs_service_all ON internal_crm.ai_action_logs;
CREATE POLICY internal_crm_ai_action_logs_service_all
  ON internal_crm.ai_action_logs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_ai_action_logs_auth_read ON internal_crm.ai_action_logs;
CREATE POLICY internal_crm_ai_action_logs_auth_read
  ON internal_crm.ai_action_logs
  FOR SELECT TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_ai_action_logs_auth_write ON internal_crm.ai_action_logs;
CREATE POLICY internal_crm_ai_action_logs_auth_write
  ON internal_crm.ai_action_logs
  FOR ALL TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP TRIGGER IF EXISTS trg_internal_crm_whatsapp_instances_updated_at ON internal_crm.whatsapp_instances;
CREATE TRIGGER trg_internal_crm_whatsapp_instances_updated_at
  BEFORE UPDATE ON internal_crm.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_conversations_updated_at ON internal_crm.conversations;
CREATE TRIGGER trg_internal_crm_conversations_updated_at
  BEFORE UPDATE ON internal_crm.conversations
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_broadcast_campaigns_updated_at ON internal_crm.broadcast_campaigns;
CREATE TRIGGER trg_internal_crm_broadcast_campaigns_updated_at
  BEFORE UPDATE ON internal_crm.broadcast_campaigns
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_broadcast_recipients_updated_at ON internal_crm.broadcast_recipients;
CREATE TRIGGER trg_internal_crm_broadcast_recipients_updated_at
  BEFORE UPDATE ON internal_crm.broadcast_recipients
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_ai_settings_updated_at ON internal_crm.ai_settings;
CREATE TRIGGER trg_internal_crm_ai_settings_updated_at
  BEFORE UPDATE ON internal_crm.ai_settings
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_ai_stage_config_updated_at ON internal_crm.ai_stage_config;
CREATE TRIGGER trg_internal_crm_ai_stage_config_updated_at
  BEFORE UPDATE ON internal_crm.ai_stage_config
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_scheduled_agent_jobs_updated_at ON internal_crm.scheduled_agent_jobs;
CREATE TRIGGER trg_internal_crm_scheduled_agent_jobs_updated_at
  BEFORE UPDATE ON internal_crm.scheduled_agent_jobs
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();
