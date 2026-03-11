$ErrorActionPreference = "Continue"
$SUPABASE_URL = "https://ucwmcmdwbvrwotuzlmxh.supabase.co"
$SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8"
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMzkyMTEsImV4cCI6MjA4MzYxNTIxMX0.KMk4XqFCm4FkvOZg7LNWaI_4lknMwcdCkYSGjBjDdOg"
$ACCESS_TOKEN = "sbp_c0582b1b87bfca0867632f521082d84f147e8281"
$ORG_ID = "70d3af46-37f6-4ff4-a6f6-4cebd6341129"

Write-Host "===== SOLARZAP FINAL SMOKE TESTS ====="
Write-Host ""

# Login
$login = Invoke-WebRequest -Uri "$SUPABASE_URL/auth/v1/token?grant_type=password" `
  -Method POST `
  -Headers @{ "apikey" = $ANON_KEY; "Content-Type" = "application/json" } `
  -Body '{"email":"rodrigosenafernandes@gmail.com","password":"AtsWp@3fB&"}' `
  -UseBasicParsing
$JWT = ($login.Content | ConvertFrom-Json).access_token
Write-Host "[OK] JWT obtained"

$pass = 0; $fail = 0; $info = 0

function Invoke-MgmtQuery {
  param([string]$Query)

  $body = @{ query = $Query } | ConvertTo-Json -Depth 5
  $resp = Invoke-WebRequest -Uri "https://api.supabase.com/v1/projects/ucwmcmdwbvrwotuzlmxh/database/query" `
    -Method POST `
    -Headers @{ "Authorization" = "Bearer $ACCESS_TOKEN"; "Content-Type" = "application/json" } `
    -Body $body `
    -UseBasicParsing

  return ($resp.Content | ConvertFrom-Json)
}

# T01: DB connectivity + ai_enabled
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/leads?select=id,ai_enabled&limit=3" `
    -Headers @{ "apikey" = $SERVICE_KEY; "Authorization" = "Bearer $SERVICE_KEY" } -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  Write-Host "[PASS] T01 DB+ai_enabled ($($d.Count) rows)"; $pass++
} catch { Write-Host "[FAIL] T01 DB+ai_enabled: $_"; $fail++ }

# T02: JWT auth leads
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/leads?select=id&limit=5" `
    -Headers @{ "apikey" = $ANON_KEY; "Authorization" = "Bearer $JWT" } -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  Write-Host "[PASS] T02 JWT-auth leads ($($d.Count) rows)"; $pass++
} catch { Write-Host "[FAIL] T02 JWT-auth: $_"; $fail++ }

# T03: Unauthenticated RLS
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/leads?select=id&limit=5" `
    -Headers @{ "apikey" = $ANON_KEY; "Authorization" = "Bearer $ANON_KEY" } -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  if ($d.Count -eq 0) { Write-Host "[PASS] T03 Unauth RLS (0 rows)"; $pass++ }
  else { Write-Host "[FAIL] T03 Unauth RLS got $($d.Count) rows"; $fail++ }
} catch { Write-Host "[FAIL] T03 Unauth: $_"; $fail++ }

# T04: Webhook no secret
try {
  Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/whatsapp-webhook" -Method POST `
    -Headers @{ "Content-Type" = "application/json" } -Body '{}' -UseBasicParsing | Out-Null
  Write-Host "[FAIL] T04 Webhook no-secret (expected 401)"; $fail++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 401) { Write-Host "[PASS] T04 Webhook no-secret (401)"; $pass++ }
  else { Write-Host "[FAIL] T04 Webhook no-secret ($code)"; $fail++ }
}

# T05: Webhook wrong secret
try {
  Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/whatsapp-webhook" -Method POST `
    -Headers @{ "Content-Type" = "application/json"; "x-webhook-secret" = "wrong" } -Body '{}' -UseBasicParsing | Out-Null
  Write-Host "[FAIL] T05 Webhook bad-secret (expected 401)"; $fail++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 401) { Write-Host "[PASS] T05 Webhook bad-secret (401)"; $pass++ }
  else { Write-Host "[FAIL] T05 Webhook bad-secret ($code)"; $fail++ }
}

# T06: evolution-proxy (user JWT)
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/evolution-proxy" -Method POST `
    -Headers @{ "Authorization" = "Bearer $JWT"; "Content-Type" = "application/json" } `
    -Body '{"path":"/instance/fetchInstances"}' -UseBasicParsing
  Write-Host "[PASS] T06 evolution-proxy ($($r.StatusCode))"; $pass++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 400) { Write-Host "[INFO] T06 evolution-proxy (400 - external API issue)"; $info++ }
  else { Write-Host "[FAIL] T06 evolution-proxy ($code)"; $fail++ }
}

# T07: proposal-context-engine (user JWT)
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/proposal-context-engine" -Method POST `
    -Headers @{ "Authorization" = "Bearer $JWT"; "Content-Type" = "application/json" } `
    -Body "{`"leadId`":481,`"orgId`":`"$ORG_ID`"}" -UseBasicParsing
  Write-Host "[PASS] T07 proposal-context-engine ($($r.StatusCode))"; $pass++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "[FAIL] T07 proposal-context-engine ($code)"; $fail++
}

# T08: ai-pipeline-agent (service_role)
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/ai-pipeline-agent" -Method POST `
    -Headers @{ "Authorization" = "Bearer $SERVICE_KEY"; "Content-Type" = "application/json" } `
    -Body "{`"leadId`":481,`"orgId`":`"$ORG_ID`",`"text`":`"Oi quero um orcamento`"}" -UseBasicParsing
  Write-Host "[PASS] T08 ai-pipeline-agent ($($r.StatusCode))"; $pass++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "[FAIL] T08 ai-pipeline-agent ($code)"; $fail++
}

# T09: notification-worker
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/notification-worker" -Method POST `
    -Headers @{ "Authorization" = "Bearer $SERVICE_KEY"; "Content-Type" = "application/json" } `
    -Body '{}' -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  Write-Host "[PASS] T09 notification-worker (claimed:$($d.claimed), processed:$($d.processed), failed:$($d.failed))"; $pass++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "[FAIL] T09 notification-worker ($code)"; $fail++
}

# T10: list_proposals RPC (service_role)
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/rpc/list_proposals" -Method POST `
    -Headers @{ "apikey" = $SERVICE_KEY; "Authorization" = "Bearer $SERVICE_KEY"; "Content-Type" = "application/json" } `
    -Body "{`"p_org_id`":`"$ORG_ID`"}" -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  Write-Host "[PASS] T10 list_proposals service_role ($($d.Count) rows)"; $pass++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "[FAIL] T10 list_proposals service_role ($code)"; $fail++
}

# T11: list_proposals RPC (user JWT)
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/rpc/list_proposals" -Method POST `
    -Headers @{ "apikey" = $ANON_KEY; "Authorization" = "Bearer $JWT"; "Content-Type" = "application/json" } `
    -Body "{`"p_org_id`":`"$ORG_ID`"}" -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  Write-Host "[PASS] T11 list_proposals user-JWT ($($d.Count) rows)"; $pass++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "[FAIL] T11 list_proposals user-JWT ($code)"; $fail++
}

# T12: get_lead_proposals RPC (service_role)
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/rpc/get_lead_proposals" -Method POST `
    -Headers @{ "apikey" = $SERVICE_KEY; "Authorization" = "Bearer $SERVICE_KEY"; "Content-Type" = "application/json" } `
    -Body "{`"p_org_id`":`"$ORG_ID`",`"p_lead_id`":481}" -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  Write-Host "[PASS] T12 get_lead_proposals ($($d.Count) rows)"; $pass++
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "[FAIL] T12 get_lead_proposals ($code)"; $fail++
}

# T13: DB migration columns via Management API
try {
  $d = Invoke-MgmtQuery "SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name IN ('ai_enabled','ai_paused_reason','ai_paused_at') ORDER BY column_name"
  if ($d.Count -eq 3) { Write-Host "[PASS] T13 DB migration columns ($($d.Count)/3)"; $pass++ }
  else { Write-Host "[FAIL] T13 DB migration columns ($($d.Count)/3 expected)"; $fail++ }
} catch { Write-Host "[FAIL] T13 DB migration: $_"; $fail++ }

# T14: Stage configs dos 3 agentes por org
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/rest/v1/ai_stage_config?org_id=eq.$ORG_ID&pipeline_stage=in.(agente_disparos,follow_up,chamada_realizada)&select=pipeline_stage,is_active" `
    -Headers @{ "apikey" = $SERVICE_KEY; "Authorization" = "Bearer $SERVICE_KEY" } -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  $missing = @('agente_disparos', 'follow_up', 'chamada_realizada') | Where-Object { -not ($d.pipeline_stage -contains $_) }
  $inactive = @($d | Where-Object { $_.is_active -ne $true } | Select-Object -ExpandProperty pipeline_stage)
  if ($missing.Count -eq 0 -and $inactive.Count -eq 0) {
    Write-Host "[PASS] T14 ai_stage_config ativos para disparos/follow_up/chamada_realizada"; $pass++
  } else {
    Write-Host "[FAIL] T14 ai_stage_config missing=[$($missing -join ',')] inactive=[$($inactive -join ',')]"; $fail++
  }
} catch { Write-Host "[FAIL] T14 ai_stage_config: $_"; $fail++ }

# T15: Estrutura de fila (tabela + RPC)
try {
  $d = Invoke-MgmtQuery "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='scheduled_agent_jobs') AS table_count, (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='claim_due_agent_jobs') AS rpc_count"
  $row = $d | Select-Object -First 1
  if ([int]$row.table_count -eq 1 -and [int]$row.rpc_count -ge 1) {
    Write-Host "[PASS] T15 scheduled_agent_jobs + claim_due_agent_jobs presentes"; $pass++
  } else {
    Write-Host "[FAIL] T15 Estrutura fila ausente (table=$($row.table_count), rpc=$($row.rpc_count))"; $fail++
  }
} catch { Write-Host "[FAIL] T15 Estrutura fila: $_"; $fail++ }

# T16: Cron process-agent-jobs ativo
try {
  $d = Invoke-MgmtQuery "SELECT jobid, active, schedule FROM cron.job WHERE jobname='process-agent-jobs-worker' ORDER BY jobid DESC LIMIT 1"
  if ($d.Count -ge 1 -and $d[0].active -eq $true) {
    Write-Host "[PASS] T16 Cron process-agent-jobs ativo (jobid=$($d[0].jobid), schedule=$($d[0].schedule))"; $pass++
  } else {
    Write-Host "[FAIL] T16 Cron process-agent-jobs não encontrado/inativo"; $fail++
  }
} catch { Write-Host "[FAIL] T16 Cron process-agent-jobs: $_"; $fail++ }

# T17: Cron executou nas últimas 6h
try {
  $d = Invoke-MgmtQuery "SELECT COUNT(*)::int AS runs FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname='process-agent-jobs-worker' AND d.start_time > now() - interval '6 hours'"
  $runs = [int]($d | Select-Object -First 1).runs
  if ($runs -gt 0) {
    Write-Host "[PASS] T17 Cron process-agent-jobs com execuções recentes ($runs runs/6h)"; $pass++
  } else {
    Write-Host "[FAIL] T17 Cron sem execuções recentes (0 runs/6h)"; $fail++
  }
} catch { Write-Host "[FAIL] T17 Cron runs: $_"; $fail++ }

# T18: Health de invoke do worker
try {
  $r = Invoke-WebRequest -Uri "$SUPABASE_URL/functions/v1/process-agent-jobs" -Method POST `
    -Headers @{ "Authorization" = "Bearer $SERVICE_KEY"; "Content-Type" = "application/json" } `
    -Body '{"source":"smoke_test_final"}' -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  if ($null -ne $d.processed) {
    Write-Host "[PASS] T18 process-agent-jobs invoke (processed=$($d.processed))"; $pass++
  } else {
    Write-Host "[FAIL] T18 process-agent-jobs resposta inesperada"; $fail++
  }
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Write-Host "[FAIL] T18 process-agent-jobs invoke ($code)"; $fail++
}

# T19: Backlog crítico da fila de agentes
try {
  $d = Invoke-MgmtQuery "SELECT (SELECT COUNT(*) FROM public.scheduled_agent_jobs WHERE status='pending' AND scheduled_at < now() - interval '15 minutes')::int AS pending_stale_15m, (SELECT COUNT(*) FROM public.scheduled_agent_jobs WHERE status='processing' AND updated_at < now() - interval '5 minutes')::int AS processing_stale_5m"
  $row = $d | Select-Object -First 1
  $pendingStale = [int]$row.pending_stale_15m
  $processingStale = [int]$row.processing_stale_5m
  if ($pendingStale -eq 0 -and $processingStale -eq 0) {
    Write-Host "[PASS] T19 Fila saudável (pending_stale_15m=0, processing_stale_5m=0)"; $pass++
  } else {
    Write-Host "[FAIL] T19 Backlog detectado (pending_stale_15m=$pendingStale, processing_stale_5m=$processingStale)"; $fail++
  }
} catch { Write-Host "[FAIL] T19 Backlog fila: $_"; $fail++ }

# T20: Evidências recentes de execução dos agentes (INFO)
try {
  $d = Invoke-MgmtQuery "SELECT action_type, COUNT(*)::int AS total FROM public.ai_action_logs WHERE created_at > now() - interval '24 hours' AND action_type IN ('agent_routed_to_disparos','follow_up_agent_executed','post_call_agent_executed','agent_invoke_failed') GROUP BY action_type ORDER BY action_type"
  if ($d.Count -gt 0) {
    $summary = ($d | ForEach-Object { "$($_.action_type)=$($_.total)" }) -join ', '
    Write-Host "[INFO] T20 ai_action_logs_24h $summary"; $info++
  } else {
    Write-Host "[INFO] T20 ai_action_logs_24h sem eventos"; $info++
  }
} catch { Write-Host "[INFO] T20 ai_action_logs_24h erro: $_"; $info++ }

Write-Host ""
Write-Host "===== RESULTS: $pass PASS, $fail FAIL, $info INFO ====="
if ($fail -eq 0) {
  Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
} else {
  Write-Host "$fail TEST(S) FAILED" -ForegroundColor Red
}
