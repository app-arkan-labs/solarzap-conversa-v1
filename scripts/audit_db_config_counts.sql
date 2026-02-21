-- Verificando existência de valores (apenas contagem para confirmar configuração)
SELECT 'ai_settings.openai_api_key' as source, COUNT(*) as configured_count FROM ai_settings WHERE openai_api_key IS NOT NULL AND openai_api_key != '';
SELECT 'user_integrations.access_token' as source, COUNT(*) as configured_count FROM user_integrations WHERE access_token IS NOT NULL AND access_token != '';
SELECT 'whatsapp_instances.instance_token' as source, COUNT(*) as configured_count FROM whatsapp_instances WHERE instance_token IS NOT NULL AND instance_token != '';
