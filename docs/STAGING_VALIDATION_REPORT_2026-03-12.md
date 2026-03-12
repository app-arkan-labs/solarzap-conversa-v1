# Staging Validation Report (2026-03-12)

## Target
- Project ref: `ucwmcmdwbvrwotuzlmxh`
- Scope: resume execution through phases 1-5 until staging green

## Applied DB migrations
- `20260312100000_broadcast_worker_backend.sql`
- `20260312101000_automation_settings_persistence.sql`
- `20260312102000_kb_ingestion_status_pipeline.sql`
- `20260312103000_remove_ai_settings_openai_api_key.sql`
- `20260312104000_ops_runtime_health_extension.sql`

## Deployed Edge Functions
- `broadcast-worker`
- `kb-ingest`
- `org-admin`
- `process-agent-jobs`
- `ai-pipeline-agent`
- `ai-digest-worker`
- `proposal-composer`
- `proposal-copy-generator`
- `stripe-checkout`
- `stripe-pack-checkout`
- `stripe-portal`
- `stripe-webhook`

## Cron reconfiguration
Applied via ops scripts:
- `scripts/ops/reconfigure_notification_cron.ps1`
- `scripts/ops/reconfigure_process_agent_jobs_cron.ps1`
- `scripts/ops/reconfigure_broadcast_worker_cron.ps1`

Validated by smoke:
- `process-agent-jobs-worker` active, correct URL, recent executions
- `invoke-broadcast-worker` active, correct URL, recent executions

## Staging smoke result
Command: `powershell -File scripts/smoke_test_final.ps1`

Final status:
- `24 PASS`
- `0 FAIL`
- `2 INFO` (non-blocking)

Key checks green:
- billing and auth guards
- proposal context + AI pipeline invoke
- notification worker + broadcast worker invoke
- migration columns and AI stage config
- runtime health view (`notification_runtime_health_latest`) without critical open operational alerts
- broadcast and agent queue stale backlog checks

## E2E additions validated
- `tests/e2e/billing-gating-access-states.spec.ts`
- `tests/e2e/mobile-critical-tabs-smoke.spec.ts`

Result: `6 passed`

## Backup / restore drill (staging)
Executed:
- `scripts/ops/staging_backup_restore_drill.sql`

Result:
- HTTP 201
- Canary restore checksum validated
- Example drill id: `bb786533-e43b-430c-afac-8bf8e0100917`

## Local quality gates rerun
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm test -- --run` ✅
- `npm run lint` ✅ (warnings only, no errors)
