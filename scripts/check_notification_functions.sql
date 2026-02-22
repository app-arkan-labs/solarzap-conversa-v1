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