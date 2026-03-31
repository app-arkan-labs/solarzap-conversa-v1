-- Tracking update:
-- 1) Event map to support Lead (novo_lead), Programar/Schedule (agendou_reuniao), Comprar/Purchase (fechou)
-- 2) Purchase value enrichment from internal_crm.deals via tracking bridge
-- 3) Shared meta_event_id support for browser + CAPI dedup

CREATE OR REPLACE FUNCTION public.tracking_default_stage_event_map()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    '{
      "novo_lead": {"event_key":"novo_lead","meta":"Lead","google_ads":null,"ga4":"generate_lead"},
      "agendou_reuniao": {"event_key":"agendou_reuniao","meta":"Schedule","google_ads":"schedule","ga4":"schedule_appointment"},
      "chamada_agendada": {"event_key":"chamada_agendada","meta":null,"google_ads":null,"ga4":null},
      "chamada_realizada": {"event_key":"chamada_realizada","meta":null,"google_ads":null,"ga4":null},
      "visita_realizada": {"event_key":"visita_realizada","meta":"SubmitApplication","google_ads":"proposal_sent","ga4":"proposal_ready"},
      "proposta_pronta": {"event_key":"proposta_pronta","meta":null,"google_ads":null,"ga4":null},
      "financiamento": {"event_key":"financiamento","meta":"InitiateCheckout","google_ads":"financing","ga4":"begin_checkout"},
      "aprovou_projeto": {"event_key":"aprovou_projeto","meta":"CompleteRegistration","google_ads":"qualified_lead","ga4":"project_approved"},
      "contrato_assinado": {"event_key":"contrato_assinado","meta":null,"google_ads":null,"ga4":null},
      "fechou": {"event_key":"fechou","meta":"Purchase","google_ads":"purchase","ga4":"purchase"},
      "projeto_pago": {"event_key":"projeto_pago","meta":null,"google_ads":null,"ga4":null}
    }'::jsonb;
$$;

UPDATE public.org_tracking_settings
SET stage_event_map = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(stage_event_map, '{}'::jsonb),
            '{novo_lead}',
            '{"event_key":"novo_lead","meta":"Lead","google_ads":null,"ga4":"generate_lead"}'::jsonb,
            true
          ),
          '{agendou_reuniao}',
          '{"event_key":"agendou_reuniao","meta":"Schedule","google_ads":"schedule","ga4":"schedule_appointment"}'::jsonb,
          true
        ),
        '{chamada_realizada}',
        '{"event_key":"chamada_realizada","meta":null,"google_ads":null,"ga4":null}'::jsonb,
        true
      ),
      '{chamada_agendada}',
      '{"event_key":"chamada_agendada","meta":null,"google_ads":null,"ga4":null}'::jsonb,
      true
    ),
    '{fechou}',
    '{"event_key":"fechou","meta":"Purchase","google_ads":"purchase","ga4":"purchase"}'::jsonb,
    true
  ),
  '{projeto_pago}',
  '{"event_key":"projeto_pago","meta":null,"google_ads":null,"ga4":null}'::jsonb,
  true
)
WHERE true;

CREATE OR REPLACE FUNCTION public.tr_lead_stage_change_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.org_tracking_settings%ROWTYPE;
  v_crm_stage text;
  v_previous_stage text;
  v_stage_event jsonb;
  v_event_name text;
  v_idempotency_key text;
  v_conversion_event_id uuid;
  v_payload jsonb;
  v_has_stage_mapping boolean := false;
  v_meta_event_name text;
  v_google_event_name text;
  v_ga4_event_name text;
  v_lead_session_id text;
  v_bridge_deal_id uuid;
  v_bridge_product_code text;
  v_bridge_deal_value_cents integer;
  v_meta_event_id text;
  v_event_value numeric;
  v_event_currency text := 'BRL';
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status_pipeline IS NOT DISTINCT FROM NEW.status_pipeline THEN
    RETURN NEW;
  END IF;

  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_settings
  FROM public.org_tracking_settings
  WHERE org_id = NEW.org_id;

  IF COALESCE(v_settings.tracking_enabled, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_crm_stage := public.tracking_normalize_crm_stage(NEW.status_pipeline);
  v_previous_stage := public.tracking_normalize_crm_stage(OLD.status_pipeline);
  v_stage_event := COALESCE(v_settings.stage_event_map, public.tracking_default_stage_event_map()) -> v_crm_stage;
  v_event_name := COALESCE(NULLIF(trim(v_stage_event ->> 'event_key'), ''), v_crm_stage);
  v_has_stage_mapping := jsonb_typeof(COALESCE(v_settings.stage_event_map, '{}'::jsonb)) = 'object'
    AND (COALESCE(v_settings.stage_event_map, '{}'::jsonb) ? v_crm_stage);
  v_meta_event_name := NULLIF(trim(v_stage_event ->> 'meta'), '');
  v_google_event_name := NULLIF(trim(v_stage_event ->> 'google_ads'), '');
  v_ga4_event_name := NULLIF(trim(v_stage_event ->> 'ga4'), '');

  SELECT la.session_id
  INTO v_lead_session_id
  FROM public.lead_attribution la
  WHERE la.org_id = NEW.org_id
    AND la.lead_id = NEW.id
  ORDER BY la.updated_at DESC NULLS LAST, la.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT
    tb.internal_deal_id,
    COALESCE(d.closed_product_code, d.primary_offer_code),
    d.one_time_total_cents
  INTO
    v_bridge_deal_id,
    v_bridge_product_code,
    v_bridge_deal_value_cents
  FROM internal_crm.tracking_bridge tb
  LEFT JOIN internal_crm.deals d ON d.id = tb.internal_deal_id
  WHERE tb.org_id = NEW.org_id
    AND tb.public_lead_id = NEW.id
  ORDER BY tb.last_synced_at DESC NULLS LAST, tb.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_bridge_deal_value_cents IS NOT NULL
     AND v_bridge_deal_value_cents > 0
     AND (v_crm_stage = 'fechou' OR v_meta_event_name = 'Purchase') THEN
    v_event_value := (v_bridge_deal_value_cents::numeric / 100.0);
  ELSE
    v_event_value := NULL;
  END IF;

  IF v_meta_event_name = 'Lead' AND v_lead_session_id IS NOT NULL THEN
    v_meta_event_id := 'lp_' || v_lead_session_id || '_lead';
  ELSIF v_meta_event_name = 'Schedule' AND v_lead_session_id IS NOT NULL THEN
    v_meta_event_id := 'lp_' || v_lead_session_id || '_schedule';
  ELSIF v_meta_event_name = 'Purchase' AND v_bridge_deal_id IS NOT NULL THEN
    v_meta_event_id := 'crm_' || v_bridge_deal_id::text || '_purchase';
  ELSE
    v_meta_event_id := NULL;
  END IF;

  v_idempotency_key := encode(
    digest(
      COALESCE(NEW.org_id::text, '')
      || ':' || NEW.id::text
      || ':' || v_crm_stage
      || ':' || v_event_name,
      'sha256'
    ),
    'hex'
  );

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'crm_stage_raw', NEW.status_pipeline,
    'previous_stage_raw', OLD.status_pipeline,
    'event_key', v_event_name,
    'meta_event_id', v_meta_event_id,
    'closed_product_code', v_bridge_product_code
  ));

  INSERT INTO public.conversion_events (
    org_id,
    lead_id,
    crm_stage,
    previous_stage,
    event_name,
    event_value,
    event_currency,
    idempotency_key,
    occurred_at,
    payload
  )
  VALUES (
    NEW.org_id,
    NEW.id,
    v_crm_stage,
    v_previous_stage,
    v_event_name,
    v_event_value,
    v_event_currency,
    v_idempotency_key,
    now(),
    v_payload
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_conversion_event_id;

  IF v_conversion_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_settings.meta_capi_enabled, false)
    AND (NOT v_has_stage_mapping OR v_meta_event_name IS NOT NULL) THEN
    INSERT INTO public.conversion_deliveries (
      conversion_event_id,
      org_id,
      platform,
      status,
      next_attempt_at
    )
    VALUES (
      v_conversion_event_id,
      NEW.org_id,
      'meta',
      'pending',
      now()
    )
    ON CONFLICT (conversion_event_id, platform) DO NOTHING;
  END IF;

  IF COALESCE(v_settings.google_ads_enabled, false)
    AND (NOT v_has_stage_mapping OR v_google_event_name IS NOT NULL) THEN
    INSERT INTO public.conversion_deliveries (
      conversion_event_id,
      org_id,
      platform,
      status,
      next_attempt_at
    )
    VALUES (
      v_conversion_event_id,
      NEW.org_id,
      'google_ads',
      'pending',
      now()
    )
    ON CONFLICT (conversion_event_id, platform) DO NOTHING;
  END IF;

  IF COALESCE(v_settings.ga4_enabled, false)
    AND (NOT v_has_stage_mapping OR v_ga4_event_name IS NOT NULL) THEN
    INSERT INTO public.conversion_deliveries (
      conversion_event_id,
      org_id,
      platform,
      status,
      next_attempt_at
    )
    VALUES (
      v_conversion_event_id,
      NEW.org_id,
      'ga4',
      'pending',
      now()
    )
    ON CONFLICT (conversion_event_id, platform) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
