# M3 Walkthrough - Org-Scoped RLS Isolation (Path B)

Date: 2026-02-18  
Mode: AUTO-REMEDIATION (max 3 cycles)  
Scope: M3 only

## 1) Preflight and baseline

Command:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m3_preflight.sql
```

Result:

- HTTP 201
- `preflight_ok=true`
- core tables with `org_id IS NULL`: all `0` at preflight time.

Repo baseline snapshot:

```bash
git status --short
```

Repo is dirty with many unrelated changes; commit was kept strict to M3 files only.

## 2) Apply M3 (already prepared)

Command:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m3_apply.sql
```

Result:

- HTTP 201
- `apply_ok=true`
- `backup_policy_rows=53`
- `backup_function_rows=2`

## 3) First gate result and failure reason

Command:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m3_gates.sql
```

Result:

- HTTP 201
- `gate_pass=false`
- Failure cause: `core_nulls.interacoes > 0` (new NULL `org_id` rows appeared after apply due active write paths not sending `org_id` yet).

## 4) Auto-remediation cycle 1 (Type A)

### 4.1 Backfill fix for `interacoes.org_id`

Created script:

- `_deploy_tmp/m3_fix_interacoes_nulls.sql`

Rules implemented (idempotent):

1. `lead_id -> leads.org_id`
2. `user_id -> organization_members.org_id` using `(array_agg(org_id ORDER BY org_id))[1]`
3. `instance_name -> whatsapp_instances.org_id`
4. deterministic fallback to primary owner org (ordered by `joined_at` when present, fallback by `org_id`)

Command:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m3_fix_interacoes_nulls.sql
```

Result:

- HTTP 201
- `interacoes_null_org_id` after fix: `0`

Observed before fix in this cycle:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m3_interacoes_null_before.sql
```

- HTTP 201
- `interacoes_null_before=21`

### 4.2 Transitional trigger to prevent recurrence

Created script:

- `_deploy_tmp/m3_interacoes_org_trigger.sql`

Created objects:

- function `public.m3_fill_interacoes_org_transitional()`
- trigger `m3_fill_interacoes_org_transitional_trg` (`BEFORE INSERT OR UPDATE` on `public.interacoes`)

Fill order in trigger:

1. `lead_id -> leads.{org_id,user_id}`
2. `user_id -> organization_members.org_id`
3. `instance_name -> whatsapp_instances.{org_id,user_id}`
4. fallback to primary owner org/user

Command:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m3_interacoes_org_trigger.sql
```

Result:

- HTTP 201
- trigger/function created successfully

### 4.3 Re-run gates

Command:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m3_gates.sql
```

Result:

- HTTP 201
- `gate_pass=true`
- `core_nulls`: all 8 core tables are `0`
- helper function gate: all checks true
- backup gate: backup table exists and has rows
- RPC hardening gate: true

## 5) Smoke gates

Typecheck:

```bash
cmd /c npx tsc --noEmit
```

- Exit 0 (`TSC_EXIT=0`)

Playwright smoke:

```bash
cmd /c npx playwright test tests/e2e/m2-ia-smoke.spec.ts --reporter=line
```

- Exit 0
- `1 passed`

## 6) Cross-org isolation proof (real JWT, no SET ROLE)

Script used:

- `_deploy_tmp/m3_cross_org_proof.mjs`

What it does:

1. Creates user A and user B via Admin API (`service_role`).
2. Creates org A and org B.
3. Creates memberships owner A->orgA and B->orgB.
4. Inserts one lead in each org via `service_role`.
5. Signs in each user with anon key (password grant) and gets JWT.
6. Queries `/rest/v1/leads` with JWT_A and JWT_B.
7. Asserts no overlap and each user sees only own org lead.

Command:

```bash
node _deploy_tmp/m3_cross_org_proof.mjs
```

Result summary:

- `cross_org_pass=true`
- `visibleA_count=1`
- `visibleB_count=1`
- `overlap_count=0`

Evidence snapshot (`_deploy_tmp/m3_cross_org_proof_result.json`):

- `orgA=81e01544-9942-47e8-aae3-7fb306b28470`
- `orgB=e9d8d390-c9fc-4d23-ab72-4cc42ee8f421`
- `leadAId=276`, `leadBId=277`
- `seesAOwnLead=true`, `seesBOwnLead=true`
- `seesAOtherLead=false`, `seesBOtherLead=false`

## 7) Security notes

- No `supabase db push` executed.
- Path B only (`node scripts/m0_run_sql.mjs ...` + controlled scripts).
- Secrets/tokens are redacted in documentation as `[REDACTED]`.

## 8) Rollback

Rollback script prepared but **not executed**:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m3_rollback.sql
```

## 9) M3 artifact files

- `docs/walkthrough_m3.md`
- `supabase/migrations/20260218_m3_rls_org_scoped.sql`

