-- Geospatial + irradiance metadata on leads
alter table if exists public.leads
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists irradiance_source text,
  add column if not exists irradiance_ref_at timestamptz;

-- Cache for external solar resource lookups (PVGIS + geocoder fallback flow)
create table if not exists public.solar_resource_cache (
  id bigserial primary key,
  cache_key text not null unique,
  city text,
  uf text,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  source text not null check (source in ('pvgis', 'cache', 'uf_fallback')),
  annual_irradiance_kwh_m2_day numeric(8, 4) not null,
  monthly_irradiance_kwh_m2_day numeric[] not null,
  monthly_generation_factors numeric[] not null,
  reference_year integer,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solar_resource_cache_monthly_irr_len check (cardinality(monthly_irradiance_kwh_m2_day) = 12),
  constraint solar_resource_cache_monthly_factor_len check (cardinality(monthly_generation_factors) = 12)
);

create index if not exists idx_solar_resource_cache_fetched_at
  on public.solar_resource_cache (fetched_at desc);

create index if not exists idx_solar_resource_cache_city_uf
  on public.solar_resource_cache (city, uf);
