@echo off
cd /d "%~dp0"
echo ==========================================
echo INICIANDO SOLARZAP
echo ==========================================
echo.
echo Executando 'npm run dev'...
call npm run dev
echo.
echo ==========================================
echo O SERVIDOR PAROU OU OCORREU UM ERRO.
echo VERIFIQUE A MENSAGEM ACIMA.
echo ==========================================
pause
