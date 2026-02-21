SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('leads', 'whatsapp_instances') 
AND column_name IN ('user_id', 'created_by', 'owner_id');

SELECT proname, prosrc 
FROM pg_proc 
JOIN pg_namespace n ON n.oid = pronamespace 
WHERE n.nspname = 'public' 
AND proname LIKE '%profile%';
