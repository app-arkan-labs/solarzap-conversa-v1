-- M0 PRECHECK 1: Duplicate instance_name (must return 0 rows)
SELECT 'PRECHECK_DUPLICATES' AS check_name, instance_name, COUNT(*) AS cnt
FROM public.whatsapp_instances
GROUP BY instance_name
HAVING COUNT(*) > 1;

-- M0 PRECHECK 2: created_by column existence in KB tables
SELECT 'PRECHECK_CREATED_BY' AS check_name, table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('kb_items','testimonials','kb_assets','asset_annotations','company_profile','objection_responses')
  AND column_name = 'created_by'
ORDER BY table_name;

-- M0 PRECHECK 3: Existing policies on target tables (audit before change)
SELECT 'PRECHECK_POLICIES' AS check_name, tablename, policyname, cmd, qual
FROM pg_policies
WHERE tablename IN (
  'whatsapp_webhook_events','ai_settings','ai_stage_config',
  'ai_action_logs','ai_agent_runs','ai_summaries',
  'kb_items','testimonials','kb_assets','asset_annotations',
  'company_profile','objection_responses'
)
ORDER BY tablename, policyname;

-- M0 PRECHECK 4: Existing UNIQUE constraints on whatsapp_instances
SELECT 'PRECHECK_UNIQUE' AS check_name, conname, contype
FROM pg_constraint
WHERE conrelid = 'public.whatsapp_instances'::regclass
  AND contype = 'u';

-- M0 PRECHECK 5: Current GRANTS on claim_due_reminders
SELECT 'PRECHECK_GRANTS' AS check_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'claim_due_reminders';
