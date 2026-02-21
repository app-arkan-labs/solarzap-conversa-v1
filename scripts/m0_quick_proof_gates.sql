-- B2: RLS em whatsapp_webhook_events
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'whatsapp_webhook_events';
SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'whatsapp_webhook_events' AND grantee IN ('anon', 'authenticated');

-- B3: RLS nas tabelas de IA (sem USING true)
SELECT tablename, policyname, roles, cmd, qual FROM pg_policies WHERE tablename IN ('ai_settings', 'ai_stage_config', 'ai_action_logs', 'ai_agent_runs', 'ai_summaries');

-- B4: RPC Security (exemplo find_lead_by_phone)
SELECT proname, prosecdef FROM pg_proc JOIN pg_namespace n ON n.oid = pronamespace WHERE n.nspname = 'public' AND proname IN ('find_lead_by_phone', 'hard_delete_thread', 'upsert_lead_canonical');

-- B5: UNIQUE instance_name existe
SELECT conname, contype FROM pg_constraint WHERE conrelid = 'public.whatsapp_instances'::regclass AND conname = 'uq_instance_name_global';
