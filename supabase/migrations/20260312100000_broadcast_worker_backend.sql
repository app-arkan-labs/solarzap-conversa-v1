ALTER TABLE public.broadcast_recipients
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status_next_attempt
  ON public.broadcast_recipients (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_processing_started
  ON public.broadcast_recipients (processing_started_at)
  WHERE status = 'sending';

CREATE OR REPLACE FUNCTION public.broadcast_recipients_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_broadcast_recipients_updated_at ON public.broadcast_recipients;
CREATE TRIGGER tr_broadcast_recipients_updated_at
  BEFORE UPDATE ON public.broadcast_recipients
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_recipients_set_updated_at();

CREATE OR REPLACE FUNCTION public.broadcast_refresh_campaign_progress(
  p_campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer := 0;
  v_sent integer := 0;
  v_failed integer := 0;
  v_pending integer := 0;
  v_sending integer := 0;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status = 'sent')::integer,
    COUNT(*) FILTER (WHERE status = 'failed')::integer,
    COUNT(*) FILTER (WHERE status = 'pending')::integer,
    COUNT(*) FILTER (WHERE status = 'sending')::integer
  INTO v_total, v_sent, v_failed, v_pending, v_sending
  FROM public.broadcast_recipients
  WHERE campaign_id = p_campaign_id;

  UPDATE public.broadcast_campaigns
  SET
    total_recipients = v_total,
    sent_count = v_sent,
    failed_count = v_failed,
    status = CASE
      WHEN status = 'running' AND v_pending = 0 AND v_sending = 0 THEN 'completed'
      ELSE status
    END,
    completed_at = CASE
      WHEN status = 'running' AND v_pending = 0 AND v_sending = 0 THEN now()
      ELSE completed_at
    END,
    updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_claim_recipients(
  p_limit integer DEFAULT 20,
  p_org_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE(
  recipient_id uuid,
  campaign_id uuid,
  org_id uuid,
  user_id uuid,
  assigned_to_user_id uuid,
  lead_client_type text,
  instance_name text,
  source_channel text,
  pipeline_stage text,
  ai_enabled boolean,
  messages jsonb,
  interval_seconds integer,
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  attempt_count integer,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    WITH candidates AS (
      SELECT br.id
      FROM public.broadcast_recipients br
      JOIN public.broadcast_campaigns bc ON bc.id = br.campaign_id
      WHERE bc.status = 'running'
        AND br.status = 'pending'
        AND br.next_attempt_at <= now()
        AND br.attempt_count < br.max_attempts
        AND (p_org_id IS NULL OR bc.org_id = p_org_id)
        AND (p_campaign_id IS NULL OR bc.id = p_campaign_id)
      ORDER BY br.next_attempt_at ASC, br.created_at ASC
      FOR UPDATE OF br SKIP LOCKED
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
    ),
    claimed AS (
      UPDATE public.broadcast_recipients br
      SET
        status = 'sending',
        processing_started_at = now(),
        attempt_count = br.attempt_count + 1,
        error_message = NULL,
        updated_at = now()
      FROM candidates c
      WHERE br.id = c.id
      RETURNING br.*
    )
    SELECT
      c.id AS recipient_id,
      c.campaign_id,
      bc.org_id,
      bc.user_id,
      bc.assigned_to_user_id,
      bc.lead_client_type,
      bc.instance_name,
      bc.source_channel,
      bc.pipeline_stage,
      bc.ai_enabled,
      bc.messages,
      bc.interval_seconds,
      c.name AS recipient_name,
      c.phone AS recipient_phone,
      c.email AS recipient_email,
      c.attempt_count,
      c.max_attempts
    FROM claimed c
    JOIN public.broadcast_campaigns bc ON bc.id = c.campaign_id
  LOOP
    recipient_id := r.recipient_id;
    campaign_id := r.campaign_id;
    org_id := r.org_id;
    user_id := r.user_id;
    assigned_to_user_id := r.assigned_to_user_id;
    lead_client_type := r.lead_client_type;
    instance_name := r.instance_name;
    source_channel := r.source_channel;
    pipeline_stage := r.pipeline_stage;
    ai_enabled := r.ai_enabled;
    messages := r.messages;
    interval_seconds := r.interval_seconds;
    recipient_name := r.recipient_name;
    recipient_phone := r.recipient_phone;
    recipient_email := r.recipient_email;
    attempt_count := r.attempt_count;
    max_attempts := r.max_attempts;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_requeue_stale_recipients(
  p_stale_minutes integer DEFAULT 5
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows bigint := 0;
  v_minutes integer := GREATEST(1, LEAST(COALESCE(p_stale_minutes, 5), 60));
BEGIN
  WITH moved AS (
    UPDATE public.broadcast_recipients br
    SET
      status = CASE
        WHEN br.attempt_count >= br.max_attempts THEN 'failed'
        ELSE 'pending'
      END,
      processing_started_at = NULL,
      next_attempt_at = CASE
        WHEN br.attempt_count >= br.max_attempts THEN br.next_attempt_at
        ELSE now()
      END,
      error_message = COALESCE(NULLIF(br.error_message, ''), 'stale_processing_requeue'),
      updated_at = now(),
      sent_at = CASE
        WHEN br.attempt_count >= br.max_attempts THEN now()
        ELSE br.sent_at
      END
    WHERE br.status = 'sending'
      AND COALESCE(br.processing_started_at, br.updated_at) < now() - make_interval(mins => v_minutes)
    RETURNING br.campaign_id
  )
  SELECT COUNT(*)::bigint INTO v_rows FROM moved;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcast_refresh_campaign_progress(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_claim_recipients(integer, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_requeue_stale_recipients(integer) TO authenticated, service_role;
