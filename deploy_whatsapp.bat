
@echo off
set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85

echo Deploying WhatsApp Functions...

echo Deploying whatsapp-connect...
call npx supabase functions deploy whatsapp-connect --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt

echo Deploying evolution-webhook...
call npx supabase functions deploy evolution-webhook --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt

echo Deployment Complete!
