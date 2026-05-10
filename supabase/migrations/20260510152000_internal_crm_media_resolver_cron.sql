-- Internal CRM only: lightweight fallback cron for inbound media resolver.
-- Requires a Supabase Vault secret named internal_crm_media_resolver_bearer
-- containing a bearer token accepted by internal-crm-media-resolver.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $do$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'internal-crm-resolve-pending-media'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'internal-crm-resolve-pending-media',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/internal-crm-media-resolver',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || decrypted_secret,
        'apikey', decrypted_secret
      ),
      body := jsonb_build_object(
        'action', 'retryPending',
        'maxBatch', 8,
        'minAgeSeconds', 10,
        'maxAttempts', 5
      )
    )
    FROM vault.decrypted_secrets
    WHERE name = 'internal_crm_media_resolver_bearer'
    LIMIT 1;
    $job$
  );
END;
$do$;
