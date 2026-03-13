-- Extend runtime health scan with billing/broadcast/whatsapp/ai/cron checks.

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

  v_billable_org_count integer := 0;
  v_stripe_webhook_recent_count integer := 0;

  v_broadcast_pending_stale_count integer := 0;
  v_broadcast_sending_stale_count integer := 0;
  v_broadcast_failed_recent_count integer := 0;
  v_broadcast_oldest_pending_at timestamptz := NULL;
  v_broadcast_oldest_sending_at timestamptz := NULL;

  v_whatsapp_disconnected_count integer := 0;
  v_whatsapp_disconnected_org_count integer := 0;

  v_ai_error_total_15m integer := 0;
  v_ai_error_failed_15m integer := 0;
  v_ai_error_rate numeric := 0;

  v_broadcast_cron_active_count integer := 0;
  v_alert_severity text := 'warning';
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
    INTO v_billable_org_count
  FROM public.organizations o
  WHERE o.subscription_status IN ('trialing', 'active', 'past_due', 'unpaid');

  IF to_regclass('public.billing_events') IS NOT NULL THEN
    SELECT count(*)::int
      INTO v_stripe_webhook_recent_count
    FROM public.billing_events be
    WHERE be.event_type = 'stripe_webhook_received'
      AND be.created_at >= v_now - interval '24 hours';
  ELSE
    v_stripe_webhook_recent_count := 0;
  END IF;

  IF v_billable_org_count > 0 AND v_stripe_webhook_recent_count = 0 THEN
    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('stripe_webhook_failure:%s', v_window_bucket),
      'warning',
      'stripe_webhook_failure',
      jsonb_build_object(
        'window_hours', 24,
        'billable_org_count', v_billable_org_count,
        'stripe_webhooks_recent_count', v_stripe_webhook_recent_count,
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'stripe_webhook_failure'
      AND resolved_at IS NULL;
  END IF;

  SELECT
    count(*)::int,
    min(br.created_at)
  INTO
    v_broadcast_pending_stale_count,
    v_broadcast_oldest_pending_at
  FROM public.broadcast_recipients br
  JOIN public.broadcast_campaigns bc ON bc.id = br.campaign_id
  WHERE bc.status = 'running'
    AND br.status = 'pending'
    AND coalesce(br.next_attempt_at, br.created_at) <= v_now - interval '15 minutes';

  SELECT
    count(*)::int,
    min(coalesce(br.processing_started_at, br.updated_at, br.created_at))
  INTO
    v_broadcast_sending_stale_count,
    v_broadcast_oldest_sending_at
  FROM public.broadcast_recipients br
  JOIN public.broadcast_campaigns bc ON bc.id = br.campaign_id
  WHERE bc.status = 'running'
    AND br.status = 'sending'
    AND coalesce(br.processing_started_at, br.updated_at, br.created_at) <= v_now - interval '5 minutes';

  SELECT count(*)::int
    INTO v_broadcast_failed_recent_count
  FROM public.broadcast_recipients br
  WHERE br.status = 'failed'
    AND coalesce(br.updated_at, br.created_at) >= v_now - interval '60 minutes';

  IF v_broadcast_pending_stale_count > 0
     OR v_broadcast_sending_stale_count > 0
     OR v_broadcast_failed_recent_count >= 20 THEN
    v_alert_severity := CASE
      WHEN v_broadcast_sending_stale_count > 0 OR v_broadcast_failed_recent_count >= 40 THEN 'critical'
      ELSE 'warning'
    END;

    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('broadcast_worker_backlog:%s', v_window_bucket),
      v_alert_severity,
      'broadcast_worker_backlog',
      jsonb_build_object(
        'pending_stale_15m', v_broadcast_pending_stale_count,
        'sending_stale_5m', v_broadcast_sending_stale_count,
        'failed_last_60m', v_broadcast_failed_recent_count,
        'oldest_pending_created_at', v_broadcast_oldest_pending_at,
        'oldest_sending_started_at', v_broadcast_oldest_sending_at,
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'broadcast_worker_backlog'
      AND resolved_at IS NULL;
  END IF;

  SELECT
    count(*)::int,
    count(distinct wi.org_id)::int
  INTO
    v_whatsapp_disconnected_count,
    v_whatsapp_disconnected_org_count
  FROM public.whatsapp_instances wi
  WHERE wi.is_active = true
    AND coalesce(wi.status, 'disconnected') <> 'connected';

  IF v_whatsapp_disconnected_count > 0 THEN
    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('whatsapp_disconnected:%s', v_window_bucket),
      'warning',
      'whatsapp_disconnected',
      jsonb_build_object(
        'disconnected_instances', v_whatsapp_disconnected_count,
        'affected_orgs', v_whatsapp_disconnected_org_count,
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'whatsapp_disconnected'
      AND resolved_at IS NULL;
  END IF;

  SELECT count(*)::int
    INTO v_ai_error_total_15m
  FROM public.ai_action_logs a
  WHERE a.created_at >= v_now - interval '15 minutes';

  SELECT count(*)::int
    INTO v_ai_error_failed_15m
  FROM public.ai_action_logs a
  WHERE a.created_at >= v_now - interval '15 minutes'
    AND coalesce(a.success, false) = false;

  IF v_ai_error_total_15m > 0 THEN
    v_ai_error_rate := (v_ai_error_failed_15m::numeric / v_ai_error_total_15m::numeric);
  ELSE
    v_ai_error_rate := 0;
  END IF;

  IF v_ai_error_total_15m >= 10
     AND (v_ai_error_failed_15m >= 6 OR v_ai_error_rate >= 0.35) THEN
    v_alert_severity := CASE
      WHEN v_ai_error_failed_15m >= 15 OR v_ai_error_rate >= 0.6 THEN 'critical'
      ELSE 'warning'
    END;

    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('ai_error_anomaly:%s', v_window_bucket),
      v_alert_severity,
      'ai_error_anomaly',
      jsonb_build_object(
        'window_minutes', 15,
        'total_events', v_ai_error_total_15m,
        'failed_events', v_ai_error_failed_15m,
        'error_rate', round(v_ai_error_rate, 4),
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'ai_error_anomaly'
      AND resolved_at IS NULL;
  END IF;

  IF to_regclass('cron.job') IS NULL THEN
    v_broadcast_cron_active_count := 0;
  ELSE
    SELECT count(*)::int
      INTO v_broadcast_cron_active_count
    FROM cron.job j
    WHERE j.jobname = 'invoke-broadcast-worker'
      AND j.active = true
      AND j.command ILIKE '%/functions/v1/broadcast-worker%';
  END IF;

  IF v_broadcast_cron_active_count = 0 THEN
    INSERT INTO public.notification_runtime_alerts (
      dedupe_key,
      severity,
      alert_type,
      details
    )
    VALUES (
      format('broadcast_worker_cron_missing:%s', v_window_bucket),
      'critical',
      'broadcast_worker_cron_missing',
      jsonb_build_object(
        'expected_jobname', 'invoke-broadcast-worker',
        'active_matches', v_broadcast_cron_active_count,
        'detected_at', v_now
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted_count := v_inserted_count + v_row_count;
  ELSE
    UPDATE public.notification_runtime_alerts
      SET resolved_at = v_now
    WHERE alert_type = 'broadcast_worker_cron_missing'
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
    'stripe_webhook_recent_count', v_stripe_webhook_recent_count,
    'billable_org_count', v_billable_org_count,
    'broadcast_pending_stale_15m', v_broadcast_pending_stale_count,
    'broadcast_sending_stale_5m', v_broadcast_sending_stale_count,
    'broadcast_failed_60m', v_broadcast_failed_recent_count,
    'whatsapp_disconnected_count', v_whatsapp_disconnected_count,
    'ai_error_total_15m', v_ai_error_total_15m,
    'ai_error_failed_15m', v_ai_error_failed_15m,
    'broadcast_cron_active_count', v_broadcast_cron_active_count,
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
  SELECT 'stripe_webhook_failure'::text AS alert_type
  UNION ALL
  SELECT 'broadcast_worker_backlog'::text AS alert_type
  UNION ALL
  SELECT 'whatsapp_disconnected'::text AS alert_type
  UNION ALL
  SELECT 'ai_error_anomaly'::text AS alert_type
  UNION ALL
  SELECT 'broadcast_worker_cron_missing'::text AS alert_type
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
