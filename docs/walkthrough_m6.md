# M6 Walkthrough - Edge Functions Org-Aware

Date: 2026-02-18  
Runbook: `docs/m6_runbook.md`

## Schema hotfix formalizado (M6.1)

### Motivo

Durante a execução do M6 no ambiente remoto, foi identificado drift de schema: as colunas abaixo não existiam em alguns ambientes e precisaram de hotfix aditivo para não quebrar preflight/gates e escrita org-aware:

- `public.ai_action_logs.org_id`
- `public.whatsapp_webhook_events.org_id`

Para eliminar esse drift entre ambientes (inclusive novos), o hotfix foi formalizado em migration oficial.

### Migration criada

- `supabase/migrations/20260218_m6_1_schema_hotfix_org_id_logs.sql`

Escopo da migration:

- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS org_id uuid` nas duas tabelas.
- `CREATE INDEX IF NOT EXISTS` para `org_id` nas duas tabelas.
- Backfill determinístico com guardas de existência de coluna:
  - `ai_action_logs` por coluna de run (`ai_agent_run_id`/`agent_run_id`/`run_id`) quando existir; fallback por `lead_id`.
  - `whatsapp_webhook_events` por `instance_name`; fallback por `interaction_id`.
- Sem `NOT NULL`, sem alteração de RLS/policies e sem relaxamento de segurança.

### Evidências (Path B)

Comando de verificação de schema (pré e pós formalização documental):

```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m6_1_schema_check.sql | Tee-Object -FilePath _deploy_tmp/m6_1_schema_check_result.txt
node scripts/m0_run_sql.mjs _deploy_tmp/m6_1_schema_check.sql | Tee-Object -FilePath _deploy_tmp/m6_1_schema_check_after_result.txt
```

Resultado essencial observado em ambos:

- `column ai_action_logs.org_id -> exists_flag=true`
- `column whatsapp_webhook_events.org_id -> exists_flag=true`
- `index idx_ai_action_logs_org_id -> exists_flag=true`
- `index idx_whatsapp_webhook_events_org_id -> exists_flag=true`

Obs: nesta etapa M6.1 não foi executado `supabase db push`; a ação foi apenas formalização de migration para reproduzibilidade.
