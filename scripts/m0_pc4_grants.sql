SELECT grantee, privilege_type FROM information_schema.routine_privileges WHERE routine_schema='public' AND routine_name='claim_due_reminders';
