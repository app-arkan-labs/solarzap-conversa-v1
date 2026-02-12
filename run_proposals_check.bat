@echo off
set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85
echo Checking proposals schema...
call npx supabase db query --project-ref ucwmcmdwbvrwotuzlmxh --file check_proposals_schema.sql > proposals_schema.txt 2>&1
type proposals_schema.txt
echo Done.
