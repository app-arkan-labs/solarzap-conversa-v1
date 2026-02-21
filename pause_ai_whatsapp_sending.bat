@echo off
echo ==========================================
echo   PAUSANDO ENVIO DO AGENTE (WHATSAPP)
echo ==========================================
echo.
echo ATENCAO: Isso faz o agente continuar respondendo no CRM,
echo mas NAO vai enviar mensagens de fato no WhatsApp.
echo.

set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85

echo 1. Ativando modo simulacao (FORCE_SIMULATED_TRANSPORT=true)...
call npx supabase secrets set FORCE_SIMULATED_TRANSPORT=true --project-ref ucwmcmdwbvrwotuzlmxh
echo.

echo 2. Re-deploy do ai-pipeline-agent...
call npx supabase functions deploy ai-pipeline-agent --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
echo.

echo Concluido. O agente nao enviara mensagens no WhatsApp ate voce reativar.
pause

