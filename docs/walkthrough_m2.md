# Walkthrough M2 - Org ID & Backfill

## Context
- Data: 2026-02-18
- Estrategia: Caminho B (SQL direto via `node scripts/m0_run_sql.mjs`)
- `supabase db push`: nao utilizado
- Repo estava sujo com mudancas nao relacionadas; commit final foi estrito ao escopo M2.

## Preflight

### Comando
```powershell
git status --short
```

### Resultado
- Confirmado worktree sujo com muitas mudancas fora do M2.
- Execucao continuou com SQL direto em `_deploy_tmp/`.

### Comando
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m2_preflight.sql
```

### Output relevante
```text
HTTP 201
preflight_report.critical_ok = true
m1_population.users_count = 4
m1_population.organizations_count = 4
m1_population.organization_members_count = 4
```

## Apply SQL (M2)

### Primeira tentativa
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m2_apply.sql
```
```text
HTTP 400
ERROR: function min(uuid) does not exist
```

### Correcao aplicada
- Backfill ajustado de `min(org_id)` para `(array_agg(org_id ORDER BY org_id))[1]`.

### Reexecucao
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m2_apply.sql
```
```text
HTTP 201
```

## Fix de Nulos + Orphan Patch

### Fix inicial de nulos
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m2_fix_nulls.sql
```
```text
HTTP 201
fix_report.stop_required = true
nulls_after: leads=5, interacoes=34, propostas=6, comentarios_leads=1
```

### Orphan patch (regra explicita para legados)
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m2_orphans_patch.sql
```
```text
HTTP 201
orphan_patch_report.stop_required = false
null_counts: leads=0, interacoes=0, propostas=0, comentarios_leads=0
```

## Gates SQL finais

### Comando
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m2_gates.sql
```

### Output relevante
```text
HTTP 201
gates_report.gate_pass = true
gates_report.core_nulls = { leads:0, interacoes:0, propostas:0, comentarios_leads:0 }
gates_report.indexes[*].exists = true
gate_ai_columns.ai_by_table: ai_settings/ai_stage_config/ai_agent_runs/ai_summaries com has_org_id=true e has_company_id=false
```

## Code Changes (M2)

Arquivos alterados para eliminar `company_id` no modulo IA:
- `src/types/ai.ts`
- `src/hooks/useAISettings.ts`
- `supabase/functions/ai-pipeline-agent/index.ts`

## Build/Smoke Gates

### Referencias de `company_id`
```powershell
rg -n "company_id" src supabase/functions
```
```text
NO_MATCHES
```

### Typecheck
```powershell
cmd /c npx tsc --noEmit
```
```text
Exit 0 (sem erros)
```

### Smoke E2E minimo (login + IA)
```powershell
cmd /c npx playwright test tests/e2e/m2-ia-smoke.spec.ts
```
```text
1 passed (10.6s)
```

## Migration Espelho
- Criada: `supabase/migrations/20260218_m2_org_id_nullable_backfill.sql`
- Conteudo: add `org_id` nullable nas tabelas core, indexes, rename condicional `company_id -> org_id` nas tabelas IA, backfills idempotentes e orphan patch deterministico.

## Rollback
- Arquivo preparado: `_deploy_tmp/m2_rollback.sql`
- Rollback nao executado.
