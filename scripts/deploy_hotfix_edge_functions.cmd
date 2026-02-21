@echo off
setlocal

if "%SUPABASE_ACCESS_TOKEN%"=="" (
  echo [ERROR] SUPABASE_ACCESS_TOKEN nao definido.
  echo Defina: set SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxx
  exit /b 1
)

set PROJECT_REF=ucwmcmdwbvrwotuzlmxh

echo [1/6] Deploy evolution-webhook...
cmd /c npx --yes supabase functions deploy evolution-webhook --project-ref %PROJECT_REF% --no-verify-jwt
if errorlevel 1 exit /b 1

echo [2/6] Deploy whatsapp-webhook...
cmd /c npx --yes supabase functions deploy whatsapp-webhook --project-ref %PROJECT_REF% --no-verify-jwt
if errorlevel 1 exit /b 1

echo [3/6] Deploy evolution-proxy...
cmd /c npx --yes supabase functions deploy evolution-proxy --project-ref %PROJECT_REF% --no-verify-jwt
if errorlevel 1 exit /b 1

echo [4/6] Deploy whatsapp-connect...
cmd /c npx --yes supabase functions deploy whatsapp-connect --project-ref %PROJECT_REF%
if errorlevel 1 exit /b 1

echo [5/6] Deploy notification-worker...
cmd /c npx --yes supabase functions deploy notification-worker --project-ref %PROJECT_REF% --no-verify-jwt
if errorlevel 1 exit /b 1

echo [6/6] Deploy ai-digest-worker...
cmd /c npx --yes supabase functions deploy ai-digest-worker --project-ref %PROJECT_REF% --no-verify-jwt
if errorlevel 1 exit /b 1

echo [OK] Deploy concluido.
exit /b 0
