-- Add fixed WhatsApp recipients for internal notification dispatch
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS whatsapp_recipients text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.notification_settings.whatsapp_recipients
  IS 'Internal team WhatsApp numbers that should receive operational notifications (comma list in UI)';
