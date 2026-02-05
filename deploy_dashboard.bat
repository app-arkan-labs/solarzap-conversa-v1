@echo off
set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85
echo Deploying Dashboard Functions...

echo Deploying reports-dashboard...
call npx supabase functions deploy reports-dashboard --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt

echo Deploying reports-export...
call npx supabase functions deploy reports-export --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt

echo Deployment Complete!
pause
