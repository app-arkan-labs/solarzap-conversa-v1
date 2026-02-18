# Runbook M7: Final Hardening + Cleanup

Date: 2026-02-18  
Owner: Tech Lead / DBA

## Scope
- Final hardening of `org_id` in multi-tenant mode.
- Storage path org-scoped for webhook + chat uploads.
- Realtime subscriptions sealed with `org_id` filters.
- Strict proof gates before commit.

## Rules
- Execute sequentially (no parallel execution).
- SQL runner path B only: `node scripts/m0_run_sql.mjs <sql_file>`.
- Do not use `supabase db push`.
- Do not commit `_deploy_tmp/`.
- Do not use `min(uuid)`; deterministic selection must use sorted `array_agg(...)[1]` or ordered `LIMIT 1`.
- Auto-remediation allowed for up to 2 cycles per failed gate.
- Stop only on real data-loss risk or non-deterministic remediation.

## Phase 0: Repo Audit (evidence only)
Run and save all outputs to `_deploy_tmp/`:

```powershell
git status --short | Tee-Object -FilePath _deploy_tmp/m7_phase0_git_status_short.txt
git log --all --oneline --grep "M7:" -n 20 | Tee-Object -FilePath _deploy_tmp/m7_phase0_git_log_m7.txt
git log --all --oneline --grep "M7" -n 50 | Tee-Object -FilePath _deploy_tmp/m7_phase0_git_log_m7_any.txt
Get-ChildItem docs | Select-Object -ExpandProperty Name | rg -n "m7" | Tee-Object -FilePath _deploy_tmp/m7_phase0_docs_m7.txt
Get-ChildItem supabase/migrations | Select-Object -ExpandProperty Name | rg -n "m7" | Tee-Object -FilePath _deploy_tmp/m7_phase0_migrations_m7.txt
git diff --stat | Tee-Object -FilePath _deploy_tmp/m7_phase0_git_diff_stat.txt
```

If an M7 commit hash exists, capture evidence:

```powershell
git show --name-only --pretty=format:"%H%n%s" <hash_M7> | Tee-Object -FilePath _deploy_tmp/m7_phase0_show_name_only.txt
git show --stat <hash_M7> | Tee-Object -FilePath _deploy_tmp/m7_phase0_show_stat.txt
```

## Phase 1: SQL Preflight (Gate A)
Required scripts in `_deploy_tmp/`:
- `m7_preflight.sql`
- `m7_fix_nulls.sql`
- `m7_apply.sql`
- `m7_gates.sql`
- `m7_rollback.sql`

Run preflight:

```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_preflight.sql | Tee-Object -FilePath _deploy_tmp/m7_preflight_result.txt
```

Expected in report:
- `stop_required` boolean.
- NULL counts by table (core/log/aux).
- `org_id` nullable status per table.
- `idx_*_org_id` evidence.
- org-related constraints snapshot.

## Phase 2: Deterministic Remediation (if needed)
If any core table has `org_id IS NULL`:

```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_fix_nulls.sql | Tee-Object -FilePath _deploy_tmp/m7_fix_nulls_result.txt
node scripts/m0_run_sql.mjs _deploy_tmp/m7_preflight.sql | Tee-Object -FilePath _deploy_tmp/m7_preflight_result_after_fix.txt
```

Remediation order in `m7_fix_nulls.sql`:
1. `lead_id -> leads.org_id`
2. `user_id -> organization_members.org_id`
3. `instance_name -> whatsapp_instances.org_id`
4. fallback deterministic primary owner org/user (oldest owner by `joined_at` when available, else lowest `org_id`)

## Phase 3: Apply Hardening (Gate B + Gate C)
Run apply only if preflight shows `stop_required=false` for core:

```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_apply.sql | Tee-Object -FilePath _deploy_tmp/m7_apply_result.txt
node scripts/m0_run_sql.mjs _deploy_tmp/m7_gates.sql | Tee-Object -FilePath _deploy_tmp/m7_gates_result.txt
```

Expected:
- Core tables: `org_id` is `NOT NULL` and null count is `0`.
- Core `idx_*_org_id` indexes exist.
- Gate output has `gate_pass=true`.

## Phase 4: Code Hardening
### Storage (org-scoped)
- `supabase/functions/evolution-webhook/index.ts`
  - Upload path must be:
  - `${orgId}/instances/${instanceName}/${Date.now()}_${fileName}`
  - Guard: abort when `orgId` missing.
- `src/hooks/domain/useChat.ts`
  - Upload/anexo path must be:
  - `${orgId}/chat/${leadId}/${Date.now()}_${fileName}`
  - Guard: abort when `orgId` missing.
- `supabase/functions/storage-intent/index.ts`
  - Signed path must follow the same org-scoped pattern.

### Realtime seal
Audit and keep proof:

```powershell
rg -n "supabase\\.channel\\(|postgres_changes|filter:" src | Tee-Object -FilePath _deploy_tmp/m7_realtime_audit.txt
```

Requirements:
- Realtime subscriptions on multi-tenant tables include `filter: org_id=eq.${orgId}`.
- Subscription starts only when `orgId` is resolved.

## Phase 5: Code/Test Gates
### Gate D
```powershell
rg -n "company_id" src supabase/functions | Tee-Object -FilePath _deploy_tmp/m7_rg_company_id.txt
```
Expected: no matches.

### Gate E
```powershell
cmd /c npx tsc --noEmit | Tee-Object -FilePath _deploy_tmp/m7_tsc.txt
```
Expected: exit code `0`.

### Gate F
```powershell
cmd /c npx playwright test tests/e2e/m2-ia-smoke.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_pw_m2.txt
cmd /c npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_pw_m4.txt
cmd /c npx playwright test tests/e2e/m5-frontend-org.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_pw_m5.txt
cmd /c npx playwright test tests/e2e/m7-final-hardening.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_pw_m7.txt
```

If any gate fails:
- apply minimal deterministic fix
- rerun only failed gate
- max 2 cycles

## Phase 6: Cleanup + Commit
- Ensure `_deploy_tmp/` is in `.gitignore`.
- Never commit scripts with tokens/secrets.
- Commit only M7/M7.1 scoped files:
  - `docs/m7_runbook.md`
  - `docs/walkthrough_m7.md`
  - `supabase/migrations/20260218_m7_final_hardening.sql`
  - `_deploy_tmp/m7_*.sql` (local only, do not add to git)
  - M7 code patches
  - `tests/e2e/m7-final-hardening.spec.ts`

Commit message:
- If no prior M7 commit:  
  `M7: final hardening + cleanup (NOT NULL org_id, storage paths, realtime org filters)`
- If prior M7 exists:  
  `M7.1: verify+fix hardening (proof gates + regressions)`

Final proof commands:

```powershell
git show --name-only -1
git status --short
```

Confirm `_deploy_tmp/` is not in the committed file list.

## Rollback
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_rollback.sql | Tee-Object -FilePath _deploy_tmp/m7_rollback_result.txt
```

Rollback scope:
- Drop `NOT NULL` for M7-targeted `org_id` columns.
- Keep additive indexes.
