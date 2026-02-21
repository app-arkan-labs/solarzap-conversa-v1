# Runbook Milestone M6: Edge Functions Org-Aware

## 1) Preflight (Audit)
Detectar falhas de isolamento antes do deploy.

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m6_preflight.sql
```
**NÃO AVANCE SE**: O preflight retornar um erro ou indicar registros órfãos recentes.

## 2) Passos de Implementação (Apply)

### Passo 1: Evolution Webhook
**Arquivo**: `supabase/functions/evolution-webhook/index.ts`
- **Resolução**: Buscar `org_id` da instância.
```typescript
const { data: instanceRow } = await supabase
  .from('whatsapp_instances')
  .select('org_id, user_id')
  .eq('instance_name', instanceName)
  .single();
const orgId = instanceRow?.org_id;
```
- **Escrita**: Injetar `org_id: orgId` em todos os inserts de `interacoes` e `whatsapp_webhook_events`.

### Passo 2: AI Pipeline Agent
**Arquivo**: `supabase/functions/ai-pipeline-agent/index.ts`
- **Resolução**: Buscar `org_id` do lead.
```typescript
const { data: lead } = await supabase
  .from('leads')
  .select('org_id, user_id, ...')
  .eq('id', leadId)
  .single();
const orgId = lead?.org_id;
```
- **Escrita**: Garantir que queries em `ai_stage_config`, `ai_settings` e `kb_items` filtrem por `org_id`. Injetar `org_id` em `ai_agent_runs` e `ai_action_logs`.

### Passo 3: WhatsApp Connect
**Arquivo**: `supabase/functions/whatsapp-connect/index.ts`
- **Resolução**: Obter do portador do JWT.
```typescript
const { data: member } = await supabase
  .from('organization_members')
  .select('org_id')
  .eq('user_id', user.id)
  .limit(1)
  .single();
const orgId = member?.org_id;
```
- **Escrita**: `insert({ ... , org_id: orgId })` em `whatsapp_instances`.

## 3) Deploy das Functions
Execute o deploy para as funções principais:
```bash
npx supabase functions deploy evolution-webhook --no-verify-jwt
npx supabase functions deploy ai-pipeline-agent --no-verify-jwt
npx supabase functions deploy whatsapp-connect
```
*Atenção: Acompanhe os logs em `supabase functions serve` localmente se possível antes do push.*

## 4) Gates de Verificação

### Gate 1: SQL Audit (Service Role Proof)
Detecta se novas inserções ignoraram o `org_id`.
```sql
SELECT id, org_id, created_at 
FROM interacoes 
WHERE org_id IS NULL AND created_at > (now() - interval '1 hour');
-- DEVE RETORNAR 0 LINHAS.
```

### Gate 2: Prova Funcional (IA)
Verificar se o `ai_agent_runs` capturou o `org_id` do lead.
```sql
SELECT id, lead_id, org_id 
FROM ai_agent_runs 
ORDER BY created_at DESC LIMIT 1;
-- DEVE TER org_id IGUAL AO DA leads.
```

## 5) Rollback
- **Code**: `git revert` dos patches aplicados.
- **Functions**: `npx supabase functions deploy ...` da versão anterior.
- **SQL**: Nenhum rollback de schema é necessário (as colunas permanecem nullable).

## 6) Commit Plan
- **Mensagem**: `M6: Edge functions org-aware (Evolution, AI Agent, Connect)`
- **Arquivos**: `supabase/functions/evolution-webhook/index.ts`, `supabase/functions/ai-pipeline-agent/index.ts`, `supabase/functions/whatsapp-connect/index.ts`.
