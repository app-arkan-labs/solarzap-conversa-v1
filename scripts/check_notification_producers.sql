select proname
from pg_proc
where proname in (
  'enqueue_notification_event',
  'claim_notification_events',
  'trg_notification_new_lead',
  'trg_notification_lead_stage_update',
  'trg_notification_appointment_events'
)
order by proname;

select tgname, c.relname as table_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgname in (
  'tr_notification_new_lead',
  'tr_notification_lead_stage_update',
  'tr_notification_appointment_events'
)
order by tgname;