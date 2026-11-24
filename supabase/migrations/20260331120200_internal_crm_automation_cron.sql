-- =============================================================
-- Cron job: process pending internal CRM automation runs every 1 minute
-- Uses pg_net to POST to the edge function internal-crm-api
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Ensure pg_net is available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $do$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'internal-crm-process-automation-runs'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'internal-crm-process-automation-runs',
    '* * * * *',
    $job$
    SELECT public.solarzap_enqueue_worker('internal-crm-api', '{"action":"process_automation_runs"}'::jsonb);
    $job$
  );
END;
$do$;
