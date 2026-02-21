@echo off
echo ==========================================
echo   RESUMINDO ENVIO DO AGENTE (WHATSAPP)
echo ==========================================
echo.

set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85

echo 1. Desativando modo simulacao (FORCE_SIMULATED_TRANSPORT=false)...
call npx supabase secrets set FORCE_SIMULATED_TRANSPORT=false --project-ref ucwmcmdwbvrwotuzlmxh
echo.

echo 2. Re-deploy do ai-pipeline-agent...
call npx supabase functions deploy ai-pipeline-agent --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
echo.

echo Concluido. Novas respostas do agente devem voltar a ser enviadas no WhatsApp.
pause

