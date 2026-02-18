# Runbook M7.2: AI Tables Hardening + Edge Guards

Date: 2026-02-18
Owner: Tech Lead / Release Engineer

## Scope
- Enforce `org_id NOT NULL` on `ai_settings`, `ai_stage_config`, `ai_summaries`.
- Deterministic backfill/remediation for any nullable drift.
- Harden `whatsapp-connect` org/role scoping.
- Harden `ai-pipeline-agent` fail-fast behavior when org context is missing.
- Publish and prove Edge Function deploys.

## Operating Rules
- Execute sequentially.
- SQL path B only: `node scripts/m0_run_sql.mjs <file.sql>`.
- Keep temporary SQL and evidence only in `_deploy_tmp/` (never commit).
- Migration mirror in `supabase/migrations/` must be idempotent.
- Auto-remediation max 2 cycles per failed gate.

## Phase 0: Baseline
```powershell
git status --short | Tee-Object -FilePath _deploy_tmp/m7_2_phase0_git_status_short.txt
git log --all --oneline --grep "M7:" -n 20 | Tee-Object -FilePath _deploy_tmp/m7_2_phase0_git_log_m7.txt
git show --name-only -1 | Tee-Object -FilePath _deploy_tmp/m7_2_phase0_git_show_name_only_last.txt
rg -n "company_id" src supabase/functions | Tee-Object -FilePath _deploy_tmp/m7_2_phase0_rg_company_id.txt
rg -n "^_deploy_tmp/" .gitignore | Tee-Object -FilePath _deploy_tmp/m7_2_phase0_gitignore_check.txt
```

## Phase 1: DB Preflight
Files required in `_deploy_tmp/`:
- `m7_2_preflight.sql`
- `m7_2_fix_nulls.sql`
- `m7_2_apply.sql`
- `m7_2_gates.sql`

Run:
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_preflight.sql | Tee-Object -FilePath _deploy_tmp/m7_2_preflight_result.txt
```

Must report:
- NULL counts, nullable status, indexes, policies, constraints.
- deterministic risk flag.

## Phase 2: Deterministic Null Fix
Run when needed:
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_fix_nulls.sql | Tee-Object -FilePath _deploy_tmp/m7_2_fix_nulls_result.txt
node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_preflight.sql | Tee-Object -FilePath _deploy_tmp/m7_2_preflight_after_fix.txt
```

Deterministic order:
1. `lead_id -> leads.org_id`
2. `user_id/created_by -> organization_members.org_id`
3. `instance_name -> whatsapp_instances.org_id`
4. fallback by deterministic primary owner org

## Phase 3: Apply Hardening
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_apply.sql | Tee-Object -FilePath _deploy_tmp/m7_2_apply_result.txt
```

Apply requirements:
- `SET NOT NULL` on AI tables.
- `idx_ai_*_org_id` indexes.
- unique `ai_settings(org_id)`.
- unique `ai_stage_config(org_id,<stage_col>)` when stage column exists.
- policy tighten only where needed for org scoping.

## Phase 4: DB Gates
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_2_gates.sql | Tee-Object -FilePath _deploy_tmp/m7_2_gates_result.txt
```

Pass criteria:
- nullable = `NO`
- NULL count = `0`
- indexes exist
- unique constraints exist when applicable
- SELECT policy org-scoped
- `gate_pass = true`

## Phase 5: Code Patches
### `supabase/functions/whatsapp-connect/index.ts`
- Resolve member as `(org_id, role)`.
- `list`:
  - owner/admin -> all org instances
  - user -> only own instances inside org
- actions (`delete`, `disconnect`, `refresh_qr`, `rename`, `sendReaction`) always constrained by org scope; user also constrained by `user_id`.

### `supabase/functions/ai-pipeline-agent/index.ts`
- No silent org fallback in insert payload.
- Fail fast if `lead.org_id` missing (422).
- Enforce `ai_action_logs.org_id` schema presence.
- Side effects and logs always receive explicit `org_id`.

## Phase 6: Deploy Proof
```powershell
cmd /c npx supabase functions deploy whatsapp-connect --project-ref <ref> | Tee-Object -FilePath _deploy_tmp/m7_2_deploy_whatsapp_connect.txt
cmd /c npx supabase functions deploy ai-pipeline-agent --no-verify-jwt --project-ref <ref> | Tee-Object -FilePath _deploy_tmp/m7_2_deploy_ai_agent.txt
```

Post-deploy proof scripts (examples):
- `_deploy_tmp/m7_2_proof_whatsapp_connect_list.mjs`
- `_deploy_tmp/m7_2_proof_ai_pipeline_dry_run.mjs`

## Phase 7: Gates
```powershell
rg -n "company_id" src supabase/functions | Tee-Object -FilePath _deploy_tmp/m7_2_rg_company_id.txt
cmd /c npx tsc --noEmit > _deploy_tmp/m7_2_tsc.txt 2>&1
cmd /c npx playwright test tests/e2e/m2-ia-smoke.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_2_pw_m2.txt
cmd /c npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_2_pw_m4.txt
cmd /c npx playwright test tests/e2e/m5-frontend-org.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_2_pw_m5.txt
cmd /c npx playwright test tests/e2e/m7-final-hardening.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_2_pw_m7.txt
cmd /c npx playwright test tests/e2e/m7_2-ai-settings-write.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_2_pw_ai_settings_write.txt
```

## Phase 8: Commit Scope
Commit only:
- `supabase/functions/whatsapp-connect/index.ts`
- `supabase/functions/ai-pipeline-agent/index.ts`
- `supabase/migrations/20260218_m7_2_ai_tables_hardening.sql`
- `docs/m7_2_runbook.md`
- `docs/walkthrough_m7_2.md`
- `tests/e2e/m7_2-ai-settings-write.spec.ts`

Commit message:
`M7.2: close audit findings (AI tables NOT NULL, whatsapp-connect org-aware, AI fail-fast, deploy proof)`
