-- Tracking v3 foundation schema (PR1)
-- Tables:
-- 1) lead_attribution
-- 2) attribution_touchpoints
-- 3) conversion_events
-- 4) conversion_deliveries
-- 5) ad_platform_credentials
-- 6) org_tracking_settings
-- 7) ad_trigger_messages

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION public.tracking_default_stage_event_map()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    '{
      "novo_lead": {"event_key":"novo_lead","meta":"Lead","google_ads":null,"ga4":"generate_lead"},
      "chamada_agendada": {"event_key":"chamada_agendada","meta":"Schedule","google_ads":"schedule","ga4":"schedule_appointment"},
      "proposta_pronta": {"event_key":"proposta_pronta","meta":"SubmitApplication","google_ads":"proposal_sent","ga4":"proposal_ready"},
      "financiamento": {"event_key":"financiamento","meta":"InitiateCheckout","google_ads":"financing","ga4":"begin_checkout"},
      "aprovou_projeto": {"event_key":"aprovou_projeto","meta":"CompleteRegistration","google_ads":"qualified_lead","ga4":"project_approved"},
      "contrato_assinado": {"event_key":"contrato_assinado","meta":"Purchase","google_ads":"purchase","ga4":"purchase"},
      "projeto_pago": {"event_key":"projeto_pago","meta":"Purchase","google_ads":"purchase","ga4":"purchase"}
    }'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.tracking_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tracking_normalize_crm_stage(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(
      regexp_replace(
        regexp_replace(
          lower(
            translate(
              coalesce(p_raw, ''),
              'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
              'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
            )
          ),
          '[^a-z0-9]+',
          '_',
          'g'
        ),
        '^_+|_+$',
        '',
        'g'
      ),
      ''
    ),
    'unknown'
  );
$$;

CREATE OR REPLACE FUNCTION public.tracking_generate_public_org_key()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'szap_' || replace(gen_random_uuid()::text, '-', '');
$$;

CREATE TABLE IF NOT EXISTS public.ad_trigger_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_text text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains'
    CHECK (match_type IN ('exact', 'contains', 'starts_with', 'regex')),
  platform text,
  inferred_channel text NOT NULL,
  campaign_name text,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_trigger_messages_org_priority
  ON public.ad_trigger_messages (org_id, is_active, priority, created_at DESC);

DROP TRIGGER IF EXISTS tr_ad_trigger_messages_updated_at ON public.ad_trigger_messages;
CREATE TRIGGER tr_ad_trigger_messages_updated_at
  BEFORE UPDATE ON public.ad_trigger_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tracking_set_updated_at();

CREATE TABLE IF NOT EXISTS public.org_tracking_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  tracking_enabled boolean NOT NULL DEFAULT false,
  meta_capi_enabled boolean NOT NULL DEFAULT false,
  google_ads_enabled boolean NOT NULL DEFAULT false,
  ga4_enabled boolean NOT NULL DEFAULT false,
  auto_channel_attribution boolean NOT NULL DEFAULT true,
  force_channel_overwrite boolean NOT NULL DEFAULT false,
  google_validate_only boolean NOT NULL DEFAULT false,
  recaptcha_enabled boolean NOT NULL DEFAULT false,
  recaptcha_secret_vault_id uuid,
  stage_event_map jsonb NOT NULL DEFAULT public.tracking_default_stage_event_map(),
  rate_limit_per_minute integer NOT NULL DEFAULT 60 CHECK (rate_limit_per_minute BETWEEN 1 AND 10000),
  webhook_public_key text UNIQUE,
  blocklist_ips jsonb NOT NULL DEFAULT '[]'::jsonb,
  blocklist_phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  webhook_rate_window_started_at timestamptz NOT NULL DEFAULT now(),
  webhook_rate_window_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_tracking_settings_stage_event_map_object_chk CHECK (jsonb_typeof(stage_event_map) = 'object'),
  CONSTRAINT org_tracking_settings_blocklist_ips_array_chk CHECK (jsonb_typeof(blocklist_ips) = 'array'),
  CONSTRAINT org_tracking_settings_blocklist_phones_array_chk CHECK (jsonb_typeof(blocklist_phones) = 'array')
);

DROP TRIGGER IF EXISTS tr_org_tracking_settings_updated_at ON public.org_tracking_settings;
CREATE TRIGGER tr_org_tracking_settings_updated_at
  BEFORE UPDATE ON public.org_tracking_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.tracking_set_updated_at();

CREATE TABLE IF NOT EXISTS public.ad_platform_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google_ads', 'ga4')),
  enabled boolean NOT NULL DEFAULT false,
  -- Meta
  meta_pixel_id text,
  meta_access_token_vault_id uuid,
  meta_test_event_code text,
  -- Google Ads
  google_mcc_id text,
  google_customer_id text,
  google_conversion_action_id text,
  google_client_id text,
  google_client_secret_vault_id uuid,
  google_refresh_token_vault_id uuid,
  google_developer_token_vault_id uuid,
  -- GA4
  ga4_measurement_id text,
  ga4_api_secret_vault_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ad_platform_credentials_org_platform UNIQUE (org_id, platform),
  CONSTRAINT ad_platform_credentials_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object')
);

DROP TRIGGER IF EXISTS tr_ad_platform_credentials_updated_at ON public.ad_platform_credentials;
CREATE TRIGGER tr_ad_platform_credentials_updated_at
  BEFORE UPDATE ON public.ad_platform_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.tracking_set_updated_at();

CREATE TABLE IF NOT EXISTS public.lead_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- First touch
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  raw_querystring text,
  gclid text,
  gbraid text,
  wbraid text,
  fbclid text,
  fbc text,
  fbp text,
  ttclid text,
  msclkid text,
  -- Last touch
  last_utm_source text,
  last_utm_medium text,
  last_utm_campaign text,
  last_utm_content text,
  last_utm_term text,
  last_gclid text,
  last_gbraid text,
  last_wbraid text,
  last_fbclid text,
  last_ttclid text,
  last_msclkid text,
  -- CTWA
  ctwa_source_url text,
  ctwa_source_type text,
  ctwa_source_id text,
  ctwa_headline text,
  ctwa_body text,
  ctwa_clid text,
  -- Trigger message
  trigger_message_matched text,
  trigger_message_rule_id uuid REFERENCES public.ad_trigger_messages(id) ON DELETE SET NULL,
  -- Channel
  inferred_channel text,
  attribution_method text,
  channel_is_inferred boolean NOT NULL DEFAULT false,
  -- User data (hashed)
  user_email_sha256 text,
  user_phone_sha256 text,
  user_ip text,
  user_agent text,
  session_id text,
  landing_page_url text,
  referrer_url text,
  first_touch_at timestamptz NOT NULL DEFAULT now(),
  last_touch_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_lead_attribution UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_org_lead
  ON public.lead_attribution (org_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_click_ids
  ON public.lead_attribution (org_id, gclid, gbraid, wbraid, fbclid);

DROP TRIGGER IF EXISTS tr_lead_attribution_updated_at ON public.lead_attribution;
CREATE TRIGGER tr_lead_attribution_updated_at
  BEFORE UPDATE ON public.lead_attribution
  FOR EACH ROW
  EXECUTE FUNCTION public.tracking_set_updated_at();

CREATE TABLE IF NOT EXISTS public.attribution_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  attribution_id uuid NOT NULL REFERENCES public.lead_attribution(id) ON DELETE CASCADE,
  touch_type text NOT NULL CHECK (touch_type IN ('first', 'last', 'assist')),
  channel text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  gclid text,
  gbraid text,
  wbraid text,
  fbclid text,
  fbc text,
  fbp text,
  ttclid text,
  msclkid text,
  ctwa_source_id text,
  landing_page_url text,
  referrer_url text,
  raw_querystring text,
  session_id text,
  touchpoint_fingerprint text NOT NULL,
  touched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_touchpoint_fp UNIQUE (lead_id, touchpoint_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_attribution_touchpoints_org_lead_touched
  ON public.attribution_touchpoints (org_id, lead_id, touched_at DESC);

CREATE TABLE IF NOT EXISTS public.conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  crm_stage text NOT NULL,
  previous_stage text,
  event_name text NOT NULL,
  event_value numeric,
  event_currency text NOT NULL DEFAULT 'BRL',
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversion_idemp UNIQUE (idempotency_key),
  CONSTRAINT conversion_events_payload_object_chk CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_org_occurred_at
  ON public.conversion_events (org_id, occurred_at DESC);

DROP TRIGGER IF EXISTS tr_conversion_events_updated_at ON public.conversion_events;
CREATE TRIGGER tr_conversion_events_updated_at
  BEFORE UPDATE ON public.conversion_events
  FOR EACH ROW
  EXECUTE FUNCTION public.tracking_set_updated_at();

CREATE TABLE IF NOT EXISTS public.conversion_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_event_id uuid NOT NULL REFERENCES public.conversion_events(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('meta', 'google_ads', 'ga4')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped', 'disabled')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz,
  platform_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_delivery UNIQUE (conversion_event_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_conversion_deliveries_org_status
  ON public.conversion_deliveries (org_id, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_deliveries_pending
  ON public.conversion_deliveries (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_deliveries_processing
  ON public.conversion_deliveries (status, updated_at)
  WHERE status = 'processing';

DROP TRIGGER IF EXISTS tr_conversion_deliveries_updated_at ON public.conversion_deliveries;
CREATE TRIGGER tr_conversion_deliveries_updated_at
  BEFORE UPDATE ON public.conversion_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.tracking_set_updated_at();

INSERT INTO public.org_tracking_settings (
  org_id,
  tracking_enabled,
  meta_capi_enabled,
  google_ads_enabled,
  ga4_enabled,
  auto_channel_attribution,
  force_channel_overwrite,
  google_validate_only,
  recaptcha_enabled,
  stage_event_map,
  rate_limit_per_minute
)
SELECT
  o.id,
  false,
  false,
  false,
  false,
  true,
  false,
  false,
  false,
  public.tracking_default_stage_event_map(),
  60
FROM public.organizations o
ON CONFLICT (org_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tracking_seed_org_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.org_tracking_settings (
    org_id,
    tracking_enabled,
    meta_capi_enabled,
    google_ads_enabled,
    ga4_enabled,
    auto_channel_attribution,
    force_channel_overwrite,
    google_validate_only,
    recaptcha_enabled,
    stage_event_map,
    rate_limit_per_minute
  )
  VALUES (
    NEW.id,
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    public.tracking_default_stage_event_map(),
    60
  )
  ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_tracking_seed_org_settings ON public.organizations;
CREATE TRIGGER tr_tracking_seed_org_settings
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.tracking_seed_org_settings();

CREATE OR REPLACE FUNCTION public.tracking_consume_webhook_rate_limit(p_org_id uuid)
RETURNS TABLE (
  allowed boolean,
  remaining integer,
  limit_per_minute integer,
  current_count integer,
  window_started_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_limit integer := 60;
  v_count integer := 0;
  v_window_started_at timestamptz := now();
BEGIN
  IF p_org_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 0, v_now;
    RETURN;
  END IF;

  INSERT INTO public.org_tracking_settings (org_id)
  VALUES (p_org_id)
  ON CONFLICT (org_id) DO NOTHING;

  SELECT
    GREATEST(1, COALESCE(rate_limit_per_minute, 60)),
    COALESCE(webhook_rate_window_count, 0),
    COALESCE(webhook_rate_window_started_at, v_now)
  INTO
    v_limit,
    v_count,
    v_window_started_at
  FROM public.org_tracking_settings
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF v_window_started_at <= v_now - INTERVAL '1 minute' THEN
    v_window_started_at := v_now;
    v_count := 0;
  END IF;

  IF v_count >= v_limit THEN
    UPDATE public.org_tracking_settings
    SET
      webhook_rate_window_started_at = v_window_started_at,
      webhook_rate_window_count = v_count,
      updated_at = now()
    WHERE org_id = p_org_id;

    RETURN QUERY SELECT false, 0, v_limit, v_count, v_window_started_at;
    RETURN;
  END IF;

  v_count := v_count + 1;

  UPDATE public.org_tracking_settings
  SET
    webhook_rate_window_started_at = v_window_started_at,
    webhook_rate_window_count = v_count,
    updated_at = now()
  WHERE org_id = p_org_id;

  RETURN QUERY SELECT true, GREATEST(v_limit - v_count, 0), v_limit, v_count, v_window_started_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tracking_generate_public_org_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_generate_public_org_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.tracking_consume_webhook_rate_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_consume_webhook_rate_limit(uuid) TO service_role;

ALTER TABLE public.lead_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_platform_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_tracking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_trigger_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_lead_attribution_service_all ON public.lead_attribution;
CREATE POLICY tracking_lead_attribution_service_all ON public.lead_attribution
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_lead_attribution_auth_select ON public.lead_attribution;
CREATE POLICY tracking_lead_attribution_auth_select ON public.lead_attribution
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_lead_attribution_auth_insert ON public.lead_attribution;
CREATE POLICY tracking_lead_attribution_auth_insert ON public.lead_attribution
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_lead_attribution_auth_update ON public.lead_attribution;
CREATE POLICY tracking_lead_attribution_auth_update ON public.lead_attribution
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_lead_attribution_auth_delete ON public.lead_attribution;
CREATE POLICY tracking_lead_attribution_auth_delete ON public.lead_attribution
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_touchpoints_service_all ON public.attribution_touchpoints;
CREATE POLICY tracking_touchpoints_service_all ON public.attribution_touchpoints
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_touchpoints_auth_select ON public.attribution_touchpoints;
CREATE POLICY tracking_touchpoints_auth_select ON public.attribution_touchpoints
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_touchpoints_auth_insert ON public.attribution_touchpoints;
CREATE POLICY tracking_touchpoints_auth_insert ON public.attribution_touchpoints
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_touchpoints_auth_update ON public.attribution_touchpoints;
CREATE POLICY tracking_touchpoints_auth_update ON public.attribution_touchpoints
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_touchpoints_auth_delete ON public.attribution_touchpoints;
CREATE POLICY tracking_touchpoints_auth_delete ON public.attribution_touchpoints
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_conversion_events_service_all ON public.conversion_events;
CREATE POLICY tracking_conversion_events_service_all ON public.conversion_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_conversion_events_auth_select ON public.conversion_events;
CREATE POLICY tracking_conversion_events_auth_select ON public.conversion_events
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_conversion_events_auth_insert ON public.conversion_events;
CREATE POLICY tracking_conversion_events_auth_insert ON public.conversion_events
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_conversion_events_auth_update ON public.conversion_events;
CREATE POLICY tracking_conversion_events_auth_update ON public.conversion_events
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_conversion_events_auth_delete ON public.conversion_events;
CREATE POLICY tracking_conversion_events_auth_delete ON public.conversion_events
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_conversion_deliveries_service_all ON public.conversion_deliveries;
CREATE POLICY tracking_conversion_deliveries_service_all ON public.conversion_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_conversion_deliveries_auth_select ON public.conversion_deliveries;
CREATE POLICY tracking_conversion_deliveries_auth_select ON public.conversion_deliveries
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_conversion_deliveries_auth_insert ON public.conversion_deliveries;
CREATE POLICY tracking_conversion_deliveries_auth_insert ON public.conversion_deliveries
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_conversion_deliveries_auth_update ON public.conversion_deliveries;
CREATE POLICY tracking_conversion_deliveries_auth_update ON public.conversion_deliveries
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_conversion_deliveries_auth_delete ON public.conversion_deliveries;
CREATE POLICY tracking_conversion_deliveries_auth_delete ON public.conversion_deliveries
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_ad_platform_credentials_service_all ON public.ad_platform_credentials;
CREATE POLICY tracking_ad_platform_credentials_service_all ON public.ad_platform_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_ad_platform_credentials_auth_select ON public.ad_platform_credentials;
CREATE POLICY tracking_ad_platform_credentials_auth_select ON public.ad_platform_credentials
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_ad_platform_credentials_auth_insert ON public.ad_platform_credentials;
CREATE POLICY tracking_ad_platform_credentials_auth_insert ON public.ad_platform_credentials
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_ad_platform_credentials_auth_update ON public.ad_platform_credentials;
CREATE POLICY tracking_ad_platform_credentials_auth_update ON public.ad_platform_credentials
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_ad_platform_credentials_auth_delete ON public.ad_platform_credentials;
CREATE POLICY tracking_ad_platform_credentials_auth_delete ON public.ad_platform_credentials
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_org_tracking_settings_service_all ON public.org_tracking_settings;
CREATE POLICY tracking_org_tracking_settings_service_all ON public.org_tracking_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_org_tracking_settings_auth_select ON public.org_tracking_settings;
CREATE POLICY tracking_org_tracking_settings_auth_select ON public.org_tracking_settings
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_org_tracking_settings_auth_insert ON public.org_tracking_settings;
CREATE POLICY tracking_org_tracking_settings_auth_insert ON public.org_tracking_settings
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_org_tracking_settings_auth_update ON public.org_tracking_settings;
CREATE POLICY tracking_org_tracking_settings_auth_update ON public.org_tracking_settings
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_org_tracking_settings_auth_delete ON public.org_tracking_settings;
CREATE POLICY tracking_org_tracking_settings_auth_delete ON public.org_tracking_settings
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_ad_trigger_messages_service_all ON public.ad_trigger_messages;
CREATE POLICY tracking_ad_trigger_messages_service_all ON public.ad_trigger_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_ad_trigger_messages_auth_select ON public.ad_trigger_messages;
CREATE POLICY tracking_ad_trigger_messages_auth_select ON public.ad_trigger_messages
  FOR SELECT TO authenticated USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_ad_trigger_messages_auth_insert ON public.ad_trigger_messages;
CREATE POLICY tracking_ad_trigger_messages_auth_insert ON public.ad_trigger_messages
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_ad_trigger_messages_auth_update ON public.ad_trigger_messages;
CREATE POLICY tracking_ad_trigger_messages_auth_update ON public.ad_trigger_messages
  FOR UPDATE TO authenticated
  USING (public.user_belongs_to_org(org_id))
  WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS tracking_ad_trigger_messages_auth_delete ON public.ad_trigger_messages;
CREATE POLICY tracking_ad_trigger_messages_auth_delete ON public.ad_trigger_messages
  FOR DELETE TO authenticated USING (public.user_belongs_to_org(org_id));
