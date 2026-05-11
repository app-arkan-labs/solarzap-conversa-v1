-- CRM interno: corrige automacoes de agendamento para evitar lembretes
-- imediatos indevidos, remove link de agendamento inexistente dos templates
-- ao lead e prepara runs pendentes para renderizarem os novos textos.

UPDATE internal_crm.automation_rules
SET
  template = CASE automation_key
    WHEN 'lp_form_without_schedule_reengage_5m'
      THEN 'Oi, {{nome}}. Vi seu cadastro por aqui. Para eu entender seu cenario e te orientar melhor, me diz um bom horario para uma chamada rapida hoje ou amanha?'
    WHEN 'lp_form_with_schedule_confirmation'
      THEN 'Perfeito, {{nome}}. Sua chamada ficou marcada para {{data_hora}}. Perto do horario eu te chamo por aqui, combinado?'
    WHEN 'call_reminder_24h'
      THEN 'Passando para confirmar nossa chamada de amanha as {{hora}}. Continua bom para voce?'
    WHEN 'call_reminder_2h'
      THEN 'Oi, {{nome}}. Nossa chamada e hoje as {{hora}}. Tudo certo por ai?'
    WHEN 'call_reminder_15m'
      THEN 'Estamos quase no horario da nossa chamada. Te chamo em alguns minutos por aqui.'
    WHEN 'no_show_recovery_10m'
      THEN 'Oi, {{nome}}. Acho que aconteceu algum imprevisto na chamada. Se ainda fizer sentido, me diz um horario melhor para retomarmos.'
    WHEN 'no_show_recovery_d1'
      THEN 'Oi, {{nome}}. Passando rapidinho para saber se voce ainda quer que eu te ajude com isso. Melhor retomar hoje ou deixar para outro dia?'
    WHEN 'no_show_recovery_d3'
      THEN 'Vou te deixar tranquilo por aqui. Quando fizer sentido retomar, me responde e eu pego o contexto de novo.'
    ELSE template
  END,
  updated_at = now()
WHERE is_system = true
  AND channel = 'whatsapp_lead'
  AND automation_key IN (
    'lp_form_without_schedule_reengage_5m',
    'lp_form_with_schedule_confirmation',
    'call_reminder_24h',
    'call_reminder_2h',
    'call_reminder_15m',
    'no_show_recovery_10m',
    'no_show_recovery_d1',
    'no_show_recovery_d3'
  );

UPDATE internal_crm.automation_rules
SET
  trigger_event = 'appointment_scheduled',
  condition = jsonb_build_object('appointment_type', jsonb_build_array('call', 'meeting')),
  delay_minutes = 0,
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{schedule_anchor}',
    '"event_time"'::jsonb,
    true
  ),
  cancel_on_event_types = ARRAY['appointment_canceled']::text[],
  updated_at = now()
WHERE is_system = true
  AND automation_key = 'lp_form_with_schedule_confirmation';

UPDATE internal_crm.automation_rules
SET
  template = regexp_replace(template, '\s*:?\s*\{\{link_agendamento\}\}', '', 'gi'),
  updated_at = now()
WHERE is_system = true
  AND channel = 'whatsapp_lead'
  AND template ILIKE '%{{link_agendamento}}%';

UPDATE internal_crm.automation_runs
SET
  payload = (payload - 'template_body') || jsonb_build_object(
    'template_migrated_at', now(),
    'template_migration', '20260511100000_internal_crm_automation_schedule_name_templates'
  ),
  updated_at = now()
WHERE status = 'pending'
  AND automation_key IN (
    'lp_form_without_schedule_reengage_5m',
    'lp_form_with_schedule_confirmation',
    'call_reminder_24h',
    'call_reminder_2h',
    'call_reminder_15m',
    'no_show_recovery_10m',
    'no_show_recovery_d1',
    'no_show_recovery_d3'
  );

WITH reminder_offsets(automation_key, delay_minutes) AS (
  VALUES
    ('call_reminder_24h', -1440),
    ('call_reminder_2h', -120),
    ('call_reminder_15m', -15),
    ('admin_call_reminder_2h', -120),
    ('admin_call_reminder_15m', -15)
),
stale_runs AS (
  SELECT r.id
  FROM internal_crm.automation_runs r
  JOIN reminder_offsets o ON o.automation_key = r.automation_key
  JOIN internal_crm.appointments a ON a.id = r.appointment_id
  WHERE r.status IN ('pending', 'processing')
    AND (a.start_at + (o.delay_minutes * interval '1 minute')) <= (COALESCE(r.created_at, now()) + interval '5 seconds')
)
UPDATE internal_crm.automation_runs r
SET
  status = 'canceled',
  processed_at = now(),
  result_payload = COALESCE(r.result_payload, '{}'::jsonb) || jsonb_build_object(
    'canceled_by_migration', '20260511100000_internal_crm_automation_schedule_name_templates',
    'reason', 'reminder_due_before_run_creation'
  ),
  updated_at = now()
FROM stale_runs s
WHERE r.id = s.id;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY automation_key, appointment_id, scheduled_at
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM internal_crm.automation_runs
  WHERE status = 'pending'
    AND appointment_id IS NOT NULL
    AND automation_key IN (
      'lp_form_with_schedule_confirmation',
      'call_reminder_24h',
      'call_reminder_2h',
      'call_reminder_15m',
      'admin_call_reminder_2h',
      'admin_call_reminder_15m'
    )
)
UPDATE internal_crm.automation_runs r
SET
  status = 'canceled',
  processed_at = now(),
  result_payload = COALESCE(r.result_payload, '{}'::jsonb) || jsonb_build_object(
    'canceled_by_migration', '20260511100000_internal_crm_automation_schedule_name_templates',
    'reason', 'duplicate_pending_automation_run'
  ),
  updated_at = now()
FROM ranked d
WHERE r.id = d.id
  AND d.rn > 1;

