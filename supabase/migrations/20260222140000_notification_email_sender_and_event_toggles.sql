-- ============================================================
-- Migration: Email sender config + event-type toggles
-- Adds per-org email branding (sender name, reply-to)
-- and per-event-type enable/disable toggles.
-- ============================================================

-- ── Email sender fields ──
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS email_sender_name text,
  ADD COLUMN IF NOT EXISTS email_reply_to    text;

COMMENT ON COLUMN public.notification_settings.email_sender_name
  IS 'Display name shown in From header, e.g. "Solar Corp Energia"';
COMMENT ON COLUMN public.notification_settings.email_reply_to
  IS 'Reply-To email so responses reach the client, e.g. contato@minhaempresa.com.br';

-- ── Event-type toggles (all default true — every event is produced) ──
ALTER TABLE public.notification_settings
  ADD COLUMN IF NOT EXISTS evt_novo_lead           boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evt_stage_changed       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evt_visita_agendada     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evt_visita_realizada    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evt_chamada_agendada    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evt_chamada_realizada   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS evt_financiamento_update boolean NOT NULL DEFAULT true;
