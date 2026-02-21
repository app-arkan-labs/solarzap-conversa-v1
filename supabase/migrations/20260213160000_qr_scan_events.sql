-- QR scan events for call flow auto-advance.
-- A phone opening the QR URL inserts a row here; the desktop listens via Realtime and advances the modal.

create table if not exists public.qr_scan_events (
  id bigserial primary key,
  token text not null,
  method text not null check (method in ('tel', 'whatsapp')),
  scanned_at timestamptz not null default now()
);

create index if not exists qr_scan_events_token_idx on public.qr_scan_events (token);

alter table public.qr_scan_events enable row level security;

-- Grants (required in addition to RLS policies)
grant all on public.qr_scan_events to service_role;
grant insert on public.qr_scan_events to anon, authenticated;
grant select on public.qr_scan_events to authenticated;
grant usage, select on sequence public.qr_scan_events_id_seq to anon, authenticated, service_role;

do $$
begin
  -- Anyone can insert (incl. anon). Row contains no PII, only an ephemeral token + method.
  create policy "qr_scan_events_insert_anon"
    on public.qr_scan_events
    for insert
    to anon, authenticated
    with check (true);
exception
  when duplicate_object then null;
end $$;

do $$
begin
  -- Authenticated users can read (required for Realtime subscriptions).
  create policy "qr_scan_events_select_authenticated"
    on public.qr_scan_events
    for select
    to authenticated
    using (true);
exception
  when duplicate_object then null;
end $$;

-- Enable Realtime on this table (safe if already added).
do $$
begin
  alter publication supabase_realtime add table public.qr_scan_events;
exception
  when duplicate_object then null;
end $$;
