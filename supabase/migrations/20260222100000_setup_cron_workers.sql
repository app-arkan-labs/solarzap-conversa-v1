-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Cron jobs run only when the destination and bearer exist in the target project Vault.
CREATE OR REPLACE FUNCTION public.solarzap_enqueue_worker(
  p_function text, p_body jsonb, p_token_secret text DEFAULT 'solarzap_worker_bearer'
) RETURNS bigint
LANGUAGE sql
SET search_path = ''
AS $worker$
  SELECT net.http_post(
    url := rtrim(endpoint.decrypted_secret, '/') || '/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || token.decrypted_secret,
      'apikey', token.decrypted_secret
    ),
    body := p_body
  )
  FROM vault.decrypted_secrets AS endpoint
  CROSS JOIN vault.decrypted_secrets AS token
  WHERE endpoint.name = 'solarzap_functions_url'
    AND token.name = p_token_secret
    AND nullif(endpoint.decrypted_secret, '') IS NOT NULL
    AND nullif(token.decrypted_secret, '') IS NOT NULL;
$worker$;

REVOKE ALL ON FUNCTION public.solarzap_enqueue_worker(text, jsonb, text) FROM PUBLIC, anon, authenticated;

-- Schedule ai-digest-worker every 15 minutes
-- The worker itself checks org timezones and configured digest times
SELECT cron.schedule(
  'invoke-ai-digest-worker',
  '*/15 * * * *',
  $$
  SELECT
    public.solarzap_enqueue_worker('ai-digest-worker', '{"source":"cron"}'::jsonb) AS request_id;
  $$
);

-- Schedule notification-worker every 2 minutes to process pending events
SELECT cron.schedule(
  'invoke-notification-worker',
  '*/2 * * * *',
  $$
  SELECT
    public.solarzap_enqueue_worker('notification-worker', '{"source":"cron"}'::jsonb) AS request_id;
  $$
);
