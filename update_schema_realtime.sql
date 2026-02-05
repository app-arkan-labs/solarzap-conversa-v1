
-- 1. Add column to track manual name changes
alter table public.leads 
add column if not exists name_manually_changed boolean default false;

-- 2. Force enable Realtime Replication for critical tables
begin;
  -- Remove tables from publication first to ensure clean state (ignoring errors if not present)
  -- drop publication if exists supabase_realtime; -- Too destructive
  -- create publication supabase_realtime for table leads, interacoes; -- Standard way if not exists
  
  -- Supabase specific: usually 'supabase_realtime' exists. We just add tables.
  alter publication supabase_realtime add table leads;
  alter publication supabase_realtime add table interacoes;
commit;
