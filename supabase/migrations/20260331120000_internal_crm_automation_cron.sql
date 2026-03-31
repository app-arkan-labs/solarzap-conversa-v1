-- =============================================================
-- Cron job: process pending internal CRM automation runs every 1 minute
-- Uses pg_net to POST to the edge function internal-crm-api
-- =============================================================

-- Ensure pg_net is available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Register the cron job (pg_cron must already be enabled on the project)
SELECT cron.schedule(
  'internal-crm-process-automation-runs',   -- job name (idempotent)
  '* * * * *',                              -- every 1 minute
  $$
  SELECT net.http_post(
    url     := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/internal-crm-api',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8"}'::jsonb,
    body    := '{"action":"process_automation_runs"}'::jsonb
  );
  $$
);
