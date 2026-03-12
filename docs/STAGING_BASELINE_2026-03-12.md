# Staging Baseline Snapshot (2026-03-12)

Captured before staging mutations for the production-readiness resume execution.

## Git baseline
- Branch: `feat/tracking-attribution-conversions-v3`
- Dirty tree present with in-flight implementation files for:
  - broadcast worker backend migration + edge function
  - automation settings persistence
  - KB ingestion status pipeline
  - AI key hardening
  - Stripe/org-admin/process-agent-jobs hardening
  - UI changes (`MfaSetup`, `AutomationsView`, `KnowledgeBaseView`, `LossAnalyticsModal`)

## Remote Supabase project
- Project ref: `ucwmcmdwbvrwotuzlmxh`
- Functions currently active: `stripe-*`, `process-agent-jobs`, `notification-worker`, `ai-digest-worker`, `kb-ingest`, `org-admin`, and others.
- `broadcast-worker` function was **not** present at capture time.

## Remote migrations / schema
- Latest remote migration at capture: `20260311210000`.
- Capture-time checks indicated pending local migrations from this execution were not applied yet:
  - `20260312100000_broadcast_worker_backend.sql`
  - `20260312101000_automation_settings_persistence.sql`
  - `20260312102000_kb_ingestion_status_pipeline.sql`
  - `20260312103000_remove_ai_settings_openai_api_key.sql`

## Cron baseline
- Existing active jobs at capture:
  - `invoke-notification-worker` (`*/2 * * * *`)
  - `invoke-ai-digest-worker` (`*/15 * * * *`)
  - `invoke-notification-health-scan` (`*/5 * * * *`)
  - `process-agent-jobs-worker` (`* * * * *`)
- `invoke-broadcast-worker` cron job was **not** present at capture time.

## Runtime health baseline
- `notification_runtime_health_latest` open critical alerts: `0` at capture.

