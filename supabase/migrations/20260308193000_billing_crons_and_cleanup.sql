-- Billing cron wiring and pending checkout cleanup

CREATE OR REPLACE FUNCTION public.pending_checkout_cleanup()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected integer := 0;
BEGIN
  UPDATE public.organizations
  SET
    subscription_status = 'canceled',
    updated_at = now()
  WHERE subscription_status = 'pending_checkout'
    AND created_at < now() - interval '48 hours';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'billing-sync-org-access-state-hourly';

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'billing-pending-checkout-cleanup-hourly';

    PERFORM cron.schedule(
      'billing-sync-org-access-state-hourly',
      '0 * * * *',
      $cron$SELECT public.sync_org_access_state();$cron$
    );

    PERFORM cron.schedule(
      'billing-pending-checkout-cleanup-hourly',
      '10 * * * *',
      $cron$SELECT public.pending_checkout_cleanup();$cron$
    );
  END IF;
END;
$do$;
