-- Extend notification runtime guard-rails with digest comment schema checks.

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
  v_digest_cron_count integer := 0;
  v_legacy_engine_count integer := 0;
  v_digest_schema_missing_count integer := 0;
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
    INTO v_digest_cron_count
  FROM cron.job j
  WHERE j.active
    AND j.jobname = 'invoke-ai-digest-worker'
    AND j.command ILIKE '%/functions/v1/ai-digest-worker%';

  IF v_digest_cron_count = 0 THEN
    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('digest_cron_missing:%s', v_window_bucket),
      'critical',
      'digest_cron_missing',
      jsonb_build_object(
        'expected_jobname', 'invoke-ai-digest-worker',
        'expected_command_like', '/functions/v1/ai-digest-worker',
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'digest_cron_missing'
      AND resolved_at IS NULL;
  END IF;

  SELECT count(*)::int
    INTO v_legacy_engine_count
  FROM cron.job j
  WHERE j.active
    AND (
      j.jobname = 'invoke-ai-reporter'
      OR j.command ILIKE '%/functions/v1/ai-reporter%'
    );

  IF v_legacy_engine_count > 0 THEN
    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('deprecated_digest_engine_active:%s', v_window_bucket),
      'critical',
      'deprecated_digest_engine_active',
      jsonb_build_object(
        'active_legacy_jobs', v_legacy_engine_count,
        'legacy_endpoint', '/functions/v1/ai-reporter',
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'deprecated_digest_engine_active'
      AND resolved_at IS NULL;
  END IF;

  SELECT count(*)::int
    INTO v_digest_schema_missing_count
  FROM (
    SELECT 'comment_type'::text AS column_name
    UNION ALL
    SELECT 'date_bucket'::text AS column_name
  ) required_cols
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'comentarios_leads'
      AND c.column_name = required_cols.column_name
  );

  IF v_digest_schema_missing_count > 0 THEN
    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('digest_schema_incomplete:%s', v_window_bucket),
      'critical',
      'digest_schema_incomplete',
      jsonb_build_object(
        'table_name', 'comentarios_leads',
        'required_columns', jsonb_build_array('comment_type', 'date_bucket'),
        'missing_required_column_count', v_digest_schema_missing_count,
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'digest_schema_incomplete'
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
    'digest_cron_active_count', v_digest_cron_count,
    'legacy_digest_engine_active_count', v_legacy_engine_count,
    'digest_schema_missing_required_column_count', v_digest_schema_missing_count,
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
  UNION ALL
  SELECT 'digest_cron_missing'::text AS alert_type
  UNION ALL
  SELECT 'deprecated_digest_engine_active'::text AS alert_type
  UNION ALL
  SELECT 'digest_schema_incomplete'::text AS alert_type
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
