@echo off
set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85
call npx supabase functions deploy whatsapp-connect --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
