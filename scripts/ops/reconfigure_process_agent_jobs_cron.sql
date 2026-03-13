-- Reconfigure process-agent-jobs cron without hardcoded project URL/JWT in repository SQL.
-- Required runtime settings (set via set_config before running this script):
--   app.process_agent_jobs_cron_project_ref
--   app.process_agent_jobs_cron_service_role_jwt

DO $$
DECLARE
  v_project_ref text := nullif(current_setting('app.process_agent_jobs_cron_project_ref', true), '');
  v_service_role_jwt text := nullif(current_setting('app.process_agent_jobs_cron_service_role_jwt', true), '');
  v_worker_url text;
  v_command text;
  v_job record;
BEGIN
  IF v_project_ref IS NULL THEN
    RAISE EXCEPTION 'Missing required runtime setting: app.process_agent_jobs_cron_project_ref';
  END IF;

  IF v_service_role_jwt IS NULL THEN
    RAISE EXCEPTION 'Missing required runtime setting: app.process_agent_jobs_cron_service_role_jwt';
  END IF;

  v_worker_url := format('https://%s.supabase.co/functions/v1/process-agent-jobs', v_project_ref);

  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'process-agent-jobs-worker'
      OR command ILIKE '%/functions/v1/process-agent-jobs%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  v_command := format(
    $cmd$
SELECT
  net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', %L
    ),
    body := %L::jsonb
  ) AS request_id;
$cmd$,
    v_worker_url,
    format('Bearer %s', v_service_role_jwt),
    '{"source":"cron"}'
  );

  PERFORM cron.schedule(
    'process-agent-jobs-worker',
    '* * * * *',
    v_command
  );

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'process-agent-jobs-worker'
      AND command ILIKE '%' || v_worker_url || '%'
  ) THEN
    RAISE EXCEPTION 'Cron validation failed: process-agent-jobs-worker is not pointing to %', v_worker_url;
  END IF;
END
$$;

SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  j.command
FROM cron.job j
WHERE j.jobname = 'process-agent-jobs-worker'
   OR j.command ILIKE '%/functions/v1/process-agent-jobs%'
ORDER BY j.jobid;
