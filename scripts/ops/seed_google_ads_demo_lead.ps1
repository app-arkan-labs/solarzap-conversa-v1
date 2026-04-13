param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$OrgKey,

  [Parameter(Mandatory = $false)]
  [string]$Phone = '11999999999',

  [Parameter(Mandatory = $false)]
  [string]$Name = 'Google Ads Demo Lead',

  [Parameter(Mandatory = $false)]
  [string]$Email = 'demo-google-ads@solarzap.local',

  [Parameter(Mandatory = $false)]
  [string]$Gclid = '',

  [Parameter(Mandatory = $false)]
  [string]$UtmSource = 'google',

  [Parameter(Mandatory = $false)]
  [string]$UtmMedium = 'cpc',

  [Parameter(Mandatory = $false)]
  [string]$UtmCampaign = 'google_verification_demo'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Gclid)) {
  $Gclid = 'AW-demo-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
}

$endpoint = $SupabaseUrl.TrimEnd('/') + '/functions/v1/attribution-webhook'
$payload = @{
  phone = $Phone
  email = $Email
  name = $Name
  gclid = $Gclid
  utm_source = $UtmSource
  utm_medium = $UtmMedium
  utm_campaign = $UtmCampaign
} | ConvertTo-Json -Depth 5

$headers = @{
  'Content-Type' = 'application/json'
  'X-SZAP-Org-Key' = $OrgKey
}

Write-Host "POST $endpoint"
Write-Host "Lead: $Name <$Email> / $Phone"
Write-Host "GCLID: $Gclid"

$response = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $payload

Write-Host ''
Write-Host 'Seed result:'
$response | ConvertTo-Json -Depth 8