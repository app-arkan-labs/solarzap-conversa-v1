-- Corrige runs de confirmacao imediata que foram agendadas para o horario
-- da chamada em vez de serem disparadas no momento do booking.

UPDATE internal_crm.automation_runs
SET
  scheduled_at = now(),
  updated_at = now(),
  last_error = null
WHERE automation_key = 'lp_form_with_schedule_confirmation'
  AND status = 'pending'
  AND scheduled_at > now();
