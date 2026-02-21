-- Hotfix: ensure notification settings schema exists in environments
-- where foundation migration was not fully applied.

CREATE TABLE IF NOT EXISTS public.notification_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled_notifications boolean NOT NULL DEFAULT false,
  enabled_whatsapp boolean NOT NULL DEFAULT false,
  enabled_email boolean NOT NULL DEFAULT false,
  enabled_reminders boolean NOT NULL DEFAULT true,
  whatsapp_instance_name text,
  email_recipients text[] NOT NULL DEFAULT '{}'::text[],
  daily_digest_enabled boolean NOT NULL DEFAULT false,
  weekly_digest_enabled boolean NOT NULL DEFAULT false,
  daily_digest_time time NOT NULL DEFAULT time '19:00',
  weekly_digest_time time NOT NULL DEFAULT time '18:00',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'canceled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  locked_at timestamptz,
  processed_at timestamptz,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_event_id uuid REFERENCES public.notification_events(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  destination text,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  response_payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  digest_type text NOT NULL CHECK (digest_type IN ('daily', 'weekly')),
  date_bucket date NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'sent', 'failed', 'skipped')),
  channel_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_text text,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_org_status_next
  ON public.notification_events (org_id, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_notification_events_pending
  ON public.notification_events (status, next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notification_events_created_at
  ON public.notification_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_org_created
  ON public.notification_dispatch_logs (org_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_org_dedupe
  ON public.notification_events (org_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_digest_runs_org_type_bucket
  ON public.ai_digest_runs (org_id, digest_type, date_bucket);

INSERT INTO public.notification_settings (org_id)
SELECT o.id
FROM public.organizations o
ON CONFLICT (org_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notification_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER tr_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.notification_set_updated_at();

DROP TRIGGER IF EXISTS tr_notification_events_updated_at ON public.notification_events;
CREATE TRIGGER tr_notification_events_updated_at
BEFORE UPDATE ON public.notification_events
FOR EACH ROW
EXECUTE FUNCTION public.notification_set_updated_at();

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_digest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_service_all ON public.notification_settings;
DROP POLICY IF EXISTS notifications_service_all ON public.notification_events;
DROP POLICY IF EXISTS notifications_service_all ON public.notification_dispatch_logs;
DROP POLICY IF EXISTS notifications_service_all ON public.ai_digest_runs;

CREATE POLICY notifications_service_all ON public.notification_settings
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY notifications_service_all ON public.notification_events
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY notifications_service_all ON public.notification_dispatch_logs
FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY notifications_service_all ON public.ai_digest_runs
FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS notification_settings_auth_select ON public.notification_settings;
DROP POLICY IF EXISTS notification_settings_auth_insert ON public.notification_settings;
DROP POLICY IF EXISTS notification_settings_auth_update ON public.notification_settings;

CREATE POLICY notification_settings_auth_select ON public.notification_settings
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

CREATE POLICY notification_settings_auth_insert ON public.notification_settings
FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_org(org_id));

CREATE POLICY notification_settings_auth_update ON public.notification_settings
FOR UPDATE TO authenticated
USING (public.user_belongs_to_org(org_id))
WITH CHECK (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS notification_events_auth_select ON public.notification_events;
CREATE POLICY notification_events_auth_select ON public.notification_events
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS notification_logs_auth_select ON public.notification_dispatch_logs;
CREATE POLICY notification_logs_auth_select ON public.notification_dispatch_logs
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

DROP POLICY IF EXISTS ai_digest_runs_auth_select ON public.ai_digest_runs;
CREATE POLICY ai_digest_runs_auth_select ON public.ai_digest_runs
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(org_id));

GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT SELECT ON public.notification_events TO authenticated;
GRANT SELECT ON public.notification_dispatch_logs TO authenticated;
GRANT SELECT ON public.ai_digest_runs TO authenticated;
