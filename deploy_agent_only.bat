@echo off
set SUPABASE_ACCESS_TOKEN=YOUR_SUPABASE_ACCESS_TOKEN
call npx supabase functions deploy ai-pipeline-agent --project-ref ucwmcmdwbvrwotuzlmxh --no-verify-jwt
