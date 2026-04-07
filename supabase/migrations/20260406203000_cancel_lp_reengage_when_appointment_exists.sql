-- Cancela runs pendentes de reengajamento da LP quando o lead ja possui
-- appointment marcada/confirmada.

UPDATE internal_crm.automation_runs r
SET
  status = 'canceled',
  processed_at = now(),
  result_payload = jsonb_build_object(
    'canceled_by_event',
    'appointment_scheduled_backfill'
  ),
  updated_at = now()
WHERE r.automation_key = 'lp_form_without_schedule_reengage_5m'
  AND r.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1
    FROM internal_crm.appointments a
    WHERE a.client_id = r.client_id
      AND a.deal_id = r.deal_id
      AND a.status IN ('scheduled', 'confirmed')
  );
