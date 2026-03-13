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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.unschedule('billing-sync-org-access-state-hourly');
    PERFORM cron.unschedule('billing-pending-checkout-cleanup-hourly');

    PERFORM cron.schedule(
      'billing-sync-org-access-state-hourly',
      '0 * * * *',
      $$SELECT public.sync_org_access_state();$$
    );

    PERFORM cron.schedule(
      'billing-pending-checkout-cleanup-hourly',
      '10 * * * *',
      $$SELECT public.pending_checkout_cleanup();$$
    );
  END IF;
END;
$$;
