-- Verificando tabelas core e presença de org_id/user_id
SELECT table_name, 
       EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_name = t.table_name AND c2.column_name = 'org_id') as has_org_id,
       EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_name = t.table_name AND c2.column_name = 'user_id') as has_user_id,
       EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_name = t.table_name AND c2.column_name = 'company_id') as has_company_id
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN ('leads', 'interacoes', 'whatsapp_instances', 'propostas', 'appointments', 'deals', 'lead_stage_history', 'comentarios_leads', 'ai_settings', 'ai_stage_config', 'ai_agent_runs', 'ai_summaries');

-- Verificando tipos de dados se company_id existir
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('ai_settings', 'ai_stage_config', 'ai_agent_runs', 'ai_summaries') 
  AND column_name = 'company_id';
