-- Repair/complete notification event producers in environments where only schema hotfix ran.
-- Ensures enqueue/claim RPCs + lead/appointment triggers exist.

CREATE OR REPLACE FUNCTION public.enqueue_notification_event(
  p_org_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_dedupe_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_org_id IS NULL OR p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notification_events (
    org_id,
    event_type,
    entity_type,
    entity_id,
    payload,
    status,
    attempts,
    next_attempt_at,
    dedupe_key
  )
  VALUES (
    p_org_id,
    trim(p_event_type),
    NULLIF(trim(coalesce(p_entity_type, '')), ''),
    NULLIF(trim(coalesce(p_entity_id, '')), ''),
    COALESCE(p_payload, '{}'::jsonb),
    'pending',
    0,
    now(),
    NULLIF(trim(coalesce(p_dedupe_key, '')), '')
  )
  ON CONFLICT (org_id, dedupe_key) WHERE dedupe_key IS NOT NULL
  DO UPDATE
    SET payload = EXCLUDED.payload,
        status = 'pending',
        next_attempt_at = LEAST(public.notification_events.next_attempt_at, now()),
        updated_at = now(),
        last_error = NULL,
        locked_at = NULL,
        processed_at = NULL
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_notification_events(p_batch_size integer DEFAULT 50)
RETURNS SETOF public.notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.notification_events%ROWTYPE;
BEGIN
  FOR r IN
    WITH candidates AS (
      SELECT e.id
      FROM public.notification_events e
      WHERE e.status = 'pending'
        AND coalesce(e.next_attempt_at, now()) <= now()
      ORDER BY e.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size, 50), 200))
    )
    UPDATE public.notification_events e
      SET status = 'processing',
          locked_at = now(),
          attempts = COALESCE(e.attempts, 0) + 1,
          updated_at = now()
    FROM candidates c
    WHERE e.id = c.id
    RETURNING e.*
  LOOP
    RETURN NEXT r;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_notification_event(uuid, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_event(uuid, text, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notification_events(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_notification_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_notification_event(
    NEW.org_id,
    'novo_lead',
    'lead',
    NEW.id::text,
    jsonb_build_object(
      'lead_id', NEW.id,
      'nome', NEW.nome,
      'telefone', NEW.telefone,
      'status_pipeline', NEW.status_pipeline,
      'created_at', NEW.created_at
    ),
    'lead:new:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notification_lead_stage_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_stage text;
  v_to_stage text;
  v_stage_dedupe text;
  v_finance_dedupe text;
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_from_stage := lower(coalesce(OLD.status_pipeline, ''));
  v_to_stage := lower(coalesce(NEW.status_pipeline, ''));

  IF v_to_stage IS DISTINCT FROM v_from_stage THEN
    v_stage_dedupe := 'lead:stage_changed:' || NEW.id::text || ':' || v_to_stage || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');

    PERFORM public.enqueue_notification_event(
      NEW.org_id,
      'stage_changed',
      'lead',
      NEW.id::text,
      jsonb_build_object(
        'lead_id', NEW.id,
        'nome', NEW.nome,
        'from_stage', OLD.status_pipeline,
        'to_stage', NEW.status_pipeline,
        'updated_at', now()
      ),
      v_stage_dedupe
    );

    IF v_to_stage = 'financiamento' THEN
      v_finance_dedupe := 'lead:financiamento:' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');

      PERFORM public.enqueue_notification_event(
        NEW.org_id,
        'financiamento_update',
        'lead',
        NEW.id::text,
        jsonb_build_object(
          'lead_id', NEW.id,
          'nome', NEW.nome,
          'from_stage', OLD.status_pipeline,
          'to_stage', NEW.status_pipeline,
          'updated_at', now()
        ),
        v_finance_dedupe
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_notification_appointment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_type text;
  v_status text;
  v_dedupe text;
BEGIN
  v_type := lower(coalesce(NEW.type, ''));
  v_status := lower(coalesce(NEW.status, ''));

  IF v_type IN ('visita', 'visit') THEN
    IF TG_OP = 'INSERT' AND v_status = 'scheduled' THEN
      v_event_type := 'visita_agendada';
      v_dedupe := 'appt:visita_agendada:' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND v_status IN ('done', 'completed') THEN
      v_event_type := 'visita_realizada';
      v_dedupe := 'appt:visita_realizada:' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    END IF;
  ELSIF v_type IN ('chamada', 'call', 'meeting', 'reuniao') THEN
    IF TG_OP = 'INSERT' AND v_status = 'scheduled' THEN
      v_event_type := 'chamada_agendada';
      v_dedupe := 'appt:chamada_agendada:' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND v_status IN ('done', 'completed') THEN
      v_event_type := 'chamada_realizada';
      v_dedupe := 'appt:chamada_realizada:' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    END IF;
  END IF;

  IF v_event_type IS NOT NULL THEN
    PERFORM public.enqueue_notification_event(
      NEW.org_id,
      v_event_type,
      'appointment',
      NEW.id::text,
      jsonb_build_object(
        'appointment_id', NEW.id,
        'lead_id', NEW.lead_id,
        'title', NEW.title,
        'type', NEW.type,
        'status', NEW.status,
        'start_at', NEW.start_at,
        'end_at', NEW.end_at,
        'location', NEW.location,
        'notes', NEW.notes
      ),
      v_dedupe
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notification_new_lead ON public.leads;
CREATE TRIGGER tr_notification_new_lead
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trg_notification_new_lead();

DROP TRIGGER IF EXISTS tr_notification_lead_stage_update ON public.leads;
CREATE TRIGGER tr_notification_lead_stage_update
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trg_notification_lead_stage_update();

DROP TRIGGER IF EXISTS tr_notification_appointment_events ON public.appointments;
CREATE TRIGGER tr_notification_appointment_events
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.trg_notification_appointment_events();
