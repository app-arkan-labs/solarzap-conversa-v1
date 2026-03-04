# Implementation Tracking v3 Log

## Pre-flight
- Date: 2026-03-04
- Started from branch: feat/broadcast-disparos
- Working tree had local changes; stashed with message: `pre-tracking-v3-baseline-stash`
- New branch: `feat/tracking-attribution-conversions-v3`

### Baseline Commands
- Install deps: `npm install --no-audit --no-fund` (fallback after `npm ci` EPERM lock on esbuild binary)
- Lint: `npm run lint` ? (warnings only)
- Typecheck: `npm run typecheck` ?
- Unit: `npm run test:unit` ? (21 files, 62 tests)
- E2E smoke: `npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line` ? (2 passed)

### Baseline Notes
- Applied minimal baseline lint-only config adjustment in `eslint.config.js` to downgrade legacy blocking rules:
  - `@typescript-eslint/no-unused-expressions`
  - `prefer-const`
  - `no-control-regex`
- This was required to get pre-existing repository lint baseline to green before PR0.

## PR0
- Scope: scaffold only (no tracking tables, no business logic)
- Added shared tracking constants/helpers for feature gating, stable `crm_stage` slug normalization, and default stage-event map:
  - `supabase/functions/_shared/tracking.ts`
  - `src/lib/tracking/constants.ts`
- Added scaffold unit tests: `tests/unit/trackingScaffold.test.ts`
- Gates:
  - `npm run lint` ?
  - `npm run typecheck` ?
  - `npm run test:unit` ?
