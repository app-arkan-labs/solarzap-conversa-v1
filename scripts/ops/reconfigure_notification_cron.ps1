param(
  [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$EdgeInternalApiKey = $env:EDGE_INTERNAL_API_KEY,
  [string]$SqlFile = "$PSScriptRoot\reconfigure_notification_cron.sql",
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Escape-SqlLiteral {
  param([string]$Value)
  return ($Value -replace "'", "''")
}

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
  throw 'Missing project ref. Set SUPABASE_PROJECT_REF or pass -ProjectRef.'
}
if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  throw 'Missing access token. Set SUPABASE_ACCESS_TOKEN or pass -AccessToken.'
}
if ([string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
  throw 'Missing service role key. Set SUPABASE_SERVICE_ROLE_KEY or pass -ServiceRoleKey.'
}
if ([string]::IsNullOrWhiteSpace($EdgeInternalApiKey)) {
  throw 'Missing internal API key. Set EDGE_INTERNAL_API_KEY or pass -EdgeInternalApiKey.'
}
if (-not (Test-Path -LiteralPath $SqlFile)) {
  throw "SQL file not found: $SqlFile"
}

$sqlBody = Get-Content -LiteralPath $SqlFile -Raw

$setConfigSql = @"
SELECT set_config('app.notification_cron_project_ref', '$(Escape-SqlLiteral $ProjectRef)', false);
SELECT set_config('app.notification_cron_service_role_jwt', '$(Escape-SqlLiteral $ServiceRoleKey)', false);
SELECT set_config('app.notification_cron_internal_api_key', '$(Escape-SqlLiteral $EdgeInternalApiKey)', false);
"@

$query = "$setConfigSql`n$sqlBody"

if ($DryRun) {
  Write-Host '[DRY-RUN] Query preview (first 1200 chars):'
  $preview = if ($query.Length -gt 1200) { $query.Substring(0, 1200) + '...' } else { $query }
  Write-Host $preview
  exit 0
}

$apiUrl = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
$payload = @{ query = $query } | ConvertTo-Json -Depth 5

$response = Invoke-WebRequest `
  -Method POST `
  -Uri $apiUrl `
  -Headers @{
    Authorization = "Bearer $AccessToken"
    'Content-Type' = 'application/json'
  } `
  -Body $payload `
  -UseBasicParsing

Write-Host "HTTP $($response.StatusCode)"
if ($response.Content) {
  try {
    $json = $response.Content | ConvertFrom-Json
    $json | ConvertTo-Json -Depth 10
  } catch {
    Write-Host $response.Content
  }
}
