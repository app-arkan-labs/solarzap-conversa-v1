-- Corrige o trigger da confirmacao de agendamento para o evento real do booking
-- e preserva a automacao de reengajamento para leads sem horario.

UPDATE internal_crm.automation_rules
SET
  trigger_event = 'appointment_scheduled',
  condition = '{"appointment_type":"call"}'::jsonb,
  delay_minutes = 0,
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{schedule_anchor}',
    '"event_time"'::jsonb,
    true
  ),
  updated_at = now()
WHERE automation_key = 'lp_form_with_schedule_confirmation';

UPDATE internal_crm.automation_rules
SET
  cancel_on_event_types = ARRAY['appointment_scheduled', 'appointment_canceled']::text[],
  updated_at = now()
WHERE automation_key = 'lp_form_with_schedule_confirmation';
