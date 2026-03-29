CREATE TABLE IF NOT EXISTS internal_crm.landing_form_funnels (
  funnel_slug text PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  linked_public_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  linked_public_user_id uuid,
  owner_user_id uuid,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  whatsapp_phone text NOT NULL DEFAULT '5514991402780',
  meeting_link text,
  appointment_type text NOT NULL DEFAULT 'call' CHECK (
    appointment_type IN ('call', 'demo', 'meeting', 'visit', 'other')
  ),
  slot_duration_minutes integer NOT NULL DEFAULT 30 CHECK (
    slot_duration_minutes BETWEEN 5 AND 240
  ),
  slot_limit integer NOT NULL DEFAULT 8 CHECK (
    slot_limit BETWEEN 1 AND 48
  ),
  slot_lookahead_days integer NOT NULL DEFAULT 14 CHECK (
    slot_lookahead_days BETWEEN 1 AND 90
  ),
  allowed_origins text[] NOT NULL DEFAULT '{}'::text[],
  slot_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_crm_landing_form_funnels_slot_config_object_chk CHECK (
    jsonb_typeof(slot_config) = 'object'
  ),
  CONSTRAINT internal_crm_landing_form_funnels_metadata_object_chk CHECK (
    jsonb_typeof(metadata) = 'object'
  )
);

CREATE TABLE IF NOT EXISTS internal_crm.landing_form_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_session_id text NOT NULL UNIQUE,
  funnel_slug text NOT NULL REFERENCES internal_crm.landing_form_funnels(funnel_slug) ON DELETE CASCADE,
  button_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone_normalized text,
  full_name text,
  company_name text,
  email text,
  current_step text,
  last_completed_step text,
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'in_progress', 'abandoned', 'scheduled', 'completed')
  ),
  is_abandoned boolean NOT NULL DEFAULT false,
  abandoned_at timestamptz,
  internal_client_id uuid REFERENCES internal_crm.clients(id) ON DELETE SET NULL,
  internal_deal_id uuid REFERENCES internal_crm.deals(id) ON DELETE SET NULL,
  internal_appointment_id uuid REFERENCES internal_crm.appointments(id) ON DELETE SET NULL,
  tracking_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  landing_page_url text,
  referrer_url text,
  raw_querystring text,
  session_id text,
  ip_address inet,
  user_agent text,
  locale text,
  timezone text,
  scheduled_at timestamptz,
  last_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_crm_landing_form_sessions_button_context_object_chk CHECK (
    jsonb_typeof(button_context) = 'object'
  ),
  CONSTRAINT internal_crm_landing_form_sessions_tracking_payload_object_chk CHECK (
    jsonb_typeof(tracking_payload) = 'object'
  ),
  CONSTRAINT internal_crm_landing_form_sessions_last_payload_object_chk CHECK (
    jsonb_typeof(last_payload) = 'object'
  )
);

CREATE TABLE IF NOT EXISTS internal_crm.tracking_bridge (
  internal_client_id uuid PRIMARY KEY REFERENCES internal_crm.clients(id) ON DELETE CASCADE,
  internal_deal_id uuid UNIQUE REFERENCES internal_crm.deals(id) ON DELETE SET NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  public_lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_user_id uuid,
  last_synced_stage_code text,
  attribution_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_synced_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_crm_tracking_bridge_attribution_snapshot_object_chk CHECK (
    jsonb_typeof(attribution_snapshot) = 'object'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_crm_tracking_bridge_org_public_lead
  ON internal_crm.tracking_bridge (org_id, public_lead_id);

CREATE INDEX IF NOT EXISTS idx_internal_crm_landing_form_funnels_active
  ON internal_crm.landing_form_funnels (is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_landing_form_sessions_funnel_status_updated
  ON internal_crm.landing_form_sessions (funnel_slug, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_landing_form_sessions_phone_updated
  ON internal_crm.landing_form_sessions (phone_normalized, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_crm_tracking_bridge_last_synced
  ON internal_crm.tracking_bridge (last_synced_at DESC);

ALTER TABLE internal_crm.landing_form_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.landing_form_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_crm.tracking_bridge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS internal_crm_landing_form_funnels_service_all ON internal_crm.landing_form_funnels;
CREATE POLICY internal_crm_landing_form_funnels_service_all
  ON internal_crm.landing_form_funnels
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_landing_form_funnels_auth_read ON internal_crm.landing_form_funnels;
CREATE POLICY internal_crm_landing_form_funnels_auth_read
  ON internal_crm.landing_form_funnels
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_landing_form_funnels_auth_write ON internal_crm.landing_form_funnels;
CREATE POLICY internal_crm_landing_form_funnels_auth_write
  ON internal_crm.landing_form_funnels
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_landing_form_sessions_service_all ON internal_crm.landing_form_sessions;
CREATE POLICY internal_crm_landing_form_sessions_service_all
  ON internal_crm.landing_form_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_landing_form_sessions_auth_read ON internal_crm.landing_form_sessions;
CREATE POLICY internal_crm_landing_form_sessions_auth_read
  ON internal_crm.landing_form_sessions
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_landing_form_sessions_auth_write ON internal_crm.landing_form_sessions;
CREATE POLICY internal_crm_landing_form_sessions_auth_write
  ON internal_crm.landing_form_sessions
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

DROP POLICY IF EXISTS internal_crm_tracking_bridge_service_all ON internal_crm.tracking_bridge;
CREATE POLICY internal_crm_tracking_bridge_service_all
  ON internal_crm.tracking_bridge
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS internal_crm_tracking_bridge_auth_read ON internal_crm.tracking_bridge;
CREATE POLICY internal_crm_tracking_bridge_auth_read
  ON internal_crm.tracking_bridge
  FOR SELECT
  TO authenticated
  USING (internal_crm.current_user_crm_role() <> 'none');

DROP POLICY IF EXISTS internal_crm_tracking_bridge_auth_write ON internal_crm.tracking_bridge;
CREATE POLICY internal_crm_tracking_bridge_auth_write
  ON internal_crm.tracking_bridge
  FOR ALL
  TO authenticated
  USING (internal_crm.current_user_can_write())
  WITH CHECK (internal_crm.current_user_can_write());

GRANT SELECT, INSERT, UPDATE, DELETE ON internal_crm.landing_form_funnels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_crm.landing_form_funnels TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_crm.landing_form_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_crm.landing_form_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_crm.tracking_bridge TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON internal_crm.tracking_bridge TO service_role;

DROP TRIGGER IF EXISTS trg_internal_crm_landing_form_funnels_updated_at ON internal_crm.landing_form_funnels;
CREATE TRIGGER trg_internal_crm_landing_form_funnels_updated_at
  BEFORE UPDATE ON internal_crm.landing_form_funnels
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_landing_form_sessions_updated_at ON internal_crm.landing_form_sessions;
CREATE TRIGGER trg_internal_crm_landing_form_sessions_updated_at
  BEFORE UPDATE ON internal_crm.landing_form_sessions
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

DROP TRIGGER IF EXISTS trg_internal_crm_tracking_bridge_updated_at ON internal_crm.tracking_bridge;
CREATE TRIGGER trg_internal_crm_tracking_bridge_updated_at
  BEFORE UPDATE ON internal_crm.tracking_bridge
  FOR EACH ROW EXECUTE FUNCTION internal_crm.set_updated_at();

INSERT INTO internal_crm.landing_form_funnels (
  funnel_slug,
  name,
  allowed_origins,
  timezone,
  whatsapp_phone,
  appointment_type,
  slot_duration_minutes,
  slot_limit,
  slot_lookahead_days,
  slot_config,
  metadata
)
VALUES (
  'lp_aceleracao_solarzap',
  'LP Aceleracao SolarZap',
  ARRAY['https://lp.aceleracao.solarzap.com.br'],
  'America/Sao_Paulo',
  '5514991402780',
  'call',
  30,
  8,
  14,
  '{
    "call": {"start": "09:00", "end": "17:00", "days": ["mon", "tue", "wed", "thu", "fri"]},
    "visit": {"start": "09:00", "end": "17:00", "days": ["mon", "tue", "wed", "thu", "fri"]},
    "meeting": {"start": "09:00", "end": "17:00", "days": ["mon", "tue", "wed", "thu", "fri"]},
    "other": {"start": "09:00", "end": "17:00", "days": ["mon", "tue", "wed", "thu", "fri"]}
  }'::jsonb,
  '{"source":"lp_popup_intake_v1"}'::jsonb
)
ON CONFLICT (funnel_slug) DO UPDATE
SET
  name = EXCLUDED.name,
  allowed_origins = EXCLUDED.allowed_origins,
  timezone = EXCLUDED.timezone,
  whatsapp_phone = EXCLUDED.whatsapp_phone,
  appointment_type = EXCLUDED.appointment_type,
  slot_duration_minutes = EXCLUDED.slot_duration_minutes,
  slot_limit = EXCLUDED.slot_limit,
  slot_lookahead_days = EXCLUDED.slot_lookahead_days,
  slot_config = EXCLUDED.slot_config,
  metadata = EXCLUDED.metadata,
  updated_at = now();