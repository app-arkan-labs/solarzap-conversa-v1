@echo off
set SUPABASE_ACCESS_TOKEN=YOUR_SUPABASE_ACCESS_TOKEN
echo Setting secrets...
REM FORCE_SIMULATED_TRANSPORT=true makes the AI agent log messages in the CRM but NOT send via WhatsApp.
call npx supabase secrets set EVOLUTION_API_URL=https://evo.arkanlabs.com.br EVOLUTION_API_KEY=YOUR_EVOLUTION_API_KEY RESEND_API_KEY=YOUR_RESEND_API_KEY RESEND_FROM_EMAIL="SolarZap <notificacoes@resend.dev>" EDGE_INTERNAL_API_KEY=YOUR_EDGE_INTERNAL_API_KEY FORCE_SIMULATED_TRANSPORT=false --project-ref ucwmcmdwbvrwotuzlmxh
echo Done.
