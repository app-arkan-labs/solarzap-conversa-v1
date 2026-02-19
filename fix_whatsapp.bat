@echo off
echo ==========================================
echo      CORRIGINDO ENVIO DO WHATSAPP
echo ==========================================
echo.
echo 1. Configurando segredos de acesso...
REM IMPORTANT: FORCE_SIMULATED_TRANSPORT=true makes the AI agent write messages to the CRM
REM but NOT send anything to WhatsApp. Keep it false for production sending.
call npx supabase secrets set EVOLUTION_API_URL=https://evo.arkanlabs.com.br EVOLUTION_API_KEY=YOUR_EVOLUTION_API_KEY FORCE_SIMULATED_TRANSPORT=false
echo.

echo 2. Atualizando funcao de envio (Evolution API)...
call npx supabase functions deploy evolution-api --no-verify-jwt
echo.

echo 3. Atualizando agente de IA (ai-pipeline-agent)...
call npx supabase functions deploy ai-pipeline-agent --no-verify-jwt
echo.

echo ==========================================
echo      CONCLUIDO! TENTE ENVIAR AGORA.
echo ==========================================
pause
