# Implementation Tracking v3 Report

## Commits PR0..PR7
1. `8c16e87` - `PR0: scaffold tracking flags + types (no business logic)`
2. `bf447fc` - `PR1: migrations + RLS for tracking tables (v3 schema)`
3. `5952891` - `PR2: attribution engine (CTWA + trigger messages) + channel guard`
4. `0ce0f5f` - `PR3: attribution-webhook + anti-spam/rate-limit + universal snippet`
5. `5e25a4f` - `PR4: stage-change router (trigger v2) -> conversion_events + deliveries`
6. `aa10098` - `PR5: conversion-dispatcher worker + pg_cron + locks/retry + platform dispatch`
7. `f4bf26c` - `PR6: UI Tracking & Conversões (keys, platforms, triggers, mapping, dashboard)`
8. `2fc0abb` - `PR7: tests + backfill + debug mode + docs`

## Files Changed By PR
### PR0 (`8c16e87`)
- `docs/IMPLEMENTATION_TRACKING_V3_LOG.md`
- `eslint.config.js`
- `src/lib/tracking/constants.ts`
- `supabase/functions/_shared/tracking.ts`
- `tests/unit/trackingScaffold.test.ts`
- `tsconfig.app.tsbuildinfo`

### PR1 (`bf447fc`)
- `docs/IMPLEMENTATION_TRACKING_V3_LOG.md`
- `docs/sql/tracking_v3_rls_smoke.sql`
- `supabase/migrations/20260304170000_tracking_v3_schema.sql`

### PR2 (`5952891`)
- `docs/IMPLEMENTATION_TRACKING_V3_LOG.md`
- `src/hooks/domain/useLeads.ts`
- `supabase/functions/_shared/trackingAttribution.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `tests/unit/trackingAttribution.test.ts`

### PR3 (`0ce0f5f`)
- `docs/IMPLEMENTATION_TRACKING_V3_LOG.md`
- `docs/landing/solarzap_attribution_snippet.html`
- `src/components/solarzap/IntegrationsView.tsx`
- `src/lib/tracking/snippet.ts`
- `supabase/config.toml`
- `supabase/functions/_shared/attributionWebhook.ts`
- `supabase/functions/_shared/attributionWebhookService.ts`
- `supabase/functions/attribution-webhook/index.ts`
- `tests/unit/trackingSnippet.test.ts`
- `tests/unit/trackingWebhook.test.ts`

### PR4 (`5e25a4f`)
- `docs/IMPLEMENTATION_TRACKING_V3_LOG.md`
- `src/lib/tracking/router.ts`
- `supabase/migrations/20260304193000_tracking_v3_stage_router.sql`
- `tests/unit/trackingRouter.test.ts`

### PR5 (`aa10098`)
- `docs/IMPLEMENTATION_TRACKING_V3_LOG.md`
- `supabase/config.toml`
- `supabase/functions/_shared/conversionDispatcher.ts`
- `supabase/functions/conversion-dispatcher/index.ts`
- `supabase/migrations/20260304212000_tracking_v3_dispatcher_cron.sql`
- `tests/unit/conversionDispatcher.test.ts`

### PR6 (`f4bf26c`)
- `docs/IMPLEMENTATION_TRACKING_V3_LOG.md`
- `src/components/solarzap/IntegrationsView.tsx`
- `src/components/solarzap/TrackingConversionsPanel.tsx`
- `supabase/config.toml`
- `supabase/functions/tracking-credentials/index.ts`

### PR7 (`2fc0abb`)
- `docs/IMPLEMENTATION_TRACKING_V3_LOG.md`
- `docs/TRACKING_V3.md`
- `docs/sql/tracking_v3_backfill.sql`
- `tests/unit/trackingV3Regression.test.ts`

## Local Test Steps
1. Install deps: `npm install --no-audit --no-fund`
2. Run lint: `npm run lint`
3. Run typecheck: `npm run typecheck`
4. Run unit tests: `npm run test:unit`
5. Run e2e smoke: `npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line`
6. (Optional) Build app: `npm run build`

## Safe Org Rollout
1. Keep `org_tracking_settings.tracking_enabled=false` (default) after deploy.
2. Configure webhook key (`webhook_public_key`) and install snippet on landing forms.
3. Configure credentials in UI (`Tracking & Conversões`):
   - metadata in `ad_platform_credentials`
   - secrets in Vault via `tracking-credentials`
4. Validate platforms in debug mode:
   - Meta: `meta_test_event_code`
   - Google: `google_validate_only=true` (or dispatcher `?validate_only=1`)
   - GA4: debug validation endpoint in credential test
5. Enable platform toggles (`meta_capi_enabled`, `google_ads_enabled`, `ga4_enabled`) per org.
6. Enable `tracking_enabled=true` only for pilot orgs.
7. Observe `conversion_deliveries` dashboard (pending/failed/sent) before wider rollout.

## Security Notes
- RLS enabled on all 7 tracking tables with org-scoped authenticated policies and service-role policy for server workers.
- Public webhook is org-key scoped (`x-szap-org-key`) and protected with:
  - honeypot (`_szap_honeypot`)
  - rate limit per org (`rate_limit_per_minute`, default 60/min)
  - optional reCAPTCHA
  - optional blocklists (`blocklist_ips`, `blocklist_phones`)
- Dispatcher uses claim locking (`FOR UPDATE SKIP LOCKED`) plus stale recovery job.
- Retry strategy is bounded (`max_attempts=5`) with exact backoff ladder.
- Channel guard prevents overwriting manual `leads.canal` unless inferred/forced.

## Plan v3 Compliance Summary
- 7 tracking tables + constraints + indexes + RLS: implemented.
- Attribution engine (CTWA + trigger + touchpoint fingerprint + channel guard): implemented.
- Universal webhook + anti-spam + org rate-limit + snippet: implemented.
- Stage router (`tr_lead_stage_change_v2`) -> conversion events + deliveries with idempotency: implemented.
- Dispatcher with SKIP LOCKED claim, per-platform dispatch, retry/backoff, stale guard and cron: implemented.
- UI for Tracking & Conversões (key, credentials, triggers, mapping, dashboard): implemented.
- PR7 closure (tests, backfill script, debug docs): implemented.
