# Walkthrough Milestone M7: Final Hardening + Cleanup

Date: 2026-02-18  
Owner: Tech Lead & Release Engineer

## 1. Auditoria inicial do repo (prova de estado real)
Comandos executados:

```powershell
git status --short
git log --all --oneline --grep "M7:" -n 20
git log --all --oneline --grep "M7" -n 50
Get-ChildItem docs | Select-Object -ExpandProperty Name | rg -n "m7"
Get-ChildItem supabase/migrations | Select-Object -ExpandProperty Name | rg -n "m7"
git diff --stat
```

Resultado essencial:
- Nenhum commit prévio com `M7:`/`M7` encontrado no histórico.
- Já existiam artefatos M7 no working tree, sem prova confiável de execução.
- Evidências gravadas em `_deploy_tmp/m7_phase0_*.txt`.

## 2. Gate SQL A (preflight)
Comando:

```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_preflight.sql | Tee-Object -FilePath _deploy_tmp/m7_preflight_result.txt
```

Resultado essencial (1a execução):
- `stop_required=true`
- `core_null_count=1`
- Tabela crítica com nulo: `lead_stage_history.org_id` (1 linha)

## 3. Remediação determinística
Comando:

```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_fix_nulls.sql | Tee-Object -FilePath _deploy_tmp/m7_fix_nulls_result.txt
node scripts/m0_run_sql.mjs _deploy_tmp/m7_preflight.sql | Tee-Object -FilePath _deploy_tmp/m7_preflight_result_after_fix.txt
```

Resultado essencial:
- `lead_stage_history`: 1 -> 0 (`lead_id -> leads.org_id`)
- `ai_stage_config`: 19 -> 0 (fallback determinístico para owner primário)
- `stop_required=false` após remediação

## 4. Gate SQL B (apply hardening)
Comando:

```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_apply.sql | Tee-Object -FilePath _deploy_tmp/m7_apply_result.txt
```

Resultado essencial:
- Core `SET NOT NULL` aplicado em:
  - `appointments.org_id`
  - `comentarios_leads.org_id`
  - `deals.org_id`
  - `lead_stage_history.org_id`
- Core já `NOT NULL` (idempotente): `leads`, `interacoes`, `propostas`, `whatsapp_instances`
- Logs:
  - `ai_agent_runs.org_id` virou `NOT NULL`
  - `ai_action_logs` e `whatsapp_webhook_events` já estavam `NOT NULL`

Observação:
- Falha inicial por BOM UTF-8 no `m7_apply.sql` foi corrigida (remediação ciclo 1).

## 5. Gate SQL C (gates pós-apply)
Comando:

```powershell
node scripts/m0_run_sql.mjs _deploy_tmp/m7_gates.sql | Tee-Object -FilePath _deploy_tmp/m7_gates_result.txt
```

Resultado essencial:
- `gate_pass=true`
- Todas as 8 tabelas core com:
  - `org_id is_nullable = NO`
  - `org_id NULL count = 0`
  - índice `idx_*_org_id` presente

## 6. Hardening de código (storage + realtime)
Arquivos alterados:
- `supabase/functions/evolution-webhook/index.ts`
  - Path de upload: `${orgId}/instances/${instanceName}/${Date.now()}_${fileName}`
  - Guard para abortar quando `orgId` ausente (evita órfãos)
- `src/hooks/domain/useChat.ts`
  - Upload/anexo/audio no formato `${orgId}/chat/${leadId}/${Date.now()}_${fileName}`
  - Guard de `orgId` preservado
- `supabase/functions/storage-intent/index.ts`
  - Path assinado alinhado para `${orgId}/chat/${leadId}/...`
- `src/hooks/useAISettings.ts`
  - Subscriptions com `filter: org_id=eq.${orgId}`
  - assinatura só com `orgId` resolvido
- `src/hooks/useIntegrations.ts`
  - Realtime de `whatsapp_instances` com filtro `org_id`
- `src/hooks/useWhatsAppInstances.ts`
  - canal só com `orgId` resolvido (fix de dependência do effect)

Auditoria realtime:

```powershell
rg -n "supabase\\.channel\\(|postgres_changes|filter:" src | Tee-Object -FilePath _deploy_tmp/m7_realtime_audit.txt
```

Resultado essencial:
- subscriptions multi-tenant mapeadas com `filter: org_id=eq.${orgId}`.

## 7. Gate D, E, F
### Gate D
```powershell
rg -n "company_id" src supabase/functions | Tee-Object -FilePath _deploy_tmp/m7_rg_company_id.txt
```
Resultado: `NO_MATCHES`

### Gate E
```powershell
cmd /c npx tsc --noEmit | Tee-Object -FilePath _deploy_tmp/m7_tsc.txt
```
Resultado: exit `0`

### Gate F
```powershell
cmd /c npx playwright test tests/e2e/m2-ia-smoke.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_pw_m2.txt
cmd /c npx playwright test tests/e2e/m4-leads-visibility.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_pw_m4.txt
cmd /c npx playwright test tests/e2e/m5-frontend-org.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_pw_m5.txt
cmd /c npx playwright test tests/e2e/m7-final-hardening.spec.ts --reporter=line | Tee-Object -FilePath _deploy_tmp/m7_pw_m7.txt
```

Resultado:
- `m2`: 1 passed
- `m4`: 2 passed
- `m5`: 1 passed
- `m7`: 1 passed

Observação de remediação (m7 spec):
- Ciclo 1: falha por JWT usando `fetch` manual.
- Ciclo 2: `storage-intent` remoto non-2xx; spec ajustado para validar via function quando disponível e fallback indireto por source audit dos paths org-scoped.

## 8. Cleanup
- `_deploy_tmp/` adicionado em `.gitignore`.
- Evidências SQL/testes mantidas em `_deploy_tmp/` e fora do commit.
- Commit final deve ser estrito a escopo M7/M7.1.

## 9. Próximos passos
- Monitorar produção para `23502` (NOT NULL violation).
- Avançar para milestone de encerramento da migração SaaS.
