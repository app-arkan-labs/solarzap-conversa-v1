param(
  [Parameter(Mandatory = $false)]
  [string]$SupabaseUrl = $env:VITE_SUPABASE_URL,

  [Parameter(Mandatory = $false)]
  [string[]]$AllowedOrigins = @(
    'http://localhost:5173',
    'https://solarzap.arkanlabs.com.br',
    'https://app.solarzap.com.br'
  ),

  [Parameter(Mandatory = $false)]
  [string[]]$BlockedOrigins = @(
    'https://blocked.example.com'
  ),

  [Parameter(Mandatory = $false)]
  [string[]]$Functions = @(
    'org-admin',
    'evolution-proxy',
    'whatsapp-connect',
    'integration-disconnect',
    'proposal-storage-intent',
    'proposal-share-link',
    'proposal-context-engine',
    'proposal-composer',
    'tracking-credentials',
    'google-oauth',
    'meta-oauth'
  ),

  [switch]$FailOnMismatch
)

if (-not $SupabaseUrl) {
  Write-Error 'Supabase URL ausente. Passe -SupabaseUrl ou configure VITE_SUPABASE_URL.'
  exit 1
}

$AllowedOrigins = @($AllowedOrigins | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$BlockedOrigins = @($BlockedOrigins | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$Functions = @($Functions | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$baseUrl = $SupabaseUrl.TrimEnd('/')

function Read-ErrorBody {
  param([object]$Response)

  if (-not $Response) { return '' }

  try {
    if ($Response.Content -and $Response.Content.ReadAsStringAsync) {
      return $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    }
  } catch {}

  try {
    $stream = $Response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      return $reader.ReadToEnd()
    }
  } catch {}

  return ''
}

function Invoke-CorsPreflight {
  param(
    [string]$Endpoint,
    [string]$Origin
  )

  $headers = @{
    Origin = $Origin
    'Access-Control-Request-Method'  = 'POST'
    'Access-Control-Request-Headers' = 'authorization, x-client-info, apikey, content-type'
  }

  try {
    $resp = Invoke-WebRequest -Uri $Endpoint -Method Options -Headers $headers -UseBasicParsing
    return [PSCustomObject]@{
      Status = [int]$resp.StatusCode
      AllowOrigin = $resp.Headers['Access-Control-Allow-Origin']
      Vary = $resp.Headers['Vary']
      Body = [string]$resp.Content
      Error = $null
    }
  } catch {
    $response = $_.Exception.Response
    if (-not $response) {
      return [PSCustomObject]@{
        Status = 0
        AllowOrigin = $null
        Vary = $null
        Body = ''
        Error = $_.Exception.Message
      }
    }

    $status = 0
    try { $status = [int]$response.StatusCode } catch {}

    $allowOrigin = $null
    $vary = $null
    try { $allowOrigin = $response.Headers['Access-Control-Allow-Origin'] } catch {}
    try { $vary = $response.Headers['Vary'] } catch {}

    return [PSCustomObject]@{
      Status = $status
      AllowOrigin = $allowOrigin
      Vary = $vary
      Body = Read-ErrorBody -Response $response
      Error = $_.Exception.Message
    }
  }
}

$results = @()

foreach ($functionName in $Functions) {
  $endpoint = "$baseUrl/functions/v1/$functionName"

  foreach ($origin in $AllowedOrigins) {
    $result = Invoke-CorsPreflight -Endpoint $endpoint -Origin $origin
    $varyHasOrigin = [string]$result.Vary -match '(^|,\s*)Origin(\s*,|$)'
    $statusOk = ($result.Status -eq 200) -or ($result.Status -eq 204)
    $passed = $statusOk -and ($result.AllowOrigin -eq $origin) -and $varyHasOrigin
    $results += [PSCustomObject]@{
      Function = $functionName
      Origin = $origin
      Kind = 'allowed'
      Status = $result.Status
      AllowOrigin = $result.AllowOrigin
      Vary = $result.Vary
      Passed = $passed
      Error = $result.Error
    }
  }

  foreach ($origin in $BlockedOrigins) {
    $result = Invoke-CorsPreflight -Endpoint $endpoint -Origin $origin
    $varyHasOrigin = [string]$result.Vary -match '(^|,\s*)Origin(\s*,|$)'
    $passed = ($result.Status -eq 403) -and ($result.Body -match 'origin_not_allowed') -and $varyHasOrigin
    $results += [PSCustomObject]@{
      Function = $functionName
      Origin = $origin
      Kind = 'blocked'
      Status = $result.Status
      AllowOrigin = $result.AllowOrigin
      Vary = $result.Vary
      Passed = $passed
      Error = $result.Error
    }
  }
}

$results | Format-Table -AutoSize Function, Kind, Origin, Status, AllowOrigin, Vary, Passed

$failed = @($results | Where-Object { -not $_.Passed })
if ($failed.Count -gt 0) {
  Write-Warning "CORS smoke encontrou $($failed.Count) falhas."
  if ($FailOnMismatch) {
    exit 1
  }
}

Write-Output "CORS smoke finalizado. Total: $($results.Count) checks."
