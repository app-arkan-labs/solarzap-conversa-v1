-- Drop the existing constraint if it exists (we need to know the name, assuming generic or will check)
-- This approach attempts to find the constraint name dynamically or drop known potential names
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'interacoes' 
          AND constraint_type = 'FOREIGN KEY'
    ) LOOP
        -- We can't easily check which column it points to in this simple loop without more complex joins using information_schema
        -- Instead, we will try to identify the constraint specifically for lead_id in `interacoes` referencing `leads`
        NULL;
    END LOOP;
END $$;

-- More robust approach:
-- 1. Alter table to drop the constraint on lead_id (we assume standard naming or we recreate)
-- Since we don't know the exact name, we might need to query it first.
-- However, for this script, we'll try the standard naming convention or Force update.

-- Let's try to remove any FK related to lead_id on interacoes and add a new one with CASCADE
ALTER TABLE interacoes 
  DROP CONSTRAINT IF EXISTS interacoes_lead_id_fkey,
  DROP CONSTRAINT IF EXISTS leads_id_fk,  -- common variations
  DROP CONSTRAINT IF EXISTS fk_lead;

-- If the constraint name is unknown, we can try to rely on Supabase/Postgres logic or run a specific query in the browser first.
-- But standard Supabase gen is often `table_column_fkey`.
-- Let's assume `interacoes_lead_id_fkey`.

ALTER TABLE interacoes
  ADD CONSTRAINT interacoes_lead_id_fkey
  FOREIGN KEY (lead_id)
  REFERENCES leads(id)
  ON DELETE CASCADE;

-- Also verify if there are other tables like `leads_comments` that need cascading
-- If `comentarios_leads` exists:
ALTER TABLE IF EXISTS comentarios_leads
  DROP CONSTRAINT IF EXISTS comentarios_leads_lead_id_fkey;

ALTER TABLE IF EXISTS comentarios_leads
  ADD CONSTRAINT comentarios_leads_lead_id_fkey
  FOREIGN KEY (lead_id)
  REFERENCES leads(id)
  ON DELETE CASCADE;
