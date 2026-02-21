SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_name IN ('interacoes', 'propostas', 'appointments', 'deals', 'lead_stage_history', 'comentarios_leads', 'leads', 'whatsapp_instances') 
AND column_name IN ('user_id', 'created_by');
