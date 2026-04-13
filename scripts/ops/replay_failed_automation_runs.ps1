param(
  [string]$SupabaseUrl = $env:SUPABASE_URL,
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [int]$SinceHours = 24,
  [int]$Limit = 200,
  [int]$BatchSize = 50,
  [bool]$ProcessNow = $true,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Value {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing $Name. Pass -$Name or set the environment variable."
  }
}

function Get-IsoNow {
  return (Get-Date).ToUniversalTime().ToString('o')
}

function Get-EvolutionFailureRuns {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers,
    [string]$SinceIso,
    [int]$RowLimit
  )

  $query = "?select=id,last_error,processed_at,scheduled_at,attempt_count,status" +
    "&status=eq.failed" +
    "&processed_at=gte.$([uri]::EscapeDataString($SinceIso))" +
    "&order=processed_at.asc" +
    "&limit=$RowLimit"

  $uri = "$BaseUrl/rest/v1/automation_runs$query"
  $rows = Invoke-RestMethod -Method GET -Uri $uri -Headers $Headers
  $runs = @($rows)

  return @($runs | Where-Object {
      $lastError = [string]($_.last_error)
      $lastError -match '^evolution_request_(failed|timeout|exhausted_retries)'
    })
}

function Split-ItemsIntoChunks {
  param(
    [array]$Items,
    [int]$Size
  )

  if ($Size -lt 1) {
    throw 'Batch size must be at least 1.'
  }

  $chunks = @()
  for ($i = 0; $i -lt $Items.Count; $i += $Size) {
    $end = [Math]::Min($i + $Size - 1, $Items.Count - 1)
    $chunks += ,@($Items[$i..$end])
  }
  return $chunks
}

Assert-Value -Name 'SupabaseUrl' -Value $SupabaseUrl
Assert-Value -Name 'ServiceRoleKey' -Value $ServiceRoleKey

if ($SinceHours -lt 1) {
  throw 'SinceHours must be >= 1.'
}

if ($Limit -lt 1 -or $Limit -gt 1000) {
  throw 'Limit must be between 1 and 1000.'
}

if ($BatchSize -lt 1 -or $BatchSize -gt 200) {
  throw 'BatchSize must be between 1 and 200.'
}

$baseUrl = $SupabaseUrl.TrimEnd('/')
$sinceIso = (Get-Date).ToUniversalTime().AddHours(-1 * $SinceHours).ToString('o')

$restHeaders = @{
  apikey = $ServiceRoleKey
  Authorization = "Bearer $ServiceRoleKey"
  Accept = 'application/json'
  'Content-Type' = 'application/json'
  'Accept-Profile' = 'internal_crm'
  'Content-Profile' = 'internal_crm'
  Prefer = 'return=minimal'
}

Write-Host "Scanning failed automation runs since $sinceIso ..."
$failedRuns = Get-EvolutionFailureRuns -BaseUrl $baseUrl -Headers $restHeaders -SinceIso $sinceIso -RowLimit $Limit

if ($failedRuns.Count -eq 0) {
  Write-Host 'No automation runs failed by Evolution errors in the selected window.'
  exit 0
}

Write-Host "Found $($failedRuns.Count) run(s) to replay."
$failedRuns | Select-Object id, processed_at, last_error | Format-Table -AutoSize

if ($DryRun) {
  Write-Host ''
  Write-Host '[DRY-RUN] No database update was applied.'
  exit 0
}

$nowIso = Get-IsoNow
$patchBody = @{
  status = 'pending'
  scheduled_at = $nowIso
  processed_at = $null
  last_error = $null
  result_payload = $null
  updated_at = $nowIso
} | ConvertTo-Json -Depth 5 -Compress

$chunks = Split-ItemsIntoChunks -Items $failedRuns -Size $BatchSize
$patched = 0

foreach ($chunk in $chunks) {
  $idList = ($chunk | ForEach-Object { [string]$_.id }) -join ','
  $patchUri = "$baseUrl/rest/v1/automation_runs?id=in.($idList)"

  Invoke-RestMethod -Method PATCH -Uri $patchUri -Headers $restHeaders -Body $patchBody | Out-Null
  $patched += $chunk.Count
}

Write-Host "Requeued $patched run(s) to pending status."

if (-not $ProcessNow) {
  Write-Host 'ProcessNow disabled. Runs will be picked up by scheduled processing.'
  exit 0
}

$functionUri = "$baseUrl/functions/v1/internal-crm-api"
$functionHeaders = @{
  apikey = $ServiceRoleKey
  Authorization = "Bearer $ServiceRoleKey"
  'Content-Type' = 'application/json'
}
$functionBody = @{ action = 'process_automation_runs' } | ConvertTo-Json -Compress

Write-Host 'Triggering process_automation_runs ...'
$processResult = Invoke-RestMethod -Method POST -Uri $functionUri -Headers $functionHeaders -Body $functionBody

Write-Host 'Process result:'
$processResult | ConvertTo-Json -Depth 8
