UPDATE internal_crm.automation_rules
SET
  template = trim(both from coalesce(template, '')) || E'\n\nEscolhe por aqui: {{link_agendamento}}',
  updated_at = now()
WHERE automation_key = 'lp_form_without_schedule_reengage_5m'
  AND (
    template IS NULL
    OR template NOT ILIKE '%{{link_agendamento}}%'
  );
