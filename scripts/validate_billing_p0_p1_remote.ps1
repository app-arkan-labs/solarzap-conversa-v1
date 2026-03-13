$ErrorActionPreference='Stop'
$base='https://ucwmcmdwbvrwotuzlmxh.supabase.co/rest/v1'
$token='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8'
$headers=@{ apikey=$token; Authorization="Bearer $token" }

function Get-Json($url){
  Invoke-RestMethod -Method GET -Uri $url -Headers $headers
}
function Post-Json($url,$body,$prefer='return=representation'){
  $h = @{}
  $headers.Keys | ForEach-Object { $h[$_] = $headers[$_] }
  $h['Prefer'] = $prefer
  Invoke-RestMethod -Method POST -Uri $url -Headers $h -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20)
}
function Patch-Json($url,$body,$prefer='return=representation'){
  $h = @{}
  $headers.Keys | ForEach-Object { $h[$_] = $headers[$_] }
  $h['Prefer'] = $prefer
  Invoke-RestMethod -Method PATCH -Uri $url -Headers $h -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20)
}

$plans = Get-Json "$base/_admin_subscription_plans?select=plan_key,price_cents,limits,features&order=sort_order.asc"
$addons = Get-Json "$base/_admin_addon_catalog?select=addon_key,addon_type,price_cents,limit_key,credit_amount&order=sort_order.asc"

$startPlan = $plans | Where-Object { $_.plan_key -eq 'start' } | Select-Object -First 1
$scalePlan = $plans | Where-Object { $_.plan_key -eq 'scale' } | Select-Object -First 1

$orgName = "Billing Test " + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss')
$newOrg = Post-Json "$base/organizations?select=id,name,plan,plan_limits,subscription_status" @{ name=$orgName; plan='start'; plan_limits=$startPlan.limits; subscription_status='active'; status='active' }
$orgId = $newOrg[0].id

$cycle = (Get-Date).ToUniversalTime().ToString('yyyy-MM')

$r1 = Post-Json "$base/rpc/record_usage" @{ p_org_id=$orgId; p_event_type='ai_request'; p_quantity=1; p_metadata=@{ source='deploy-check' } }
$r2 = Post-Json "$base/rpc/record_usage" @{ p_org_id=$orgId; p_event_type='ai_request'; p_quantity=2; p_metadata=@{ source='deploy-check' } }

$usageEvents = Get-Json "$base/usage_events?select=org_id,event_type,quantity,billing_cycle&org_id=eq.$orgId&event_type=eq.ai_request&billing_cycle=eq.$cycle&order=id.desc&limit=5"
$usageCounter = Get-Json "$base/usage_counters?select=org_id,billing_cycle,counter_key,value&org_id=eq.$orgId&billing_cycle=eq.$cycle&counter_key=eq.ai_requests_used"

$absCheck = Post-Json "$base/rpc/check_plan_limit" @{ p_org_id=$orgId; p_limit_key='max_members'; p_quantity=1 }
$monthlyCheckQty = Post-Json "$base/rpc/check_plan_limit" @{ p_org_id=$orgId; p_limit_key='monthly_broadcast_credits'; p_quantity=200 }

$null = Post-Json "$base/credit_balances" @{ org_id=$orgId; credit_type='broadcast_credits'; balance=500 } 'return=minimal'
$packCheck = Post-Json "$base/rpc/check_plan_limit" @{ p_org_id=$orgId; p_limit_key='monthly_broadcast_credits'; p_quantity=1 }

$null = Patch-Json "$base/organizations?id=eq.$orgId" @{ plan='scale'; plan_limits=$scalePlan.limits } 'return=minimal'
$unlimitedCheck = Post-Json "$base/rpc/check_plan_limit" @{ p_org_id=$orgId; p_limit_key='max_leads'; p_quantity=999999 }

$billingInfo = Post-Json "$base/rpc/get_org_billing_info" @{ p_org_id=$orgId }

$result = [ordered]@{
  catalog = [ordered]@{
    total_rows = $plans.Count
    paid_prices = [ordered]@{
      start = (($plans | Where-Object { $_.plan_key -eq 'start' } | Select-Object -First 1).price_cents)
      pro   = (($plans | Where-Object { $_.plan_key -eq 'pro' } | Select-Object -First 1).price_cents)
      scale = (($plans | Where-Object { $_.plan_key -eq 'scale' } | Select-Object -First 1).price_cents)
    }
  }
  addons = [ordered]@{
    total_rows = $addons.Count
    keys = ($addons | ForEach-Object { $_.addon_key })
  }
  metering = [ordered]@{
    usage_events_count = $usageEvents.Count
    usage_counter_ai_requests_used = $(if($usageCounter.Count -gt 0){ $usageCounter[0].value } else { $null })
    record_usage_last = $r2
  }
  checks = [ordered]@{
    absolute_max_members = $absCheck
    monthly_broadcast_qty200 = $monthlyCheckQty
    pack_effective_limit = $packCheck
    unlimited_max_leads = $unlimitedCheck
  }
  billing_info = [ordered]@{
    has_access_state = ($null -ne $billingInfo.access_state)
    has_usage = ($null -ne $billingInfo.usage)
    has_effective_limits = ($null -ne $billingInfo.effective_limits)
    has_credit_balances = ($null -ne $billingInfo.credit_balances)
    access_state = $billingInfo.access_state
    subscription_status = $billingInfo.subscription_status
  }
  test_org_id = $orgId
}

$result | ConvertTo-Json -Depth 20
