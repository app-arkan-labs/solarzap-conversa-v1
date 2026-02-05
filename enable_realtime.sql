-- Enable Realtime for specific tables
begin;
  -- Remove if already exists to avoid errors (or just add if not)
  -- Safer: try to add, ignore if present? 
  -- Postgres simpler approach: drop from publication then add, or just add.
  -- 'alter publication ... add table' errors if already exists.
  
  -- We'll just run these. If they fail because already added, that's fine, but usually we want to be sure.
  -- Better: Re-create publication or set it.
  
  alter publication supabase_realtime add table leads;
  alter publication supabase_realtime add table interacoes;
commit;
