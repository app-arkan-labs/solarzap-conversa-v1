-- P0 PHONE SYNC HOTFIX RUNBOOK
-- Replace :org_id with target organization UUID before execution.

-- =========================================
-- 1) CONTAINMENT (short window: 10-20 min)
-- =========================================
BEGIN;

-- Pause WhatsApp notification sends.
UPDATE public.notification_settings
SET enabled_whatsapp = false,
    updated_at = NOW()
WHERE org_id = :org_id;

-- Pause AI outbound on all org instances.
UPDATE public.whatsapp_instances
SET ai_enabled = false,
    updated_at = NOW()
WHERE org_id = :org_id;

-- Pause running broadcast campaigns.
UPDATE public.broadcast_campaigns
SET status = 'paused',
    updated_at = NOW()
WHERE org_id = :org_id
  AND status = 'running';

COMMIT;

-- =========================================
-- 2) PHONE BACKFILL (validate before/after)
-- =========================================
-- Use migration:
--   supabase/migrations/20260319120000_backfill_leads_phone_e164_sync.sql

-- Quick spot-check for this org after backfill:
SELECT
  id,
  nome,
  telefone,
  phone_e164
FROM public.leads
WHERE org_id = :org_id
  AND COALESCE(telefone, '') <> COALESCE(phone_e164, '')
ORDER BY id DESC
LIMIT 50;

-- =========================================
-- 3) RESUME
-- =========================================
BEGIN;

UPDATE public.notification_settings
SET enabled_whatsapp = true,
    updated_at = NOW()
WHERE org_id = :org_id;

UPDATE public.whatsapp_instances
SET ai_enabled = true,
    updated_at = NOW()
WHERE org_id = :org_id;

COMMIT;
