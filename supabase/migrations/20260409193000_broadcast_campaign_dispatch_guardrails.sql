CREATE OR REPLACE FUNCTION public.broadcast_resolve_next_dispatch_at(
  p_interval_seconds integer,
  p_anchor timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  v_interval integer := GREATEST(60, LEAST(COALESCE(p_interval_seconds, 60), 86400));
  v_multiplier numeric := 1 + ((random() * 0.6) - 0.3);
  v_delay_seconds integer := GREATEST(60, ROUND(v_interval * v_multiplier));
BEGIN
  RETURN COALESCE(p_anchor, now()) + make_interval(secs => v_delay_seconds);
END;
$$;

ALTER TABLE public.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS next_dispatch_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_broadcast_campaigns_status_next_dispatch
  ON public.broadcast_campaigns (status, next_dispatch_at);

ALTER TABLE public.admin_broadcast_campaigns
  ADD COLUMN IF NOT EXISTS next_dispatch_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_admin_bc_status_next_dispatch
  ON public.admin_broadcast_campaigns (status, next_dispatch_at);

ALTER TABLE internal_crm.broadcast_campaigns
  ADD COLUMN IF NOT EXISTS next_dispatch_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_internal_crm_broadcast_campaigns_status_next_dispatch
  ON internal_crm.broadcast_campaigns (status, next_dispatch_at);

ALTER TABLE internal_crm.broadcast_recipients
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_internal_crm_broadcast_recipients_status_next_attempt
  ON internal_crm.broadcast_recipients (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_internal_crm_broadcast_recipients_processing_started
  ON internal_crm.broadcast_recipients (processing_started_at)
  WHERE status = 'processing';

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

DROP FUNCTION IF EXISTS public.broadcast_claim_recipients(integer, uuid, uuid);

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
  dispatch_order integer,
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
BEGIN
  RETURN QUERY
  WITH eligible_campaigns AS (
    SELECT
      bc.id AS campaign_id,
      public.broadcast_resolve_next_dispatch_at(bc.interval_seconds, now()) AS claimed_next_dispatch_at
    FROM public.broadcast_campaigns bc
    WHERE bc.status = 'running'
      AND COALESCE(bc.next_dispatch_at, now()) <= now()
      AND (p_org_id IS NULL OR bc.org_id = p_org_id)
      AND (p_campaign_id IS NULL OR bc.id = p_campaign_id)
    ORDER BY COALESCE(bc.next_dispatch_at, bc.updated_at, bc.created_at) ASC, bc.updated_at ASC
    FOR UPDATE OF bc SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
  ),
  candidate_recipients AS (
    SELECT
      ec.campaign_id,
      ec.claimed_next_dispatch_at,
      br.id AS recipient_id,
      br.name AS recipient_name,
      br.phone AS recipient_phone,
      br.email AS recipient_email,
      br.attempt_count,
      br.max_attempts,
      (
        SELECT COUNT(*)::integer - 1
        FROM public.broadcast_recipients prior
        WHERE prior.campaign_id = br.campaign_id
          AND (
            prior.created_at < br.created_at
            OR (prior.created_at = br.created_at AND prior.id <= br.id)
          )
      ) AS dispatch_order
    FROM eligible_campaigns ec
    JOIN LATERAL (
      SELECT *
      FROM public.broadcast_recipients br
      WHERE br.campaign_id = ec.campaign_id
        AND br.status = 'pending'
        AND COALESCE(br.next_attempt_at, now()) <= now()
        AND br.attempt_count < br.max_attempts
      ORDER BY COALESCE(br.next_attempt_at, br.created_at) ASC, br.created_at ASC, br.id ASC
      FOR UPDATE OF br SKIP LOCKED
      LIMIT 1
    ) br ON true
  ),
  updated_campaigns AS (
    UPDATE public.broadcast_campaigns bc
    SET
      next_dispatch_at = cr.claimed_next_dispatch_at,
      updated_at = now()
    FROM candidate_recipients cr
    WHERE bc.id = cr.campaign_id
    RETURNING bc.id
  ),
  claimed AS (
    UPDATE public.broadcast_recipients br
    SET
      status = 'sending',
      processing_started_at = now(),
      attempt_count = br.attempt_count + 1,
      error_message = NULL,
      updated_at = now()
    FROM candidate_recipients cr
    WHERE br.id = cr.recipient_id
    RETURNING
      br.id,
      br.campaign_id,
      cr.recipient_name,
      cr.recipient_phone,
      cr.recipient_email,
      br.attempt_count,
      br.max_attempts,
      cr.dispatch_order
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
    c.dispatch_order,
    c.recipient_name,
    c.recipient_phone,
    c.recipient_email,
    c.attempt_count,
    c.max_attempts
  FROM claimed c
  JOIN public.broadcast_campaigns bc ON bc.id = c.campaign_id;
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

CREATE OR REPLACE FUNCTION public.admin_broadcast_refresh_campaign_progress(
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
  FROM public.admin_broadcast_recipients
  WHERE campaign_id = p_campaign_id;

  UPDATE public.admin_broadcast_campaigns
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

DROP FUNCTION IF EXISTS public.admin_broadcast_claim_recipients(integer, uuid);

CREATE OR REPLACE FUNCTION public.admin_broadcast_claim_recipients(
  p_limit integer DEFAULT 20,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE(
  recipient_id uuid,
  campaign_id uuid,
  owner_user_id uuid,
  instance_name text,
  messages jsonb,
  interval_seconds integer,
  dispatch_order integer,
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
BEGIN
  RETURN QUERY
  WITH eligible_campaigns AS (
    SELECT
      bc.id AS campaign_id,
      public.broadcast_resolve_next_dispatch_at(bc.interval_seconds, now()) AS claimed_next_dispatch_at
    FROM public.admin_broadcast_campaigns bc
    WHERE bc.status = 'running'
      AND COALESCE(bc.next_dispatch_at, now()) <= now()
      AND (p_campaign_id IS NULL OR bc.id = p_campaign_id)
    ORDER BY COALESCE(bc.next_dispatch_at, bc.updated_at, bc.created_at) ASC, bc.updated_at ASC
    FOR UPDATE OF bc SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
  ),
  candidate_recipients AS (
    SELECT
      ec.campaign_id,
      ec.claimed_next_dispatch_at,
      br.id AS recipient_id,
      br.name AS recipient_name,
      br.phone AS recipient_phone,
      br.email AS recipient_email,
      br.attempt_count,
      br.max_attempts,
      (
        SELECT COUNT(*)::integer - 1
        FROM public.admin_broadcast_recipients prior
        WHERE prior.campaign_id = br.campaign_id
          AND (
            prior.created_at < br.created_at
            OR (prior.created_at = br.created_at AND prior.id <= br.id)
          )
      ) AS dispatch_order
    FROM eligible_campaigns ec
    JOIN LATERAL (
      SELECT *
      FROM public.admin_broadcast_recipients br
      WHERE br.campaign_id = ec.campaign_id
        AND br.status = 'pending'
        AND COALESCE(br.next_attempt_at, now()) <= now()
        AND br.attempt_count < br.max_attempts
      ORDER BY COALESCE(br.next_attempt_at, br.created_at) ASC, br.created_at ASC, br.id ASC
      FOR UPDATE OF br SKIP LOCKED
      LIMIT 1
    ) br ON true
  ),
  updated_campaigns AS (
    UPDATE public.admin_broadcast_campaigns bc
    SET
      next_dispatch_at = cr.claimed_next_dispatch_at,
      updated_at = now()
    FROM candidate_recipients cr
    WHERE bc.id = cr.campaign_id
    RETURNING bc.id
  ),
  claimed AS (
    UPDATE public.admin_broadcast_recipients br
    SET
      status = 'sending',
      processing_started_at = now(),
      attempt_count = br.attempt_count + 1,
      error_message = NULL,
      updated_at = now()
    FROM candidate_recipients cr
    WHERE br.id = cr.recipient_id
    RETURNING
      br.id,
      br.campaign_id,
      cr.recipient_name,
      cr.recipient_phone,
      cr.recipient_email,
      br.attempt_count,
      br.max_attempts,
      cr.dispatch_order
  )
  SELECT
    c.id AS recipient_id,
    c.campaign_id,
    bc.owner_user_id,
    bc.instance_name,
    bc.messages,
    bc.interval_seconds,
    c.dispatch_order,
    c.recipient_name,
    c.recipient_phone,
    c.recipient_email,
    c.attempt_count,
    c.max_attempts
  FROM claimed c
  JOIN public.admin_broadcast_campaigns bc ON bc.id = c.campaign_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_requeue_stale_recipients(
  p_stale_minutes integer DEFAULT 5
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes integer := GREATEST(1, LEAST(COALESCE(p_stale_minutes, 5), 60));
BEGIN
  UPDATE public.admin_broadcast_recipients
  SET
    status = CASE
      WHEN attempt_count >= max_attempts THEN 'failed'
      ELSE 'pending'
    END,
    processing_started_at = NULL,
    next_attempt_at = CASE
      WHEN attempt_count >= max_attempts THEN next_attempt_at
      ELSE now()
    END,
    error_message = COALESCE(NULLIF(error_message, ''), 'requeued_stale'),
    updated_at = now()
  WHERE status = 'sending'
    AND COALESCE(processing_started_at, updated_at) < now() - make_interval(mins => v_minutes);
END;
$$;

CREATE OR REPLACE FUNCTION internal_crm.broadcast_refresh_campaign_progress(
  p_campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal_crm, public
AS $$
DECLARE
  v_total integer := 0;
  v_sent integer := 0;
  v_failed integer := 0;
  v_pending integer := 0;
  v_processing integer := 0;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE status = 'sent')::integer,
    COUNT(*) FILTER (WHERE status = 'failed')::integer,
    COUNT(*) FILTER (WHERE status = 'pending')::integer,
    COUNT(*) FILTER (WHERE status = 'processing')::integer
  INTO v_total, v_sent, v_failed, v_pending, v_processing
  FROM internal_crm.broadcast_recipients
  WHERE campaign_id = p_campaign_id;

  UPDATE internal_crm.broadcast_campaigns
  SET
    sent_count = v_sent,
    failed_count = v_failed,
    status = CASE
      WHEN status = 'running' AND v_pending = 0 AND v_processing = 0 THEN 'completed'
      ELSE status
    END,
    finished_at = CASE
      WHEN status = 'running' AND v_pending = 0 AND v_processing = 0 THEN now()
      ELSE finished_at
    END,
    updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

DROP FUNCTION IF EXISTS internal_crm.broadcast_claim_recipients(integer, uuid);

CREATE OR REPLACE FUNCTION internal_crm.broadcast_claim_recipients(
  p_limit integer DEFAULT 20,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS TABLE(
  recipient_id uuid,
  campaign_id uuid,
  whatsapp_instance_id uuid,
  instance_name text,
  messages jsonb,
  interval_seconds integer,
  dispatch_order integer,
  recipient_name text,
  recipient_phone text,
  attempt_count integer,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal_crm, public
AS $$
BEGIN
  RETURN QUERY
  WITH eligible_campaigns AS (
    SELECT
      bc.id AS campaign_id,
      public.broadcast_resolve_next_dispatch_at(bc.interval_seconds, now()) AS claimed_next_dispatch_at
    FROM internal_crm.broadcast_campaigns bc
    WHERE bc.status = 'running'
      AND COALESCE(bc.next_dispatch_at, now()) <= now()
      AND (p_campaign_id IS NULL OR bc.id = p_campaign_id)
    ORDER BY COALESCE(bc.next_dispatch_at, bc.updated_at, bc.created_at) ASC, bc.updated_at ASC
    FOR UPDATE OF bc SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 200))
  ),
  candidate_recipients AS (
    SELECT
      ec.campaign_id,
      ec.claimed_next_dispatch_at,
      br.id AS recipient_id,
      br.recipient_name,
      br.recipient_phone,
      br.attempt_count,
      br.max_attempts,
      (
        SELECT COUNT(*)::integer - 1
        FROM internal_crm.broadcast_recipients prior
        WHERE prior.campaign_id = br.campaign_id
          AND (
            prior.created_at < br.created_at
            OR (prior.created_at = br.created_at AND prior.id <= br.id)
          )
      ) AS dispatch_order
    FROM eligible_campaigns ec
    JOIN LATERAL (
      SELECT *
      FROM internal_crm.broadcast_recipients br
      WHERE br.campaign_id = ec.campaign_id
        AND br.status = 'pending'
        AND COALESCE(br.next_attempt_at, now()) <= now()
        AND br.attempt_count < br.max_attempts
      ORDER BY COALESCE(br.next_attempt_at, br.created_at) ASC, br.created_at ASC, br.id ASC
      FOR UPDATE OF br SKIP LOCKED
      LIMIT 1
    ) br ON true
  ),
  updated_campaigns AS (
    UPDATE internal_crm.broadcast_campaigns bc
    SET
      next_dispatch_at = cr.claimed_next_dispatch_at,
      updated_at = now()
    FROM candidate_recipients cr
    WHERE bc.id = cr.campaign_id
    RETURNING bc.id
  ),
  claimed AS (
    UPDATE internal_crm.broadcast_recipients br
    SET
      status = 'processing',
      processing_started_at = now(),
      attempt_count = br.attempt_count + 1,
      last_error = NULL,
      updated_at = now()
    FROM candidate_recipients cr
    WHERE br.id = cr.recipient_id
    RETURNING
      br.id,
      br.campaign_id,
      cr.recipient_name,
      cr.recipient_phone,
      br.attempt_count,
      br.max_attempts,
      cr.dispatch_order
  )
  SELECT
    c.id AS recipient_id,
    c.campaign_id,
    bc.whatsapp_instance_id,
    wi.instance_name,
    bc.messages,
    bc.interval_seconds,
    c.dispatch_order,
    c.recipient_name,
    c.recipient_phone,
    c.attempt_count,
    c.max_attempts
  FROM claimed c
  JOIN internal_crm.broadcast_campaigns bc ON bc.id = c.campaign_id
  LEFT JOIN internal_crm.whatsapp_instances wi ON wi.id = bc.whatsapp_instance_id;
END;
$$;

CREATE OR REPLACE FUNCTION internal_crm.broadcast_requeue_stale_recipients(
  p_stale_minutes integer DEFAULT 5
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal_crm, public
AS $$
DECLARE
  v_rows bigint := 0;
  v_minutes integer := GREATEST(1, LEAST(COALESCE(p_stale_minutes, 5), 60));
BEGIN
  WITH moved AS (
    UPDATE internal_crm.broadcast_recipients br
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
      last_error = COALESCE(NULLIF(br.last_error, ''), 'stale_processing_requeue'),
      updated_at = now(),
      last_attempt_at = CASE
        WHEN br.attempt_count >= br.max_attempts THEN now()
        ELSE br.last_attempt_at
      END
    WHERE br.status = 'processing'
      AND COALESCE(br.processing_started_at, br.updated_at) < now() - make_interval(mins => v_minutes)
    RETURNING br.campaign_id
  )
  SELECT COUNT(*)::bigint INTO v_rows FROM moved;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.broadcast_resolve_next_dispatch_at(integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal_crm.broadcast_refresh_campaign_progress(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal_crm.broadcast_claim_recipients(integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION internal_crm.broadcast_requeue_stale_recipients(integer) TO authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $do$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'invoke-broadcast-worker',
      'invoke-admin-broadcast-worker',
      'invoke-internal-crm-broadcast-worker'
    )
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'invoke-broadcast-worker',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/broadcast-worker',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8"}'::jsonb,
      body := '{"source":"cron","batch_size":200}'::jsonb
    );
    $job$
  );

  PERFORM cron.schedule(
    'invoke-admin-broadcast-worker',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/admin-broadcast-worker',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8"}'::jsonb,
      body := '{"source":"cron","batch_size":200}'::jsonb
    );
    $job$
  );

  PERFORM cron.schedule(
    'invoke-internal-crm-broadcast-worker',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/internal-crm-broadcast-worker',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8"}'::jsonb,
      body := '{"source":"cron","batch_size":200}'::jsonb
    );
    $job$
  );
END;
$do$;
