UPDATE internal_crm.automation_rules
SET
  condition = jsonb_build_object('appointment_type', jsonb_build_array('call', 'meeting')),
  updated_at = now()
WHERE automation_key IN (
  'lp_form_with_schedule_confirmation',
  'call_reminder_24h',
  'call_reminder_2h',
  'call_reminder_15m',
  'admin_call_scheduled',
  'admin_call_reminder_2h',
  'admin_call_reminder_15m',
  'no_show_recovery_10m',
  'no_show_recovery_d1',
  'no_show_recovery_d3',
  'admin_no_show'
);
