@echo off
setlocal

if "%SUPABASE_ACCESS_TOKEN%"=="" (
  echo ERROR: SUPABASE_ACCESS_TOKEN is not set.
  echo Set SUPABASE_ACCESS_TOKEN before running this script.
  exit /b 1
)

echo Checking ai_stage_config...
call npx supabase db query --project-ref ucwmcmdwbvrwotuzlmxh --file check_config.sql > config_output.txt 2>&1
if errorlevel 1 (
  type config_output.txt
  exit /b 1
)

type config_output.txt
echo Done.
