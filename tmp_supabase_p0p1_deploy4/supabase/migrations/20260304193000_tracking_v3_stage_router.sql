-- PR4: tracking v3 stage-change router
-- Trigger v2 on leads.status_pipeline -> conversion_events + conversion_deliveries

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

  v_payload := jsonb_build_object(
    'crm_stage_raw', NEW.status_pipeline,
    'previous_stage_raw', OLD.status_pipeline,
    'event_key', v_event_name
  );

  INSERT INTO public.conversion_events (
    org_id,
    lead_id,
    crm_stage,
    previous_stage,
    event_name,
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
    v_idempotency_key,
    now(),
    v_payload
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_conversion_event_id;

  IF v_conversion_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_settings.meta_capi_enabled, false) THEN
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

  IF COALESCE(v_settings.google_ads_enabled, false) THEN
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

  IF COALESCE(v_settings.ga4_enabled, false) THEN
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

DROP TRIGGER IF EXISTS tr_lead_stage_change_v2 ON public.leads;
CREATE TRIGGER tr_lead_stage_change_v2
  AFTER UPDATE OF status_pipeline ON public.leads
  FOR EACH ROW
  WHEN (OLD.status_pipeline IS DISTINCT FROM NEW.status_pipeline)
  EXECUTE FUNCTION public.tr_lead_stage_change_v2();

