# Release Checklist Signed - 2026-03-13

Status: READY FOR PRODUCTION RELEASE CANDIDATE
Version freeze: 1.0.0
Signed by: GitHub Copilot (GPT-5.3-Codex)
Date: 2026-03-13

## Scope
This checklist captures the final release hygiene evidence for the current execution cycle.

## Release Gates
- [x] TypeScript gate passed
  - Evidence: npm run typecheck -> OK
- [x] Production build gate passed
  - Evidence: npm run build -> OK
- [x] Test gate passed
  - Evidence: npm test -- --run -> OK
- [x] Lint gate passed with warnings only
  - Evidence: npm run lint -> no blocking errors

## Critical E2E Gates
- [x] Billing gating scenarios passed
  - Evidence: tests/e2e/billing-gating-access-states.spec.ts -> 7/7 passed
- [x] Mobile critical tabs smoke passed
  - Evidence: tests/e2e/mobile-critical-tabs-smoke.spec.ts -> passed
- [x] Guided tour positive flow passed
  - Evidence: tests/e2e/guided-tour-run-once.spec.ts -> passed

## Security and Invocation Hardening
- [x] process-agent-jobs invocation auth enforced
  - File: supabase/functions/process-agent-jobs/index.ts
- [x] ai-pipeline-agent invocation auth enforced
  - File: supabase/functions/ai-pipeline-agent/index.ts
- [x] Internal caller alignment for webhook invoke chain
  - File: supabase/functions/whatsapp-webhook/index.ts
- [x] Shared invocation auth helper in place and tested
  - Files:
    - supabase/functions/_shared/invocationAuth.ts
    - tests/unit/invocationAuth.test.ts

## Operational Readiness
- [x] Smoke script no longer blocks when optional env vars are absent
  - File: scripts/smoke_test_final.ps1
  - Evidence: LITE mode run result -> 5 PASS, 0 FAIL
- [x] KB ingestion has runtime monitoring and manual retry path
  - File: src/components/solarzap/KnowledgeBaseView.tsx

## Performance Readiness
- [x] Main app shell and heavy areas split via lazy loading
  - Files:
    - src/pages/Index.tsx
    - src/components/solarzap/SolarZapLayout.tsx
    - vite.config.ts
- [x] Build output no longer shows >500k warning in current run

## Known Residual Risk (Non-Blocking)
- CORS helper currently allows requests without Origin and relies on endpoint auth for protection.
- File: supabase/functions/_shared/cors.ts
- Decision: accepted for this release candidate due enforced invocation auth in critical functions.

## Final Sign-Off
This release candidate is approved for controlled production release under current operating assumptions.
