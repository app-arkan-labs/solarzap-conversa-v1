-- PR5: tracking v3 dispatcher claim/stale helpers + cron schedules

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.tracking_claim_delivery_batch(p_batch_size integer DEFAULT 50)
RETURNS SETOF public.conversion_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.conversion_deliveries%ROWTYPE;
BEGIN
  FOR r IN
    WITH candidates AS (
      SELECT d.id
      FROM public.conversion_deliveries d
      WHERE d.status IN ('pending', 'failed')
        AND d.next_attempt_at <= now()
        AND d.attempt_count < d.max_attempts
      ORDER BY d.next_attempt_at ASC, d.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size, 50), 200))
    )
    UPDATE public.conversion_deliveries d
    SET
      status = 'processing',
      updated_at = now()
    FROM candidates c
    WHERE d.id = c.id
    RETURNING d.*
  LOOP
    RETURN NEXT r;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.tracking_requeue_stale_deliveries()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows bigint := 0;
BEGIN
  WITH moved AS (
    UPDATE public.conversion_deliveries
    SET
      status = 'pending',
      next_attempt_at = now(),
      updated_at = now(),
      last_error = COALESCE(NULLIF(last_error, ''), 'stale_processing_requeue')
    WHERE status = 'processing'
      AND updated_at < now() - INTERVAL '3 minutes'
    RETURNING 1
  )
  SELECT count(*)::bigint INTO v_rows FROM moved;

  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tracking_claim_delivery_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.tracking_requeue_stale_deliveries() TO service_role;

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('dispatch-worker', 'dispatch-stale-guard')
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  BEGIN
    PERFORM cron.schedule(
      'dispatch-worker',
      '30 seconds',
      $job$
      SELECT
        net.http_post(
          url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/conversion-dispatcher',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8'
          ),
          body := '{"source":"cron"}'::jsonb
        ) AS request_id;
      $job$
    );
  EXCEPTION
    WHEN others THEN
      PERFORM cron.schedule(
        'dispatch-worker',
        '* * * * *',
        $job$
        SELECT
          net.http_post(
            url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/conversion-dispatcher',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8'
            ),
            body := '{"source":"cron","fallback":"1m"}'::jsonb
          ) AS request_id;
        $job$
      );
  END;

  PERFORM cron.schedule(
    'dispatch-stale-guard',
    '*/5 * * * *',
    $job$
      SELECT public.tracking_requeue_stale_deliveries();
    $job$
  );
END;
$$;

