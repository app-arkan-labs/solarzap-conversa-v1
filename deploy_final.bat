@echo off
set SUPABASE_ACCESS_TOKEN=YOUR_SUPABASE_ACCESS_TOKEN
echo Deploying evolution-webhook (Final)...
call npx supabase functions deploy evolution-webhook --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
echo Done.
