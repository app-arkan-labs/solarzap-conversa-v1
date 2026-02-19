@echo off
set SUPABASE_ACCESS_TOKEN=YOUR_SUPABASE_ACCESS_TOKEN

echo ----------------------------------------
echo 1. Deploying evolution-webhook (Updated)...
call npx supabase functions deploy evolution-webhook --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
echo ----------------------------------------

echo ----------------------------------------
echo 2. Deploying evolution-api (Updated)...
call npx supabase functions deploy evolution-api --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
echo ----------------------------------------

echo ----------------------------------------
echo 3. Deploying ai-pipeline-agent (Updated)...
call npx supabase functions deploy ai-pipeline-agent --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
echo ----------------------------------------

echo ----------------------------------------
echo 4. Deploying ai-reporter (Updated)...
call npx supabase functions deploy ai-reporter --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
echo ----------------------------------------

echo All Deploys Finished.
pause
