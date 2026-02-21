# RUNBOOK M2 — Org ID & Backfill

## Resumo do Objetivo
O Milestone M2 estabelece o vínculo de dados com o modelo multiempresa. Adicionamos a coluna `org_id` às tabelas principais, preenchemos retroativamente (backfill) com base no dono do registro e unificamos as tabelas de IA para usar a nomenclatura padrão `org_id`.

## 0) Preflight Checklist
Antes de aplicar, verifique o estado do banco e do repositório.

- **Comandos**:
  - `git status` (Confirmar que M1 está commitado)
  - `node scripts/m0_run_sql.mjs _deploy_tmp/m2_preflight.sql`

- **Expectativa**:
  - Todas as tabelas listadas devem existir.
  - `organization_members` deve estar populado (M1 concluído).

## 1) DB Changes (Caminho B)
Executar via runner para evitar conflitos com migrations pendentes.

1. **Upload Scripts**: Certifique-se de que os arquivos em `_deploy_tmp/` estão presentes.
2. **Executar Aplicação**:
   ```bash
   node scripts/m0_run_sql.mjs _deploy_tmp/m2_apply.sql
   ```
3. **Validar Portões**:
   ```bash
   node scripts/m0_run_sql.mjs _deploy_tmp/m2_gates.sql
   ```

## 2) App & Code Changes
As seguintes mudanças devem ser aplicadas simultaneamente ao banco para evitar quebras no frontend/IA.

### A) Tipos de IA
**Arquivo**: [src/types/ai.ts](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/types/ai.ts)
```diff
 export interface AISettings {
     id: number;
-    company_id?: string;
+    org_id?: string;
     is_active: boolean; 
```
```diff
 export interface AIStageConfig {
     id: number;
-    company_id?: string;
+    org_id?: string;
     status_pipeline: string;
```

### B) Hooks de Configuração
**Arquivo**: [src/hooks/useAISettings.ts](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/useAISettings.ts)
```diff
-const STAGE_CONFIG_BASE_FIELDS = 'id, company_id, is_active, agent_goal, default_prompt, prompt_override, updated_at';
+const STAGE_CONFIG_BASE_FIELDS = 'id, org_id, is_active, agent_goal, default_prompt, prompt_override, updated_at';
```
```diff
-                if (!settingsData.company_id && !didInitCompanyId.current) {
+                if (!settingsData.org_id && !didInitCompanyId.current) {
                     didInitCompanyId.current = true;
                     const { data: { user } } = await supabase.auth.getUser();
                     const orgId = user?.user_metadata?.org_id || user?.id;
 
                     if (orgId) {
-                        console.log('🔧 Auto-fixing missing company_id in settings to:', orgId);
+                        console.log('🔧 Auto-fixing missing org_id in settings to:', orgId);
                         const { error: updateErr } = await supabase
                             .from('ai_settings')
                             .update({ org_id: orgId })
-                            .eq('id', settingsData.id);
+                            .eq('id', settingsData.id);
```

### C) Edge Function (Agente de IA)
**Arquivo**: [supabase/functions/ai-pipeline-agent/index.ts](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/supabase/functions/ai-pipeline-agent/index.ts)
```diff
-        orgId: string,
-        userId: string
+        orgId: string,
+        userId: string
```
(Nota: A função já utiliza `orgId` internamente em algumas variáveis, mas certifique-se de que a leitura do payload ou do banco use a nova coluna `org_id`).

## 3) Gates de Verificação
- **Gate SQL**: O script `m2_gates.sql` deve retornar `0` para colunas `org_id` nulas em tabelas com dados.
- **Gate Build**: Execute `npm run build` ou `npx tsc --noEmit`. Deve passar sem erros de "property 'company_id' does not exist".
- **Gate App**: Abrir a aba "IA" no CRM e confirmar que as configurações carregam (indicando que a query SQL e o tipo TS estão em sincronia).

## 4) Notas de Risco
- **Lock de Tabelas**: O backfill faz updates em massa. Em tabelas com >100k linhas, pode haver lentidão. (O script usa batches lógicos via join).
- **Consistência**: Se um usuário não tiver organização (erro no M1), seus registros ficarão com `org_id` NULL. O Gate 2 detecta isso.

## 5) Rollback / Backout
Se necessário desfazer:
1. **SQL**: `node scripts/m0_run_sql.mjs _deploy_tmp/m2_rollback.sql`
2. **Git**: `git checkout src/types/ai.ts src/hooks/useAISettings.ts supabase/functions/ai-pipeline-agent/index.ts`

## 6) Commit Plan
- **Migration**: Criar `supabase/migrations/20260218_m2_org_id_backfill.sql` com o conteúdo do `m2_apply.sql`.
- **Mensagem**: `M2: Add org_id to core tables + AI rename company_id + backfill`
