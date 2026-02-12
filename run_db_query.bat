@echo off
set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85
echo Checking ai_stage_config...
call npx supabase db query --project-ref ucwmcmdwbvrwotuzlmxh --file check_config.sql > config_output.txt 2>&1
type config_output.txt
echo Done.
