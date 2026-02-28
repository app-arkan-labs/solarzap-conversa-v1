-- Proposal sizing and utility-specific technical fields on leads
-- Safe to run multiple times due IF NOT EXISTS.

alter table if exists public.leads
  add column if not exists uf text,
  add column if not exists concessionaria text,
  add column if not exists tipo_ligacao text check (tipo_ligacao in ('monofasico', 'bifasico', 'trifasico')),
  add column if not exists tarifa_kwh numeric(10, 4),
  add column if not exists custo_disponibilidade_kwh numeric(10, 2),
  add column if not exists performance_ratio numeric(6, 4),
  add column if not exists preco_por_kwp numeric(12, 2),
  add column if not exists abater_custo_disponibilidade_no_dimensionamento boolean default false;
