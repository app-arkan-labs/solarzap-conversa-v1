create table if not exists public.solar_resource_events (
  id bigserial primary key,
  request_id text not null,
  lead_id bigint,
  org_id uuid,
  error_code text,
  phase text not null check (phase in ('auth', 'geocode', 'pvgis', 'cache', 'unexpected')),
  zip text,
  city text,
  uf text,
  lat numeric(9, 6),
  lon numeric(9, 6),
  pvgis_base text,
  upstream_status integer,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  created_at timestamptz not null default now(),
  constraint solar_resource_events_error_code_check check (
    error_code is null or error_code in (
      'unauthorized',
      'geocode_failed',
      'geocode_provider_unavailable',
      'geocode_low_confidence',
      'pvgis_unavailable',
      'upstream_rate_limited',
      'upstream_timeout',
      'upstream_http_error',
      'unexpected_error'
    )
  )
);

create index if not exists idx_solar_resource_events_created_at
  on public.solar_resource_events (created_at desc);

create index if not exists idx_solar_resource_events_error_code_created_at
  on public.solar_resource_events (error_code, created_at desc);

create index if not exists idx_solar_resource_events_phase_created_at
  on public.solar_resource_events (phase, created_at desc);

create index if not exists idx_solar_resource_events_org_created_at
  on public.solar_resource_events (org_id, created_at desc);

create index if not exists idx_solar_resource_events_request_id
  on public.solar_resource_events (request_id);

alter table public.solar_resource_events enable row level security;
