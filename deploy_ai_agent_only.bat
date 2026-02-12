@echo off
set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85
echo Deploying ai-pipeline-agent...
call npx supabase functions deploy ai-pipeline-agent --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
echo Done.
