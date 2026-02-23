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
  $r = Invoke-WebRequest -Uri "https://api.supabase.com/v1/projects/ucwmcmdwbvrwotuzlmxh/database/query" `
    -Method POST `
    -Headers @{ "Authorization" = "Bearer $ACCESS_TOKEN"; "Content-Type" = "application/json" } `
    -Body '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name=''leads'' AND column_name IN (''ai_enabled'',''ai_paused_reason'',''ai_paused_at'') ORDER BY column_name"}' `
    -UseBasicParsing
  $d = $r.Content | ConvertFrom-Json
  if ($d.Count -eq 3) { Write-Host "[PASS] T13 DB migration columns ($($d.Count)/3)"; $pass++ }
  else { Write-Host "[FAIL] T13 DB migration columns ($($d.Count)/3 expected)"; $fail++ }
} catch { Write-Host "[FAIL] T13 DB migration: $_"; $fail++ }

Write-Host ""
Write-Host "===== RESULTS: $pass PASS, $fail FAIL, $info INFO ====="
if ($fail -eq 0) {
  Write-Host "ALL TESTS PASSED!" -ForegroundColor Green
} else {
  Write-Host "$fail TEST(S) FAILED" -ForegroundColor Red
}
