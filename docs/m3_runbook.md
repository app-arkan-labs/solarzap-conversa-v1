# RUNBOOK M3 — RLS Org-Scoped Isolation

## Resumo do Objetivo
O Milestone M3 implementa o isolamento real entre organizações. Configuramos as Row Level Security (RLS) policies para que usuários autenticados acessem apenas dados vinculados à sua `org_id`. Também endurecemos as RPCs (funções de banco) para validar o acesso cross-org.

## 0) Preflight Checklist
Antes de aplicar, valide a integridade dos dados do M2.

- **Comandos**:
  - `git status` (Confirmar base limpa do M2)
  - `node scripts/m0_run_sql.mjs _deploy_tmp/m3_preflight.sql`

- **Expectativa**:
  - `null_org_ids` deve ser **0** para todas as tabelas listadas.
  - Se houver `null_org_ids > 0`, **PARE** e rode o backfill do M2 novamente.

## 1) DB Changes (Caminho B - Recomendado)
Execute via runner oficial para evitar conflitos de migrations.

1. **Garantir Scripts**: Verifique os arquivos em `_deploy_tmp/`.
2. **Aplicar Isolamento**:
   ```bash
   node scripts/m0_run_sql.mjs _deploy_tmp/m3_apply.sql
   ```
3. **Validar Portões Técnicos**:
   ```bash
   node scripts/m0_run_sql.mjs _deploy_tmp/m3_gates.sql
   ```

## 2) Gates de Isolamento (Manual/Script)
Além dos gates SQL, prove o isolamento:

### Gate de Isolamento Cross-Org:
1.  Obtenha o JWT de dois usuários de organizações diferentes (A e B).
2.  Tente listar leads da Org B usando o JWT do Usuário A via curl:
    ```bash
    curl -X GET "https://[REF].supabase.co/rest/v1/leads?select=id,org_id" \
    -H "Authorization: Bearer [JWT_USER_A]" \
    -H "apikey: [ANON_KEY]"
    ```
3.  **PASS**: A resposta deve conter **apenas** registros onde `org_id` pertence ao Usuário A.

### Gate RPC Hardening:
1.  Chame `knowledge_search_v2` passando um `p_org_id` que não pertence ao seu usuário.
2.  **PASS**: O Supabase deve retornar erro `400 Bad Request` ou `500` com a mensagem `Unauthorized: User does not belong to organization`.

## 3) Rollback / Backout
Se o sistema apresentar erros de permissão inesperados:
1. **SQL**: `node scripts/m0_run_sql.mjs _deploy_tmp/m3_rollback.sql`
2. **Impacto**: Retorna as policies ao estado auditado no início do M3.

## 4) Notas de Risco
- **Performance**: O lookup na função `user_belongs_to_org` é rápido, mas em tabelas com milhões de linhas, certifique-se de que os índices em `org_id` (criados no M2) estão ativos.
- **Transição**: O frontend ainda não envia `org_id` em todos os filtros. O RLS de SELECT funcionará, mas INSERTS/UPDATES podem falhar se o campo estiver vazio. (M2 mitigou isso permitindo NULL temporariamente, mas M3 exige o vínculo se a policy FOR ALL for estrita).
