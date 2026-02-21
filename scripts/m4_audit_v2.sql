SELECT 
    jsonb_build_object(
        'columns', (SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leads' AND column_name IN ('org_id', 'user_id', 'assigned_to_user_id')) c),
        'policies', (SELECT jsonb_agg(to_jsonb(p)) FROM (SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE tablename = 'leads') p)
    ) as audit_data;
