-- M4 Schema Audit: Detect current state of leads table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'leads' 
  AND column_name IN ('org_id', 'user_id', 'assigned_to_user_id');

-- Check current policies on leads
SELECT policyname, cmd, roles, qual, with_check 
FROM pg_policies 
WHERE tablename = 'leads';

-- Verify helper function from M3
SELECT count(*) 
FROM pg_proc 
WHERE proname = 'user_belongs_to_org';
