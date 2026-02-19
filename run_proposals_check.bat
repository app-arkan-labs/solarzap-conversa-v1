@echo off
set SUPABASE_ACCESS_TOKEN=YOUR_SUPABASE_ACCESS_TOKEN
echo Checking proposals schema...
call npx supabase db query --project-ref ucwmcmdwbvrwotuzlmxh --file check_proposals_schema.sql > proposals_schema.txt 2>&1
type proposals_schema.txt
echo Done.
