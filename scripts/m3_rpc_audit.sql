-- M3 RPC Audit: Detect functions that might need hardening
SELECT proname, proargnames 
FROM pg_proc 
JOIN pg_namespace n ON n.oid = pronamespace 
WHERE n.nspname = 'public' 
AND (proargnames::text ILIKE '%org_id%' OR proargnames::text ILIKE '%company_id%');
