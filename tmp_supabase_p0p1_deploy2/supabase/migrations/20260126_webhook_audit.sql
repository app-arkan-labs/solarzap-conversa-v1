create table if not exists public.whatsapp_webhook_events (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  instance_name text null,
  event text null,
  path text null,
  headers jsonb null,
  payload jsonb null
);

create index if not exists idx_whatsapp_webhook_events_received_at
  on public.whatsapp_webhook_events (received_at desc);

-- Grant permissions
grant all on public.whatsapp_webhook_events to service_role;
grant insert, select on public.whatsapp_webhook_events to anon; -- If public function
grant insert, select on public.whatsapp_webhook_events to authenticated;
