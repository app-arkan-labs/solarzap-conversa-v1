@echo off
echo ==========================================
echo      CORRIGINDO ENVIO DO WHATSAPP
echo ==========================================
echo.
echo 1. Configurando segredos de acesso...
call npx supabase secrets set EVOLUTION_API_URL=https://evo.arkanlabs.com.br EVOLUTION_API_KEY=eef86d79f253d5f295edcd33b578c94b
echo.

echo 2. Atualizando funcao de envio (Evolution API)...
call npx supabase functions deploy evolution-api --no-verify-jwt
echo.

echo ==========================================
echo      CONCLUIDO! TENTE ENVIAR AGORA.
echo ==========================================
pause
