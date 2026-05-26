-- Isola o transporte de notificacoes internas do transporte de automacoes/IA.
-- Mantem compatibilidade: preenche o novo campo com o valor legado quando vazio.

ALTER TABLE internal_crm.automation_settings
  ADD COLUMN IF NOT EXISTS internal_notification_whatsapp_instance_id uuid
  REFERENCES internal_crm.whatsapp_instances(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN internal_crm.automation_settings.internal_notification_whatsapp_instance_id
  IS 'Instancia dedicada para notificacoes internas (SolarZap > aba Notificacoes).';

UPDATE internal_crm.automation_settings
SET internal_notification_whatsapp_instance_id = default_whatsapp_instance_id
WHERE internal_notification_whatsapp_instance_id IS NULL
  AND default_whatsapp_instance_id IS NOT NULL;
