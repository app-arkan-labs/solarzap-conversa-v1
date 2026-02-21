-- Verificando RPCs que podem precisar de endurecimento
SELECT proname, proargnames, prosrc
FROM pg_proc 
JOIN pg_namespace n ON n.oid = pronamespace 
WHERE n.nspname = 'public' 
AND (prosrc ILIKE '%org_id%' OR proargnames::text ILIKE '%org_id%');

-- Verificando policies atuais das tabelas core e AI para backup preliminar
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies 
WHERE tablename IN (
    'leads', 'interacoes', 'whatsapp_instances', 'propostas', 'appointments', 
    'deals', 'lead_stage_history', 'comentarios_leads',
    'ai_settings', 'ai_stage_config', 'ai_agent_runs', 'ai_summaries', 'ai_action_logs'
);
