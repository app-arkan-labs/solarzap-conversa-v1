@echo off
set SUPABASE_ACCESS_TOKEN=sbp_40bff86a03226780255872224ab05d365ff85d85
echo Setting secrets...
call npx supabase secrets set EVOLUTION_API_URL=https://evo.arkanlabs.com.br EVOLUTION_API_KEY=eef86d79f253d5f295edcd33b578c94b --project-ref ucwmcmdwbvrwotuzlmxh
echo Done.
