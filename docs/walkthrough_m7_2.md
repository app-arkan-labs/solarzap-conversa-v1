# Walkthrough M7.2: AI Hardening + Edge Guards

Date: 2026-02-18
Owner: Tech Lead / Release Engineer

## 0) Baseline and repo proof
Commands executed (evidence in `_deploy_tmp/`):
- `git status --short`
- `git log --all --oneline --grep "M7:" -n 20`
- `git show --name-only -1`
- `rg -n "company_id" src supabase/functions`
- `rg -n "^_deploy_tmp/" .gitignore`

Key output:
- `_deploy_tmp/` is ignored in `.gitignore` (line 29).
- `rg company_id`: `NO_MATCHES`.

## 1) DB preflight (M7.2)
Command:
- `node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_preflight.sql | Tee-Object -FilePath _deploy_tmp/m7_2_preflight_result.txt`

Key output:
- `HTTP 201`
- `total_null_org_rows = 0`
- `org_is_nullable = YES` for `ai_settings`, `ai_stage_config`, `ai_summaries`
- expected indexes `idx_ai_*_org_id` were missing pre-apply
- `deterministic_risk = false`

## 2) Deterministic fix phase
Commands:
- `node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_fix_nulls.sql | Tee-Object -FilePath _deploy_tmp/m7_2_fix_nulls_result.txt`
- `node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_preflight.sql | Tee-Object -FilePath _deploy_tmp/m7_2_preflight_after_fix.txt`

Key output:
- `HTTP 201`
- `insert_missing_org_rows` on `ai_settings`: `rows_affected = 13`
- all 3 tables remained with `null_org_count = 0`

## 3) Apply hardening
Command:
- `node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_apply.sql | Tee-Object -FilePath _deploy_tmp/m7_2_apply_result.txt`

Key output:
- `HTTP 201`
- `set_not_null` applied to: `ai_settings`, `ai_stage_config`, `ai_summaries`
- indexes created: `idx_ai_settings_org_id`, `idx_ai_stage_config_org_id`, `idx_ai_summaries_org_id`
- unique constraints:
  - `ai_settings_org_id_key`
  - `ai_stage_config_org_stage_key(org_id,pipeline_stage)`
- tightened policies on `ai_stage_config` (`m3_auth_select_org`, `m3_auth_update_org`)

## 4) DB gates
Command:
- `node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_gates.sql | Tee-Object -FilePath _deploy_tmp/m7_2_gates_result.txt`

Key output:
- `HTTP 201`
- `gate_pass = true`
- `org_is_nullable = NO` in all 3 AI tables
- `null_org_count = 0` in all 3 AI tables
- expected indexes and unique constraints present
- org-scoped SELECT policy confirmed for all 3 AI tables

## 5) Code hardening done
### `supabase/functions/whatsapp-connect/index.ts`
- Role-aware list logic:
  - owner/admin: list all instances by `org_id`
  - user: list by `org_id + user_id`
- Actions `delete`, `disconnect`, `refresh_qr`, `rename`, `sendReaction` enforce org scope.
- Non-manager actions remain owner-of-instance constrained.

### `supabase/functions/ai-pipeline-agent/index.ts`
- Fail-fast when `lead.org_id` is missing (HTTP 422 with structured error).
- Removed silent fallback behavior when `orgId` is null.
- `injectOrgIdIntoInsertPayload` now throws if `org_id` is missing.
- `ai_action_logs.org_id` presence is required at runtime.
- Side effects now pass strict `leadOrgId`.

## 6) Deploy proof (production)
Commands:
- `cmd /c npx supabase functions deploy whatsapp-connect --project-ref ucwmcmdwbvrwotuzlmxh`
- `cmd /c npx supabase functions deploy ai-pipeline-agent --no-verify-jwt --project-ref ucwmcmdwbvrwotuzlmxh`

Key output:
- `Deployed Functions on project ucwmcmdwbvrwotuzlmxh: whatsapp-connect`
- `Deployed Functions on project ucwmcmdwbvrwotuzlmxh: ai-pipeline-agent`

Functional proof outputs:
- `_deploy_tmp/m7_2_proof_whatsapp_connect_list.txt`
  - owner saw `2` org instances
  - regular user saw only `1` own instance
- `_deploy_tmp/m7_2_proof_ai_pipeline_dry_run.txt`
  - function `httpStatus: 200`
  - `ai_agent_runs.org_id` populated and matches expected org

## 7) Gates (code/tests)
### Gate D
- Command: `rg -n "company_id" src supabase/functions`
- Output: `NO_MATCHES` (`_deploy_tmp/m7_2_rg_company_id.txt`)
- Status: PASS

### Gate E
- Command: `cmd /c npx tsc --noEmit`
- Output: `EXIT_CODE:0` (`_deploy_tmp/m7_2_tsc.txt`)
- Status: PASS

### Gate F
Commands executed:
- `cmd /c npx playwright test tests/e2e/m2-ia-smoke.spec.ts --reporter=line`
- `cmd /c npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line`
- `cmd /c npx playwright test tests/e2e/m5-frontend-org.spec.ts --reporter=line`
- `cmd /c npx playwright test tests/e2e/m7-final-hardening.spec.ts --reporter=line`
- `cmd /c npx playwright test tests/e2e/m7_2-ai-settings-write.spec.ts --reporter=line`

## 7.1) M7.2.1 Stability Hotfix (E2E)
Root cause:
- Flakiness in `m7_2-ai-settings-write.spec.ts` due to timing race between:
- `AuthContext` async org resolution (layout/nav not ready yet),
- Radix Popover portal mount/animation (`nav-ia-agentes` detach/unstable on click).

Fix applied (spec only):
- Wait explicit for `nav-settings-trigger` after login and after reload.
- In `openAiSettings`, wait visible for `nav-settings-trigger` and `nav-ia-agentes`.
- Add portal-safe retry loop for clicking `nav-ia-agentes`.
- Wait explicit for switch visible before clicking.
- Deterministic baseline: ensure `ai_settings` row exists for test org in `beforeAll`.
- Click specific master switch (`Sistema AI Mestre`) instead of generic first switch.

Evidence (3x consecutive PASS):
- `_deploy_tmp/m7_2_ai_settings_write_run1_retry.txt` -> `1 passed`
- `_deploy_tmp/m7_2_ai_settings_write_run2_retry.txt` -> `1 passed`
- `_deploy_tmp/m7_2_ai_settings_write_run3_retry.txt` -> `1 passed`

Regression evidence (bundle):
- `_deploy_tmp/m7_2_regression_bundle.txt` -> `5 passed`

Final release gate evidence (this round):
- `_deploy_tmp/m7_2_1_tsc.txt` -> `EXIT_CODE:0`
- `_deploy_tmp/m7_2_1_pw_ai_settings_once.txt` -> `1 passed`
- `_deploy_tmp/m7_2_1_pw_m7_final.txt` -> `1 passed`

## 8) Files added/updated in M7.2 scope
- `supabase/functions/whatsapp-connect/index.ts`
- `supabase/functions/ai-pipeline-agent/index.ts`
- `supabase/migrations/20260218_m7_2_ai_tables_hardening.sql`
- `docs/m7_2_runbook.md`
- `docs/walkthrough_m7_2.md`
- `tests/e2e/m7_2-ai-settings-write.spec.ts`

## 9) Commit hash
- Recorded in final terminal proof (`git show --name-only -1`) after commit.
