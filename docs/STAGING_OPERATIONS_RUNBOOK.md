# STAGING OPERATION RUNBOOK (Stripe, Webhook, Broadcast, AI, Restore)

## Scope
- Environment: staging project `ucwmcmdwbvrwotuzlmxh`
- Goal: keep billing, webhooks, broadcasts, and AI workers healthy with fast diagnosis and rollback
- Out of scope in this round: production rollout

## Required env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `EDGE_INTERNAL_API_KEY`
- `ORG_ID`
- `SMOKE_TEST_EMAIL`
- `SMOKE_TEST_PASSWORD`

## Baseline health checks
1. Run the operational smoke:

```powershell
pwsh -File scripts/smoke_test_final.ps1
```

2. Verify runtime alerts:

```sql
SELECT *
FROM public.notification_runtime_health_latest
ORDER BY alert_type;
```

3. Verify cron pointers:

```sql
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname IN ('invoke-notification-worker', 'invoke-ai-digest-worker', 'process-agent-jobs-worker', 'invoke-broadcast-worker')
ORDER BY jobname;
```

## Stripe billing and webhook incident
1. Confirm recent webhook receipts:

```sql
SELECT count(*) AS webhook_24h
FROM public.billing_events
WHERE event_type = 'stripe_webhook_received'
  AND created_at >= now() - interval '24 hours';
```

2. Check unresolved billing alerts:

```sql
SELECT id, org_id, code, severity, created_at
FROM public.billing_alerts
WHERE resolved_at IS NULL
ORDER BY created_at DESC
LIMIT 50;
```

3. Validate edge function deployment and env (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, CORS allowlist).
4. Re-deliver failed Stripe events from Stripe Dashboard and re-check timeline.
5. If needed, force recompute access state:

```sql
SELECT public.sync_org_access_state();
```

## Broadcast worker incident (backlog/failures)
1. Trigger one worker cycle manually:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/broadcast-worker" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "x-internal-api-key: $EDGE_INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source":"ops_manual"}'
```

2. Inspect backlog/stale claims:

```sql
SELECT
  (SELECT count(*) FROM public.broadcast_recipients WHERE status='pending' AND next_attempt_at < now() - interval '15 minutes') AS pending_stale_15m,
  (SELECT count(*) FROM public.broadcast_recipients WHERE status='sending' AND coalesce(processing_started_at, updated_at) < now() - interval '5 minutes') AS sending_stale_5m,
  (SELECT count(*) FROM public.broadcast_recipients WHERE status='failed' AND coalesce(updated_at, created_at) > now() - interval '60 minutes') AS failed_60m;
```

3. Reconfigure cron pointer if missing/divergent:

```powershell
pwsh -File scripts/ops/reconfigure_broadcast_worker_cron.ps1
```

4. If backlog persists, pause problematic campaigns, correct payload/instance config, then resume.

## WhatsApp disconnected incident
1. Check disconnected active instances:

```sql
SELECT org_id, instance_name, status, updated_at
FROM public.whatsapp_instances
WHERE is_active = true
  AND coalesce(status, 'disconnected') <> 'connected'
ORDER BY updated_at DESC;
```

2. Reconnect instance from Integrations UI or rotate credentials if API auth expired.
3. Confirm webhook target and status sync using `evolution-proxy`.

## AI anomaly incident
1. Check error ratio in last 15 minutes:

```sql
SELECT
  count(*) AS total_15m,
  count(*) FILTER (WHERE coalesce(success,false)=false) AS failed_15m
FROM public.ai_action_logs
WHERE created_at >= now() - interval '15 minutes';
```

2. Validate required AI secrets (`OPENAI_API_KEY`) and per-org settings (`ai_settings`).
3. Inspect edge logs for `ai-pipeline-agent` and `ai-digest-worker`.
4. If needed, temporarily disable AI per org and recover queue progressively.

## Restore and recovery
1. Follow [STAGING_BACKUP_RETENTION_POLICY.md](./STAGING_BACKUP_RETENTION_POLICY.md).
2. Run the controlled drill SQL before and after restore window:

```sql
\i scripts/ops/staging_backup_restore_drill.sql
```

3. Validate post-restore invariants:
- billing RPC still returns access state
- cron jobs active and pointing to expected worker URLs
- `notification_runtime_health_latest` has no open critical alerts
- smoke suite returns zero failures

## Cron remediation commands
- Notification and digest:

```powershell
pwsh -File scripts/ops/reconfigure_notification_cron.ps1
```

- Agent jobs:

```powershell
pwsh -File scripts/ops/reconfigure_process_agent_jobs_cron.ps1
```

- Broadcast worker:

```powershell
pwsh -File scripts/ops/reconfigure_broadcast_worker_cron.ps1
```
