-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule ai-digest-worker every 15 minutes
-- The worker itself checks org timezones and configured digest times
SELECT cron.schedule(
  'invoke-ai-digest-worker',
  '*/15 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/ai-digest-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8'
      ),
      body := '{"source":"cron"}'::jsonb
    ) AS request_id;
  $$
);

-- Schedule notification-worker every 2 minutes to process pending events
SELECT cron.schedule(
  'invoke-notification-worker',
  '*/2 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/notification-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8'
      ),
      body := '{"source":"cron"}'::jsonb
    ) AS request_id;
  $$
);
