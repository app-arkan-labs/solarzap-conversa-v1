-- Notifications + Visits Outcome + Proposals RPC + Digest audit foundation

CREATE TABLE IF NOT EXISTS public.notification_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled_notifications boolean NOT NULL DEFAULT false,
  enabled_whatsapp boolean NOT NULL DEFAULT false,
  enabled_email boolean NOT NULL DEFAULT false,
  enabled_reminders boolean NOT NULL DEFAULT true,
  whatsapp_instance_name text,
  email_recipients text[] NOT NULL DEFAULT '{}'::text[],
  daily_digest_enabled boolean NOT NULL DEFAULT false,
  weekly_digest_enabled boolean NOT NULL DEFAULT false,
  daily_digest_time time NOT NULL DEFAULT time '19:00',
  weekly_digest_time time NOT NULL DEFAULT time '18:00',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.notification_settings (org_id)
SELECT o.id
FROM public.organizations o
ON CONFLICT (org_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'canceled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  locked_at timestamptz,
  processed_at timestamptz,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_event_id uuid REFERENCES public.notification_events(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  destination text,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  response_payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  digest_type text NOT NULL CHECK (digest_type IN ('daily', 'weekly')),
  date_bucket date NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'sent', 'failed', 'skipped')),
  channel_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_text text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_org_status_next
  ON public.notification_events (org_id, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_notification_events_pending
  ON public.notification_events (status, next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notification_events_created_at
  ON public.notification_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_org_created
  ON public.notification_dispatch_logs (org_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_org_dedupe
  ON public.notification_events (org_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_digest_runs_org_type_bucket
  ON public.ai_digest_runs (org_id, digest_type, date_bucket);

ALTER TABLE IF EXISTS public.comentarios_leads
  ADD COLUMN IF NOT EXISTS comment_type text;

ALTER TABLE IF EXISTS public.comentarios_leads
  ADD COLUMN IF NOT EXISTS date_bucket date;

CREATE INDEX IF NOT EXISTS idx_comentarios_leads_comment_type
  ON public.comentarios_leads (comment_type);

CREATE INDEX IF NOT EXISTS idx_comentarios_leads_date_bucket
  ON public.comentarios_leads (date_bucket);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comentarios_ai_daily_summary_dedupe
  ON public.comentarios_leads (org_id, lead_id, comment_type, date_bucket)
  WHERE comment_type = 'ai_daily_summary' AND date_bucket IS NOT NULL;

ALTER TABLE IF EXISTS public.appointments
  ADD COLUMN IF NOT EXISTS outcome_notes text;

ALTER TABLE IF EXISTS public.appointments
  ADD COLUMN IF NOT EXISTS outcome_stage text;

ALTER TABLE IF EXISTS public.appointments
  ADD COLUMN IF NOT EXISTS outcome_recorded_at timestamptz;

ALTER TABLE IF EXISTS public.appointments
  ADD COLUMN IF NOT EXISTS outcome_actor_user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_appointments_visit_outcome_due
  ON public.appointments (org_id, start_at)
  WHERE status = 'scheduled'
    AND outcome IS NULL
    AND lower(coalesce(type, '')) IN ('visita', 'visit');

CREATE OR REPLACE FUNCTION public.notification_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER tr_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.notification_set_updated_at();

DROP TRIGGER IF EXISTS tr_notification_events_updated_at ON public.notification_events;
CREATE TRIGGER tr_notification_events_updated_at
BEFORE UPDATE ON public.notification_events
FOR EACH ROW
EXECUTE FUNCTION public.notification_set_updated_at();

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_digest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_service_all ON public.notification_settings;
DROP POLICY IF EXISTS notifications_service_all ON public.notification_events;
DROP POLICY IF EXISTS notifications_service_all ON public.notification_dispatch_logs;
DROP POLICY IF EXISTS notifications_service_all ON public.ai_digest_runs;

CREATE POLICY notifications_service_all ON public.notification_settings
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY notifications_service_all ON public.notification_events
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY notifications_service_all ON public.notification_dispatch_logs
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY notifications_service_all ON public.ai_digest_runs
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS notification_settings_auth_select ON public.notification_settings;
DROP POLICY IF EXISTS notification_settings_auth_insert ON public.notification_settings;
DROP POLICY IF EXISTS notification_settings_auth_update ON public.notification_settings;

CREATE POLICY notification_settings_auth_select ON public.notification_settings
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

CREATE POLICY notification_settings_auth_insert ON public.notification_settings
FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

CREATE POLICY notification_settings_auth_update ON public.notification_settings
FOR UPDATE TO authenticated
USING (public.user_belongs_to_org(org_id))
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS notification_events_auth_select ON public.notification_events;
CREATE POLICY notification_events_auth_select ON public.notification_events
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS notification_logs_auth_select ON public.notification_dispatch_logs;
CREATE POLICY notification_logs_auth_select ON public.notification_dispatch_logs
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS ai_digest_runs_auth_select ON public.ai_digest_runs;
CREATE POLICY ai_digest_runs_auth_select ON public.ai_digest_runs
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

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
BEGIN
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status_pipeline IS DISTINCT FROM OLD.status_pipeline
     AND lower(coalesce(NEW.status_pipeline, '')) = 'financiamento' THEN
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
      'lead:financiamento:' || NEW.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI')
    );
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

CREATE OR REPLACE FUNCTION public.visits_needing_outcome(
  p_org_id uuid,
  p_user_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  appointment_id uuid,
  lead_id bigint,
  lead_name text,
  lead_stage text,
  start_at timestamptz,
  end_at timestamptz,
  title text,
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: User does not belong to organization';
  END IF;

  RETURN QUERY
  SELECT
    a.id AS appointment_id,
    a.lead_id,
    l.nome AS lead_name,
    l.status_pipeline AS lead_stage,
    a.start_at,
    a.end_at,
    a.title,
    a.notes
  FROM public.appointments a
  JOIN public.leads l ON l.id = a.lead_id
  WHERE a.org_id = p_org_id
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    AND lower(coalesce(a.type, '')) IN ('visita', 'visit')
    AND a.status = 'scheduled'
    AND a.outcome IS NULL
    AND now() >= (a.start_at + interval '3 hours')
  ORDER BY a.start_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));
END;
$$;

CREATE OR REPLACE FUNCTION public.record_visit_outcome(
  p_appointment_id uuid,
  p_target_stage text,
  p_notes text,
  p_actor_user_id uuid
)
RETURNS TABLE (
  appointment_id uuid,
  lead_id bigint,
  moved_to_stage text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_lead_id bigint;
  v_owner_user_id uuid;
  v_stage text;
  v_norm text;
  v_comment text;
BEGIN
  v_norm := lower(regexp_replace(coalesce(p_target_stage, ''), '[^a-z0-9_]+', '_', 'g'));

  v_stage := CASE v_norm
    WHEN 'proposta_negociacao' THEN 'proposta_negociacao'
    WHEN 'proposta_em_negociacao' THEN 'proposta_negociacao'
    WHEN 'financiamento' THEN 'financiamento'
    WHEN 'aprovou_projeto' THEN 'aprovou_projeto'
    WHEN 'contrato_assinado' THEN 'contrato_assinado'
    WHEN 'projeto_pago' THEN 'projeto_pago'
    ELSE NULL
  END;

  IF v_stage IS NULL THEN
    RAISE EXCEPTION 'Invalid target stage: %', p_target_stage;
  END IF;

  SELECT a.org_id, a.lead_id, a.user_id
    INTO v_org_id, v_lead_id, v_owner_user_id
  FROM public.appointments a
  WHERE a.id = p_appointment_id
  FOR UPDATE;

  IF v_lead_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(v_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: User does not belong to organization';
  END IF;

  UPDATE public.appointments
  SET outcome = v_stage,
      outcome_stage = v_stage,
      outcome_notes = NULLIF(trim(coalesce(p_notes, '')), ''),
      outcome_recorded_at = now(),
      outcome_actor_user_id = COALESCE(p_actor_user_id, v_owner_user_id),
      status = 'completed',
      updated_at = now()
  WHERE id = p_appointment_id;

  UPDATE public.leads
  SET status_pipeline = v_stage,
      stage_changed_at = now()
  WHERE id = v_lead_id
    AND org_id = v_org_id;

  v_comment := 'Visita registrada: ' || v_stage;
  IF NULLIF(trim(coalesce(p_notes, '')), '') IS NOT NULL THEN
    v_comment := v_comment || E'\nNotas: ' || trim(coalesce(p_notes, ''));
  END IF;

  BEGIN
    INSERT INTO public.comentarios_leads (
      org_id,
      lead_id,
      user_id,
      texto,
      autor,
      comment_type,
      date_bucket
    )
    VALUES (
      v_org_id,
      v_lead_id,
      COALESCE(p_actor_user_id, v_owner_user_id),
      v_comment,
      'Sistema',
      'visit_outcome',
      current_date
    );
  EXCEPTION
    WHEN undefined_column THEN
      INSERT INTO public.comentarios_leads (
        org_id,
        lead_id,
        texto,
        autor,
        comment_type,
        date_bucket
      )
      VALUES (
        v_org_id,
        v_lead_id,
        v_comment,
        'Sistema',
        'visit_outcome',
        current_date
      );
  END;

  RETURN QUERY
  SELECT p_appointment_id, v_lead_id, v_stage;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_lead_proposals(
  p_org_id uuid,
  p_lead_id bigint
)
RETURNS TABLE (
  proposal_version_id uuid,
  proposta_id bigint,
  lead_id bigint,
  version_no integer,
  created_at timestamptz,
  status text,
  segment text,
  source text,
  valor_projeto numeric,
  pdf_url text,
  share_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: User does not belong to organization';
  END IF;

  RETURN QUERY
  SELECT
    pv.id AS proposal_version_id,
    pv.proposta_id::bigint,
    pv.lead_id,
    pv.version_no,
    pv.created_at,
    pv.status::text,
    pv.segment::text,
    pv.source::text,
    p.valor_projeto,
    COALESCE(
      pv.premium_payload ->> 'public_pdf_url',
      pv.premium_payload ->> 'client_pdf_url',
      pv.premium_payload ->> 'pdf_url'
    ) AS pdf_url,
    pv.premium_payload ->> 'share_url' AS share_url
  FROM public.proposal_versions pv
  LEFT JOIN public.propostas p ON p.id = pv.proposta_id
  WHERE pv.org_id = p_org_id
    AND pv.lead_id = p_lead_id
  ORDER BY pv.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_proposals(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_owner uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  proposal_version_id uuid,
  proposta_id bigint,
  lead_id bigint,
  lead_name text,
  lead_phone text,
  lead_stage text,
  owner_user_id uuid,
  version_no integer,
  created_at timestamptz,
  status text,
  segment text,
  source text,
  valor_projeto numeric,
  pdf_url text,
  share_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.user_belongs_to_org(p_org_id) THEN
    RAISE EXCEPTION 'Unauthorized: User does not belong to organization';
  END IF;

  v_search := lower(trim(coalesce(p_search, '')));
  IF v_search = '' THEN
    v_search := NULL;
  END IF;

  RETURN QUERY
  SELECT
    pv.id AS proposal_version_id,
    pv.proposta_id::bigint,
    pv.lead_id,
    l.nome AS lead_name,
    coalesce(l.telefone, l.phone_e164) AS lead_phone,
    l.status_pipeline AS lead_stage,
    coalesce(l.assigned_to_user_id, l.user_id) AS owner_user_id,
    pv.version_no,
    pv.created_at,
    pv.status::text,
    pv.segment::text,
    pv.source::text,
    p.valor_projeto,
    COALESCE(
      pv.premium_payload ->> 'public_pdf_url',
      pv.premium_payload ->> 'client_pdf_url',
      pv.premium_payload ->> 'pdf_url'
    ) AS pdf_url,
    pv.premium_payload ->> 'share_url' AS share_url
  FROM public.proposal_versions pv
  JOIN public.leads l ON l.id = pv.lead_id AND l.org_id = p_org_id
  LEFT JOIN public.propostas p ON p.id = pv.proposta_id
  WHERE pv.org_id = p_org_id
    AND (v_search IS NULL OR lower(coalesce(l.nome, '')) LIKE '%' || v_search || '%' OR lower(coalesce(l.telefone, '')) LIKE '%' || v_search || '%' OR lower(coalesce(l.phone_e164, '')) LIKE '%' || v_search || '%')
    AND (p_status IS NULL OR p_status = '' OR pv.status::text = p_status)
    AND (p_stage IS NULL OR p_stage = '' OR l.status_pipeline = p_stage)
    AND (p_owner IS NULL OR coalesce(l.assigned_to_user_id, l.user_id) = p_owner)
    AND (p_date_from IS NULL OR pv.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR pv.created_at::date <= p_date_to)
  ORDER BY pv.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.visits_needing_outcome(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visits_needing_outcome(uuid, uuid, integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.record_visit_outcome(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_visit_outcome(uuid, text, text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_lead_proposals(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_proposals(uuid, bigint) TO service_role;

GRANT EXECUTE ON FUNCTION public.list_proposals(uuid, text, text, text, uuid, date, date, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_proposals(uuid, text, text, text, uuid, date, date, integer, integer) TO service_role;

