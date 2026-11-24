SELECT cron.schedule(
  'solarzap-cleanup-cron-run-history',
  '0 6 * * *',
  $cleanup$
    DELETE FROM cron.job_run_details
    WHERE end_time IS NOT NULL
      AND (status = 'succeeded' OR end_time < now() - interval '3 days');
  $cleanup$
);

DELETE FROM cron.job_run_details
WHERE end_time IS NOT NULL
  AND (status = 'succeeded' OR end_time < now() - interval '3 days');
