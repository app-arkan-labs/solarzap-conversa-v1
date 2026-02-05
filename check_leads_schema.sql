
SELECT 
    column_name, 
    data_type, 
    udt_name 
FROM information_schema.columns 
WHERE table_name = 'leads' AND column_name = 'canal';

SELECT 
    conname as constraint_name, 
    pg_get_constraintdef(c.oid) as constraint_definition 
FROM pg_constraint c 
JOIN pg_namespace n ON n.oid = c.connamespace 
WHERE conrelid = 'public.leads'::regclass;
