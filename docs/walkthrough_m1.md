# Walkthrough M1 - Organizations Foundation

## Contexto
- Data de execucao: 2026-02-18
- Objetivo: executar M1 conforme `docs/m1_runbook.md`
- Restricoes aplicadas:
  - `supabase db push` **nao utilizado**
  - Caminho B utilizado (SQL direto via runner `scripts/m0_run_sql.mjs`)
  - Sem alteracoes no webhook / M0 / rotacao de secrets

## 0) Preflight

### Comando
```powershell
git status --short
```

### Output (relevante - snapshot inicial)
```text
M .gitignore
M package.json
M supabase/config.toml
M supabase/functions/evolution-webhook/index.ts
D supabase/migrations/20260212_lead_tasks.sql
?? supabase/migrations/20260212170000_kb_items_in_rag.sql
?? supabase/migrations/20260212170100_proposal_premium_foundation.sql
?? supabase/migrations/20260212170200_lead_tasks.sql
?? supabase/migrations/20260212170300_create_kb_items.sql
?? supabase/migrations/20260212170400_proposal_sections.sql
?? supabase/migrations/20260213090000_kb_ingest_chunks_and_search_v3.sql
?? supabase/migrations/20260213090100_storage_knowledge_base_bucket.sql
?? supabase/migrations/20260213090200_knowledge_search_v3_relaxed_tsquery.sql
?? supabase/migrations/20260213090300_knowledge_search_v3_lexeme_order.sql
?? supabase/migrations/20260213090400_knowledge_search_v3_fix_lexeme_order.sql
?? supabase/migrations/20260213160000_qr_scan_events.sql
... (demais mudancas locais nao relacionadas)
```

### Comando
```powershell
Get-ChildItem -Name supabase/migrations | Sort-Object
```

### Output
```text
20260126_webhook_audit.sql
20260127_add_instance_colors.sql
20260127_fix_schema_missing_columns.sql
...
20260213090300_knowledge_search_v3_lexeme_order.sql
20260213090400_knowledge_search_v3_fix_lexeme_order.sql
20260213160000_qr_scan_events.sql
```

### Comando
```powershell
supabase --version
```

### Output
```text
supabase : O termo 'supabase' nao e reconhecido...
```

### Decisao
- Repo confirmado como **sujo**.
- Como `supabase` CLI nao estava disponivel localmente, execucao feita por **Caminho B** com:
```powershell
node scripts/m0_run_sql.mjs <arquivo_sql>
```
- Observacao de seguranca: `scripts/m0_run_sql.mjs` contem token de API, tratado como `[REDACTED]` neste registro.

## 1) DB Changes (SQL)

### Comando
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m1_section1.sql
```

### Output
```text
HTTP 201
[]
```

## 2) Backfill Strategy

### Tentativa inicial (falhou por ordem de execucao em paralelo)
#### Comando
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m1_section2.sql
```

#### Output
```text
HTTP 400
{
  "message": "Failed to run sql query: ERROR:  42P01: relation \"public.organizations\" does not exist
LINE 2: INSERT INTO public.organizations (name, owner_id)
                    ^
"
}
```

### Retry sequencial (sucesso)
#### Comando
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m1_section2.sql
```

#### Output
```text
HTTP 201
[]
```

## 3) App/Frontend Minimal Changes
- Nenhuma mudanca de UI realizada (conforme runbook).

## 4) Gates

### Gate 1 - Tabelas criadas
#### Comando
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m1_gate1.sql
```

#### Output
```text
HTTP 201
[
  { "table_name": "organization_members" },
  { "table_name": "organizations" }
]
```

#### Status
- PASS (2 linhas)

### Gate 2 - Backfill completo
#### Comando
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m1_gate2.sql
```

#### Output
```text
HTTP 201
[
  { "backfill_ok": true }
]
```

#### Status
- PASS

### Gate 3 - Memberships owner
#### Comando
```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m1_gate3.sql
```

#### Output
```text
HTTP 201
[
  {
    "owner_memberships": 4,
    "users_count": 4,
    "gate3_ok": true
  }
]
```

#### Status
- PASS (`owner_memberships == users_count`)

### Gate 4 - Smoke app load/login

#### Tentativa 1 (falha de ambiente shell)
##### Comando
```powershell
npx playwright test tests/e2e/m1-login-gate.spec.ts
```

##### Output
```text
npx : ... execucao de scripts foi desabilitada neste sistema ...
```

#### Tentativa 2 (sucesso via `cmd /c`)
##### Comando
```powershell
cmd /c npx playwright test tests/e2e/m1-login-gate.spec.ts
```

##### Output
```text
Running 1 test using 1 worker
ok 1 [chromium] > tests\e2e\m1-login-gate.spec.ts:15:1 > M1 Gate 4: app load + login smoke (8.5s)
1 passed (24.6s)
```

#### Status
- PASS

## 5) Rollback/Backout
- Nao executado (nao necessario).

## 6) Commit Plan executado
- Migration espelho criada (sem `db push`):  
  `supabase/migrations/20260218_m1_organizations_foundation.sql`
- Walkthrough criado/atualizado:  
  `docs/walkthrough_m1.md`
- Spec temporario de gate 4 foi removido apos validacao.
