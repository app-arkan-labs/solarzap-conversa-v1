-- Reconfigure notification cron jobs with explicit dual-auth headers.
-- Required session settings (set via set_config before running this script):
--   app.notification_cron_project_ref
--   app.notification_cron_service_role_jwt
--   app.notification_cron_internal_api_key

DO $$
DECLARE
  v_project_ref text := nullif(current_setting('app.notification_cron_project_ref', true), '');
  v_service_role_jwt text := nullif(current_setting('app.notification_cron_service_role_jwt', true), '');
  v_internal_api_key text := nullif(current_setting('app.notification_cron_internal_api_key', true), '');
  v_notification_url text;
  v_digest_url text;
  v_notification_command text;
  v_digest_command text;
  v_job record;
BEGIN
  IF v_project_ref IS NULL THEN
    RAISE EXCEPTION 'Missing required runtime setting: app.notification_cron_project_ref';
  END IF;
  IF v_service_role_jwt IS NULL THEN
    RAISE EXCEPTION 'Missing required runtime setting: app.notification_cron_service_role_jwt';
  END IF;
  IF v_internal_api_key IS NULL THEN
    RAISE EXCEPTION 'Missing required runtime setting: app.notification_cron_internal_api_key';
  END IF;

  v_notification_url := format('https://%s.supabase.co/functions/v1/notification-worker', v_project_ref);
  v_digest_url := format('https://%s.supabase.co/functions/v1/ai-digest-worker', v_project_ref);

  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'invoke-notification-worker',
      'invoke-ai-digest-worker',
      'invoke-ai-reporter'
    )
      OR command ILIKE '%/functions/v1/ai-reporter%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  v_notification_command := format(
    $cmd$
SELECT
  net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', %L,
      'x-internal-api-key', %L
    ),
    body := %L::jsonb
  ) AS request_id;
$cmd$,
    v_notification_url,
    format('Bearer %s', v_service_role_jwt),
    v_internal_api_key,
    '{"source":"cron"}'
  );

  v_digest_command := format(
    $cmd$
SELECT
  net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', %L,
      'x-internal-api-key', %L
    ),
    body := %L::jsonb
  ) AS request_id;
$cmd$,
    v_digest_url,
    format('Bearer %s', v_service_role_jwt),
    v_internal_api_key,
    '{"source":"cron"}'
  );

  PERFORM cron.schedule(
    'invoke-notification-worker',
    '*/2 * * * *',
    v_notification_command
  );

  PERFORM cron.schedule(
    'invoke-ai-digest-worker',
    '*/15 * * * *',
    v_digest_command
  );
END
$$;

SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  j.command
FROM cron.job j
WHERE j.jobname IN ('invoke-notification-worker', 'invoke-ai-digest-worker', 'invoke-ai-reporter')
   OR j.command ILIKE '%/functions/v1/ai-reporter%'
ORDER BY j.jobname;
