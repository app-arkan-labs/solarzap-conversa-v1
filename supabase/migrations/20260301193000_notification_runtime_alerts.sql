-- Runtime health monitoring for notification workers.
-- Detects auth/cron drift and pending backlog accumulation.

CREATE TABLE IF NOT EXISTS public.notification_runtime_alerts (
  id bigserial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  alert_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notification_runtime_alerts_type_created
  ON public.notification_runtime_alerts (alert_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_runtime_alerts_open
  ON public.notification_runtime_alerts (alert_type, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.scan_notification_runtime_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_now timestamptz := now();
  v_window_bucket text :=
    to_char(date_trunc('hour', v_now), 'YYYYMMDDHH24')
    || '-'
    || lpad(((extract(minute from v_now)::int / 10) * 10)::text, 2, '0');
  v_missing_auth_count integer := 0;
  v_pending_stale_count integer := 0;
  v_oldest_pending_created_at timestamptz := NULL;
  v_row_count integer := 0;
  v_inserted_count integer := 0;
  v_open_total integer := 0;
BEGIN
  SELECT count(*)::int
    INTO v_missing_auth_count
  FROM net._http_response r
  WHERE r.created >= v_now - interval '10 minutes'
    AND r.status_code = 401
    AND coalesce(r.content, '') ILIKE '%Missing authorization header%';

  IF v_missing_auth_count > 0 THEN
    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('missing_auth_header:%s', v_window_bucket),
      'critical',
      'missing_auth_header',
      jsonb_build_object(
        'window_minutes', 10,
        'missing_authorization_401_count', v_missing_auth_count,
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'missing_auth_header'
      AND resolved_at IS NULL;
  END IF;

  SELECT
    count(*)::int,
    min(e.created_at)
  INTO
    v_pending_stale_count,
    v_oldest_pending_created_at
  FROM public.notification_events e
  WHERE e.status = 'pending'
    AND coalesce(e.next_attempt_at, e.created_at) <= v_now - interval '15 minutes'
    AND (e.locked_at IS NULL OR e.locked_at <= v_now - interval '10 minutes');

  IF v_pending_stale_count > 0 THEN
    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('pending_backlog:%s', v_window_bucket),
      'warning',
      'pending_backlog',
      jsonb_build_object(
        'threshold_minutes', 15,
        'stale_pending_events', v_pending_stale_count,
        'oldest_pending_created_at', v_oldest_pending_created_at,
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'pending_backlog'
      AND resolved_at IS NULL;
  END IF;

  SELECT count(*)::int
    INTO v_open_total
  FROM public.notification_runtime_alerts
  WHERE resolved_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'checked_at', v_now,
    'window_bucket', v_window_bucket,
    'missing_auth_401_count', v_missing_auth_count,
    'pending_stale_count', v_pending_stale_count,
    'alerts_inserted', v_inserted_count,
    'open_alerts', v_open_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_notification_runtime_health() TO service_role;

CREATE OR REPLACE VIEW public.notification_runtime_health_latest AS
WITH expected_types AS (
  SELECT 'missing_auth_header'::text AS alert_type
  UNION ALL
  SELECT 'pending_backlog'::text AS alert_type
),
latest AS (
  SELECT DISTINCT ON (a.alert_type)
    a.alert_type,
    a.severity,
    a.dedupe_key,
    a.details,
    a.created_at,
    a.resolved_at
  FROM public.notification_runtime_alerts a
  ORDER BY a.alert_type, a.created_at DESC
),
open_counts AS (
  SELECT
    a.alert_type,
    count(*)::int AS open_count
  FROM public.notification_runtime_alerts a
  WHERE a.resolved_at IS NULL
  GROUP BY a.alert_type
)
SELECT
  t.alert_type,
  l.severity AS last_severity,
  l.dedupe_key AS last_dedupe_key,
  l.details AS last_details,
  l.created_at AS last_created_at,
  l.resolved_at AS last_resolved_at,
  coalesce(o.open_count, 0) AS open_count
FROM expected_types t
LEFT JOIN latest l
  ON l.alert_type = t.alert_type
LEFT JOIN open_counts o
  ON o.alert_type = t.alert_type;

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'invoke-notification-health-scan'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'invoke-notification-health-scan',
    '*/5 * * * *',
    $job$
      SELECT public.scan_notification_runtime_health();
    $job$
  );
END;
$$;
