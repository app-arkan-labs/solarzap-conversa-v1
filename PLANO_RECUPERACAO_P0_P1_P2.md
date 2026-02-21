# 📋 AUDITORIA FORENSE COMPLETA + PLANO EXECUTÁVEL P0/P1/P2

**Data:** 21 de Fevereiro de 2026  
**Versão:** 1.0  
**Status:** ✅ Pronto para Execução

---

## ✅ FASE 0: PRESERVAÇÃO CONFIRMADA

### Estado Atual

```
Branch: m0-hardening
HEAD: e013b48 (feat: Introduce new AI agent and evolution webhook functions...)
Working Dir: LIMPO (sem uncommitted changes)
```

### Ponteiros de Segurança Criados

- ✅ Tag: `backup-pre-recovery-20260221` → e013b48
- ✅ Branch: `backup-pre-recovery-20260221` → e013b48

### Branches Existentes

- `m0-hardening` (current) → e013b48
- `recuperacao-estavel` (stable base) → 2964dd4
- `rescue-emergencia-20260221-1522` → e013b48
- `rescue-forense-20260221-1556` → e013b48
- `main`, `master`, `Hope` (remotes)

### Tags

- `pre-debug-ai-rollback` → f30255c (SolarZap V1 — não confiável)

---

## 📊 INVENTÁRIO FORENSE: 176 ARQUIVOS ALTERADOS (24.914 linhas)

### Mapa de Mudanças (2964dd4 → e013b48)

---

## A) SEGURANÇA / INTEGRAÇÃO IA (P0 — CRÍTICO)

### ACHADOS CRÍTICOS

#### ❌ FALHA P0.1: Credenciais Evolution Hardcoded no Frontend

**Localização:**
- `src/services/whatsappService.ts` (Modified)
- Linhas 12-13

**Problema:**
```typescript
private baseUrl = 'https://evo.arkanlabs.com.br';
private apiKey = 'eef86d79f253d5f295edcd33b578c94b';
```

**Risco:** API key exposto publicamente no código-fonte (cliente browser)

**Necessário:** Remover API key, usar evolution-proxy edge function

#### ✅ SOLUÇÃO CRIADA: evolution-proxy Edge Function

**Localização:**
- `supabase/functions/evolution-proxy/index.ts` (Advanced — 522 linhas)

**Características:**
- Implementa proxy com validação de contexto (JWT + internal key)
- Acesso ao EVOLUTION_API_URL, EVOLUTION_API_KEY via variáveis de ambiente
- Valida org_id em cada requisição
- **Status:** Pronto para uso, precisa ser integrado ao frontend

#### Whatsapp-webhook — Validação de Assinatura

**Localização:**
- `supabase/functions/whatsapp-webhook/index.ts` (New — 739 linhas)

**Características:**
- Valida secret **SOMENTE via header** `x-arkan-webhook-secret` (em PRODUÇÃO)
- Query param apenas em DEV (se necessário para testes locais com feature flag)
- Recebe eventos de Evolution API
- **Status:** Implementado, precisa de consolidação com evolution-webhook

#### Multi-tenant Hardening (KB + Permissions)

**Localização:**
- `supabase/migrations/20260220090000_p0_kb_multitenant_hardening.sql` (New — 307 linhas)

**Características:**
- Adiciona RLS policies pro KB (knowledge-base)
- Filtragem por `org_id` em storage + tabelas
- **Status:** Migration existe, precisa verif se aplicada + validação

### ARQUIVOS A TOCAR (P0)

| Arquivo | Tipo | Ação |
|---------|------|------|
| `src/services/whatsappService.ts` | M | Remover API key hardcoded, redirecionar p/ evolution-proxy |
| `src/components/solarzap/WhatsAppInstancesManager.tsx` | M | Validar se usa evolution-proxy após fix |
| `supabase/functions/evolution-proxy/index.ts` | A | Revisar + confirmar deployment |
| `supabase/functions/whatsapp-webhook/index.ts` | A | Validar integração com ai-pipeline-agent |
| `supabase/functions/evolution-webhook/index.ts` | M | Revisar mudanças, eliminar dups com whatsapp-webhook |
| `supabase/migrations/20260220090000_p0_kb_multitenant_hardening.sql` | A | Revisar conteúdo + status de aplicação |

---

## B) EDGE FUNCTIONS / IA (P1 — FUNCIONALIDADES)

### NOVOS EDGE FUNCTIONS (Propostas + Notificações + KB)

| Edge Function | Tipo | Linhas | Descrição |
|---|---|---|---|
| `ai-pipeline-agent/index.ts` | M | +20, -6 | Fix: repairMojibake() para UTF-8, charset=utf-8 em mensagens |
| `evolution-proxy/index.ts` | A | 522 | **Proxy crítico:** valida Evolution API calls |
| `whatsapp-webhook/index.ts` | A | 739 | Recebe eventos WhatsApp de Evolution |
| `evolution-webhook/index.ts` | M | +72, -? | Webhook Evolution original (pode duplicar com whatsapp-webhook?) |
| `kb-ingest/index.ts` | A | 389 | Ingestão de documentos pro Knowledge Base |
| `proposal-composer/index.ts` | A | 389 | Gera propostas via AI |
| `proposal-context-engine/index.ts` | A | 281 | Contextualiza propostas com dados do lead |
| `proposal-copy-generator/index.ts` | A | 308 | Gera textos de proposta |
| `proposal-share-link/index.ts` | A | 156 | Link compartilhável de proposta |
| `proposal-share/index.ts` | A | 173 | Enviador de proposta (WhatsApp/email?) |
| `proposal-storage-intent/index.ts` | A | 125 | Armazena intent de proposta (P1) |
| `ai-digest-worker/index.ts` | A | 459 | **P2:** Gera digests diários/semanais |
| `notification-worker/index.ts` | A | 457 | **P1:** Worker de notificações (WhatsApp/email) |

### STATUS

- ✅ **P1 Ready:** proposal-*, kb-ingest
- ⚠️ **P1 Pending:** validar integração whatsapp-webhook ↔ ai-pipeline-agent
- ⚠️ **P2 Pending:** notification-worker, ai-digest-worker (features futuras)

---

## C) UI / FRONTEND (P1 — COMPONENTES + NOVOS)

### COMPONENTES CRIADOS (Features P1)

| Componente | Localização | Tipo | Linhas | Descrição |
|---|---|---|---|---|
| `NotificationSettingsCard.tsx` | `src/components/solarzap/` | A | 330 | **UI P1:** Settings p/ notificações (toggles, email, etc.) |
| `ProposalsView.tsx` | `src/components/solarzap/` | A | 505 | **UI P1:** Tab "Propostas" — listagem + filtros + PDF link |
| `VisitOutcomeAfterModal.tsx` | `src/components/solarzap/` | A | 102 | **UI P1:** Modal pós-visita (+3h), registra outcome |

### COMPONENTES MODIFICADOS

| Componente | Tipo | Descrição |
|---|---|---|
| `ContactsView.tsx` | M | Mudanças em rendering/filtros (verificar impacto) |
| `ConversationList.tsx` | M | Mudanças em listagem/seleção (verificar impacto) |

### CONSTANTES / HOOKS / UTILS (Suporte IA + Propostas)

| Arquivo | Tipo | Descrição |
|---|---|---|
| `src/constants/aiPipelineAgents.ts` | A | Configuração de agentes IA (stages, prompts, etc.) |
| `src/constants/aiPipelinePdfPrompts.ts` | A | Prompts p/ geração de PDF de propostas |
| `src/constants/aiSupportStages.ts` | A | Stages onde IA pode atuar |
| `src/hooks/useNotificationSettings.ts` | A | Hook p/ ler/escrever settings de notificações |
| `src/hooks/useProposalMetrics.ts` | A | Hook p/ métricas de propostas (taxa conversão, etc.) |
| `src/utils/proposalPersonalization.ts` | A | Lógica de personalização de propostas |

### PÁGINAS

| Página | Tipo | Descrição |
|---|---|---|
| `src/pages/CallQrRedirect.tsx` | A | Redirecionamento QR code de chamada (integração Evolution) |
| `src/pages/UpdatePassword.tsx` | A | Página de atualização de senha |

### STATUS

- ✅ **P1 Ready:** ProposalsView, VisitOutcomeAfterModal, NotificationSettingsCard
- ⚠️ **P1 Pending:** Validar imports de ContactsView, ConversationList (verificar diffs)
- ⚠️ **UI Não Perdida:** ConfiguracoesContaView já existe em SolarZapLayout

---

## D) MIGRATIONS / BANCO DE DADOS

### 18 MIGRATIONS ADICIONADAS

| Migration | Data | Descrição |
|---|---|---|
| `20260212170000_kb_items_in_rag.sql` | 2026-02-12 | KB base structure |
| `20260212170100_proposal_premium_foundation.sql` | 2026-02-12 | Schema de propostas premium |
| `20260212170200_lead_tasks.sql` | 2026-02-12 | Tarefas por lead |
| `20260212170300_create_kb_items.sql` | 2026-02-12 | Items do KB |
| `20260212170400_proposal_sections.sql` | 2026-02-12 | Seções de proposta |
| `20260213090000_kb_ingest_chunks_and_search_v3.sql` | 2026-02-13 | Chunks + search Vector DB |
| `20260213090100_storage_knowledge_base_bucket.sql` | 2026-02-13 | Storage bucket KB |
| `20260213090200_knowledge_search_v3_relaxed_tsquery.sql` | 2026-02-13 | Full-text search v3 |
| `20260213090300_knowledge_search_v3_lexeme_order.sql` | 2026-02-13 | Otimização search |
| `20260213090400_knowledge_search_v3_fix_lexeme_order.sql` | 2026-02-13 | Hotfix search |
| `20260213160000_qr_scan_events.sql` | 2026-02-13 | Eventos de QR code |
| `20260220090000_p0_kb_multitenant_hardening.sql` | 2026-02-20 | **CRÍTICO P0:** RLS KB |
| `20260220093000_notifications_visits_proposals_digest_foundation.sql` | 2026-02-20 | Schema notificações + visits + proposals + digest |
| `20260220120000_proposals_rpc_contracts.sql` | 2026-02-20 | RPC p/ propostas |
| `20260220123000_notifications_schema_hotfix.sql` | 2026-02-20 | Hotfix schema notificações |
| `20260221100000_disable_hidden_pipeline_agents.sql` | 2026-02-21 | Flag p/ desabilitar agents ocultos |
| `20260221113000_protocol_version_support_ai_pdf_v1.sql` | 2026-02-21 | Suporte protocolo PDF V1 |
| `20260221153000_pdf_prompts_and_respondeu_mode_hotfix.sql` | 2026-02-21 | PDF prompts + fix respondeu mode |

### STATUS

- ⚠️ **Não Verificado:** Se alguma foi executada no RDS
- ⚠️ **P0 Crítica:** `20260220090000_p0_kb_multitenant_hardening.sql` — precisa validação RLS
- ✅ **P1 Pronta:** Outras podem ser aplicadas, mas precisam de validação incremental

---

## E) LIXO / TEMPORÁRIO (116 ARQUIVOS — ~66% DO TOTAL)

### CATEGORIAS

#### 1. Docs Temporários (20+ arquivos)

- `docs/AUDITORIA_EMERGENCIAL_2026-02-19.md`
- `docs/HOTFIX_CRITICO_2026-02-20.md`
- `docs/CODEX_EXEC_PLAN_P0.md`
- `docs/m1_runbook.md`, `m2_runbook.md`, ..., `m6_runbook.md`
- `docs/baseline_ai_snapshot_20260221_012502Z.json`
- `docs/audit_*.json`
- `docs/pipeline_pdf_extracted_*.txt`
- `docs/proposta_melhores_praticas_extracao.txt`
- `docs/apply_pdf_prompts_summary_*.json`

#### 2. Scripts de Deploy Temporários (~70 arquivos)

- `scripts/m0_*.sql`, `_m0_*.txt` (gates, checks, deploys intermediários)
- `scripts/m1_*.sql`, `m2_*.sql`, `m3_*.sql`, `m4_*.sql` (auditorias progressivas)
- `scripts/hotfix_*.sql` (hotfixes de banco)
- `scripts/_tmp_recovery_*.sql` (recovery probes)
- `scripts/audit_db_*.sql`, `audit_db_*_result.txt`
- `scripts/deploy_hotfix_edge_functions.cmd`
- `scripts/export_ai_baseline_snapshot.cjs`
- `scripts/smoke_*.mjs` (**talvez útil para testes**)

#### 3. Batch Files (2 arquivos)

- `pause_ai_whatsapp_sending.bat`
- `resume_ai_whatsapp_sending.bat`

#### 4. Outros Temporários

- `diff_index_ts_full.patch` (44KB patch original)
- `_remote_supabase_migrations.sql` (0 bytes — arquivo vazio)
- `status.txt` (relatório git status de auditoria)
- `playwright.config.ts` (config de testes — novo, pode servir)
- `public/logo.png` (novo logo — pode manter ou revisar)

### RECOMENDAÇÃO

- 🗑️ **REMOVER em cleanup:** `docs/AUDITORIA_*.md`, `docs/*_runbook.md`, `scripts/m*.sql`, `scripts/_tmp_*.sql`, `scripts/audit_*.sql`, `.bat` files
- ⚠️ **REVISAR:** `scripts/smoke_*.mjs` (podem servir para smoke tests)
- ✅ **MANTER:** `playwright.config.ts` (se configurado), `public/logo.png` (se aprovado)

---

# 📋 PLANO EXECUTÁVEL: P0 → P1 → P2

---

## P0 — CRÍTICO (Segurança + Integração)

### P0.1: Remover Credenciais Evolution do Frontend + Implementar evolution-proxy

#### Requisito

- Frontend NUNCA deve chamar Evolution API diretamente
- Todas as chamadas devem passar por `evolution-proxy` edge function
- evolution-proxy valida JWT + org_id em cada requisição

#### Arquivos a Tocar + Arquitetura

1. `src/services/whatsappService.ts`
   - ❌ REMOVER: `private baseUrl` e `private apiKey` (hardcoded)
   - ✅ ADICIONAR: `private async proxyRequest(endpoint: string, ...)`
   - Redirecionar todas as chamadas para `/functions/v1/evolution-proxy`
   - Passar JWT automaticamente via `Authorization: Bearer <token>`
   - NUNCA passar orgId no body — é derivado do JWT no servidor

2. `src/components/solarzap/WhatsAppInstancesManager.tsx`
   - Validar que usa `whatsappService` (já pré-configurado para proxy)
   - DevTools check: Network requests devem ir para `{{STAGING_URL}}/functions/v1/evolution-proxy`
   - NUNCA para `https://evo.arkanlabs.com.br` direto

3. `supabase/functions/evolution-proxy/index.ts`
   - ✅ Verificado: já existe e valida JWT
   - AJUSTAR: `org_id` **NUNCA** aceitar do body
   - OBRIGATÓRIO: derivar `org_id` do claim JWT (`sub` + lookup na tabela `org_members`)
   - Validar: instância pertence à org do token (cross-org guard)
   - Rejeitar com 403 se mismatch

#### Critérios de Aceite (AC)

- ✅ AC1: Nenhuma chamada fetch() direto à Evolution API em `src/`
- ✅ AC2: `whatsappService.ts` redireciona p/ `/functions/v1/evolution-proxy`
- ✅ AC3: Todas as requisições incluem Authorization header (JWT)
- ✅ AC4: evolution-proxy rejeita requisições sem JWT válido (status 401)
- ✅ AC5: evolution-proxy VALIDA que org_id (do JWT) == org do recurso solicitado (status 403 se mismatch)
- ✅ AC6: evolution-proxy NUNCA confia em org_id vindo do body
- ✅ AC7: Nenhuma credencial (API key, base URL) hardcoded em `.ts/.tsx` files
- ✅ AC8: grep no build output: nenhuma menção a "evo.arkanlabs.com" ou key API

#### Smoke Tests (Backend)

```bash
# ⚠️ STAGING ONLY — Use explicit staging endpoint
# {{STAGING_URL}} = https://staging-app.solarzap.com (adjust to your staging env)
# {{PROJECT_REF_STAGING}} = your staging project ref

# 1. Test evolution-proxy com JWT válido (STAGING)
curl -X POST {{STAGING_URL}}/functions/v1/evolution-proxy/instance/fetchInstances \
  -H "Authorization: Bearer $VALID_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
# Esperado: 200 OK + lista de instâncias
# NOTA: orgId é derivado do JWT claim (server-side), não do body

# 2. Test evolution-proxy sem JWT (STAGING)
curl -X POST {{STAGING_URL}}/functions/v1/evolution-proxy/instance/fetchInstances \
  -H "Content-Type: application/json" \
  -d '{}'
# Esperado: 401 Unauthorized

# 3. Test evolution-proxy com JWT de org diferente (STAGING)
# Inserir JWT de ORG_B, tentar acessar recurso de ORG_A
curl -X POST {{STAGING_URL}}/functions/v1/evolution-proxy/instance/fetchInstances \
  -H "Authorization: Bearer $ORG_B_JWT" \
  -H "Content-Type: application/json" \
  -d '{}'
# Esperado: 403 Forbidden (orgId from JWT != requested resource org)
```

#### Smoke Tests (UI)

```typescript
// 1. WhatsAppInstancesManager deve funcionar (não erro de auth)
- Abrir CRM → Integrations (ou settings)
- Clicar "Conectar WhatsApp" ou similar
- QR code deve carregar sem erro de API key

// 2. Nenhuma mensagem de erro relativa a credenciais expostas
- DevTools → Network → Nenhuma request p/ Evolution API direto
- Nenhuma request com apikey visível em headers

// 3. Listar instâncias deve funcionar
- Abrir lista de instâncias WhatsApp
- Deve recarregar instâncias do backend
```

#### Commits Sugeridos

```
1. fix(security): remove hardcoded Evolution API credentials from frontend
2. refactor(whatsapp): redirect WhatsAppService to evolution-proxy
3. test(evolution-proxy): verify authentication and org-scoping
```

---

### P0.2: Webhook Canônico + Consolidação whatsapp-webhook vs evolution-webhook

#### Requisito

- Definir UMA rota de webhook que: valida assinatura → grava whatsapp_webhook_events + interacoes → invoca ai-pipeline-agent
- Eliminar inconsistências entre `whatsapp-webkit`, `evolution-webhook`

#### Status Atual

- `whatsapp-webhook/index.ts` (739 linhas) — Novo, completo
- `evolution-webhook/index.ts` (modificado) — Pode estar duplicado

#### Arquivos a Tocar

1. `supabase/functions/whatsapp-webhook/index.ts` → Revisar rota, se é canônica
2. `supabase/functions/evolution-webhook/index.ts` → Comparar, decidir se merge ou remover
3. Validar que Evolution API seta webhook para `/functions/v1/whatsapp-webhook` (via evolution-proxy no setup)

#### Critérios de Aceite (AC)

- ✅ AC1: Webhook listener aceita POST /functions/v1/whatsapp-webhook
- ✅ AC2: Valida secret **SOMENTE via header** `x-arkan-webhook-secret` (em PRODUÇÃO)
- ✅ AC2b: Query param apenas em DEV (se necessário para testes locais com flag)
- ✅ AC3: Rejeita request sem secret válido (status 401)
- ✅ AC4: Grava evento em `whatsapp_webhook_events` table com idempotência (message_id unique)
- ✅ AC5: Inferir `lead_id` e atualizar `interacoes` (conversation history)
- ✅ AC6: Chamar `ai-pipeline-agent` com payload correto (leadId, message, etc.)
- ✅ AC7: Apenas UMA rota webhook ativa (deprecate evolution-webhook se for duplicate)
- ✅ AC8: Webhook secret **nunca em URL/query** — somente header em produção

#### Smoke Tests (Backend — STAGING ONLY)

```bash
# ⚠️ TODOS OS TESTES: usar {{STAGING_URL}}, nunca produção

# 1. Setup: Webhook secret configurado em staging
# Confirm que x-arkan-webhook-secret está setado no .env.local/staging
echo $ARKAN_WEBHOOK_SECRET
# (Deveria haver valor)

# 2. Send valid webhook event (STAGING)
curl -X POST {{STAGING_URL}}/functions/v1/whatsapp-webhook \
  -H "x-arkan-webhook-secret: $ARKAN_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "MESSAGES_UPSERT",
    "data": {
      "messages": [{
        "key": { "remoteJid": "55999999999@s.whatsapp.net", "id": "msg123" },
        "message": { "conversation": "Oi, tudo bem?" },
        "fromMe": false
      }]
    }
  }'
# Esperado: 200 OK

# 3. Send invalid secret (STAGING)
curl -X POST {{STAGING_URL}}/functions/v1/whatsapp-webhook \
  -H "x-arkan-webhook-secret: WRONG_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"event": "MESSAGES_UPSERT", "data": {...}}'
# Esperado: 401 Unauthorized

# 4. ❌ NÃO EXECUTAR: INSERT direto em DB
# Verificação (LEITURA) após teste:
SELECT COUNT(*) FROM whatsapp_webhook_events 
  WHERE event_type = 'MESSAGES_UPSERT' AND created_at > now() - interval '5 minutes';
# Esperado: 1+ eventos registrados nos últimos 5 min
```

#### Smoke Tests (UI)

```typescript
// 1. Novo WhatsApp message deve aparecer no chat em <2seg
- Enviar mensagem via WhatsApp pessoal para instância test
- Verificar que aparece em Conversas tab
- Verificar que IA responde (se habilitado)

// 2. Múltiplos messages seguidos devem ser processados
- Enviar 3 mensagens seguidas
- Verificar que todas são gravadas sem duplicatas

// 3. File/Media messages devem ser suportados
- Enviar imagem/arquivo via WhatsApp
- Verificar que webhook grava evento (sem quebrar)
```

#### Commits Sugeridos

```
1. refactor(webhook): consolidate whatsapp-webhook as canonical endpoint
2. feat(webhook): add proper secret validation and event persistence
3. feat(webhook): trigger ai-pipeline-agent on message events
4. chore(webhook): deprecate evolution-webhook if duplicate
```

---

### P0.3: Multi-tenant Hardening (KB + RLS + Storage)

#### Requisito

- Garantir que KB (knowledge base) é isolado por org_id
- RLS policies impedem cross-org KB access
- Storage KB usa prefixo org_id

#### Status Atual

- Migration `20260220090000_p0_kb_multitenant_hardening.sql` existe (307 linhas)
- Precisa verificar se foi applied + se há bugs

#### Arquivos a Verificar

1. `supabase/migrations/20260220090000_p0_kb_multitenant_hardening.sql` → Revisar conteúdo
2. `supabase/functions/kb-ingest/index.ts` → Verificar if usa org_id
3. `knowledge_search_v3` RPC — Validar filtro org_id

#### Critérios de Aceite (AC)

- ✅ AC1: Tabela `kb_items` tem coluna `org_id` (NOT NULL)
- ✅ AC2: RLS policy em `kb_items`: `org_id = current_org_id` (via user JWT claim)
- ✅ AC3: Storage policy em `knowledge_base/*`: path começa com `org_id/` + validação
- ✅ AC4: `knowledge_search_v3` RPC filtra por org_id
- ✅ AC5: User de org A não consegue acessar KB de org B
- ✅ AC6: Migração está aplicada no RDS (verificar `public.schema_migrations`)

#### Smoke Tests (Backend — LEITURA SOMENTE)

```sql
-- 1. Verify kb_items has org_id (LEITURA)
SELECT column_name, is_nullable FROM information_schema.columns 
WHERE table_name = 'kb_items' AND column_name = 'org_id';
-- Esperado: org_id | NO

-- 2. Verify RLS is enabled on kb_items (LEITURA)
SELECT * FROM pg_policies WHERE tablename = 'kb_items' AND policyname LIKE '%org%';
-- Esperado: 1+ policies restricting access by org_id

-- 3. Verify storage policies (LEITURA)
SELECT path FROM storage.objects 
WHERE bucket_id = (SELECT id FROM storage.buckets WHERE name = 'knowledge-base') 
LIMIT 5;
-- Esperado: Todos os paths começam com "org_<id>/"

-- 4. ❌ NÃO EXECUTAR: INSERT direto em DB
-- Em lugar disso, usar UI staging:
--    - Logar em staging como OrgA user
--    - Tentar upload de KB doc
--    - Verificar que doc foi criado com org_id correto
--    - Switch org → KB não mostra doc

-- 5. Test knowledge_search_v3 with org filtering (LEITURA)
-- (Requer setup: orgs com KB docs diferentes)
SELECT COUNT(*) FROM knowledge_search_v3('test', 'org_A_id');
-- Esperado: Retorna itens de org_A apenas
```

#### Smoke Tests (UI)

```typescript
// 1. Admin user can upload KB docs
- Ir para integracoes/banco de dados
- Upload documento → Deve aparecer na IA
- Switch org → KB não deve mostrar docs da org anterior

// 2. Cross-org isolation
- Logar como user de OrgA
- Tentar acessar KB de OrgB via API
- Esperado: 403 Forbidden ou vazio

// 3. Proposal personalization usa KB correto
- OrgA: Upload doc "Promoção 50%"
- OrgB: Upload doc "Promoção 30%"
- OrgA user cria proposta → Deve usar "50%"
- OrgB user cria proposta → Deve usar "30%"
```

#### Migration Check (LEITURA SOMENTE — NÃO EXECUTAR AUTOMATICAMENTE)

```bash
# Verificar se migration foi executada em RDS (LEITURA)
supabase migration list --project-ref {{PROJECT_REF_STAGING}}
# Esperado: 20260220090000_p0_kb_multitenant_hardening.sql | applied

# ❌ NÃO RODAR AUTOMATICAMENTE: supabase db push
# ⚠️ SE NÃO APLICADA: Criar subplano separado com:
#    1) Backup RDS completo
#    2) Aplicar migration em STAGING primeiro
#    3) Testar 24h
#    4) Rollback playbook documentado
#    5) Aprovação manual antes de PRODUÇÃO
#    3) Testar 24h
#    4) Rollback playbook documentado
#    5) Aprovação manual antes de PRODUÇÃO
```

#### Commits Sugeridos

```
1. chore(migrations): verify p0_kb_multitenant_hardening was applied
2. test(kb): add RLS and org-scoping validation
3. fix(kb-ingest): ensure org_id is always set on document ingestion
4. fix(knowledge-search): validate org filtering in search RPC
```

---

## P1 — FUNCIONALIDADES (UI + Backend)

### P1.1: Modal Pós-Visita (Auto-trigger + Outcome Classification)

#### Requisito

- Ao abrir CRM, se appointment passou +3h e sem outcome, abrir modal
- Modal oferece opções: proposta negociação / financiamento / aprovações / contrato / pago
- Seleção → move lead + registra comentário

#### Status Atual

- `VisitOutcomeAfterModal.tsx` existe (102 linhas) — pronto
- Precisa integrar em SolarZapLayout.tsx

#### Arquivos a Tocar

1. `src/components/solarzap/SolarZapLayout.tsx` → Adicionar lógica de verificação de appointments
2. `src/components/solarzap/VisitOutcomeAfterModal.tsx` → Confirmar implementação
3. Possível: Nova tabela `visit_outcomes` OU usar coluna em `appointments`

#### Critérios de Aceite (AC)

- ✅ AC1: Modal **default OFF** via feature-flag
- ✅ AC2: Quando habilitado em staging/org: abre automaticamente se appointment >3h ago
- ✅ AC3: Modal mostra lead name, data/hora da visita, tempo decorrido
- ✅ AC4: Opções de outcome estão disponíveis (dropdown ou pills)
- ✅ AC5: Seleção outcome → Move lead para stage correspondente
- ✅ AC6: Comentário é registrado automaticamente com outcome
- ✅ AC7: Modal não reaparece após fechar (session-scoped + idempotência by appointment_id)
- ✅ AC8: Feature flag pode ser ativado por org (admin toggle ou code config per org_id)

#### Smoke Tests (UI — STAGING + Feature Flag ON)

```typescript
// ⚠️ SOMENTE EM STAGING COM FEATURE FLAG HABILITADO

// SETUP (pré-requisito em staging):
// 1. Feature flag 'visit_outcome_modal' = true (via admin panel ou .env)
// 2. Lead com appointment criado há 4+ horas (criar via UI, não SQL direto)

// TEST 1: Setup via UI de staging
- Logar em {{STAGING_URL}} como org-admin
- Criar lead (mínimo: nome + telefone)
- Agendar appointment para ontem/hoje de manhã (usando AppointmentModal)
- FECHAR modal de agendamento

// TEST 2: Refrescar CRM → Modal deve aparecer
- Refrescar a página (F5)
- Modal "Registrar Outcome de Visita" deve aparecer
- Verificar dados corretos (lead name, data/hora da visita, tempo decorrido)

// TEST 3: Selecionar outcome → Lead deve mover
- Selecionar "Proposta em Negociação"
- M-CLICK "Confirmar"
- Modal deve fechar
- Verificar lead stage em Pipelines tab → "proposta_negociacao"
- Verificar comentário foi criado (abrir lead details → comentários)

// TEST 4: Reabrir CRM → Modal não deve aparecer
- Fechar tab, reabrir
- Refrescar página
- Modal NÃO deve aparecer (idempotência by appointment_id + outcome_at timestamp)

// TEST 5: Feature flag OFF
- Desabilitar flag no admin
- Criar novo appointment 4+ horas atrás
- Refrescar CRM
- Modal NÃO deve aparecer
```

#### Smoke Tests (Backend)

```sql
-- Verificar que comentário foi criado
SELECT * FROM interacoes 
WHERE lead_id = 'test_lead_123' AND tipo = 'comentario'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: comentário incluindo outcome selecionado

-- Verificar que lead foi movido
SELECT pipelineStage FROM leads WHERE id = 'test_lead_123';
-- Esperado: proposta_negociacao
```

#### Commits Sugeridos

```
1. feat(ui): add VisitOutcomeAfterModal integration in SolarZapLayout
2. feat(domain): auto-detect overdue appointments and trigger modal
3. feat(db): record visit outcome and move lead automatically
4. test(visit-outcome): smoke test outcome selection and lead movement
```

---

### P1.2: Histórico de Propostas + Tab "Propostas"

#### Requisito

- Dashboard exibe todas as propostas criadas para um lead (histórico)
- Tab global "Propostas" tabula propostas com filtros (status, stage, data, etc.)
- Cada proposta mostra PDF link

#### Status Atual

- `ProposalsView.tsx` existe (505 linhas) — pronto
- Tabela `proposals` deve ter been criada (migration existe)
- Precisar integrar em SolarZapLayout como tab

#### Arquivos a Tocar

1. `src/components/solarzap/SolarZapLayout.tsx` → Adicionar activeTab === 'propostas'
2. `src/components/solarzap/ProposalsView.tsx` → Confirmada existência
3. `src/hooks/useProposalMetrics.ts` → Para métricas (já existe)
4. RPC `get_proposals_by_lead` OU query direto à tabela proposals

#### Critérios de Aceite (AC)

- ✅ AC1: Tab "Propostas" navega para proposals view (global)
- ✅ AC2: Propostas filtram por:
  - Status (Enviada, Visualizada, Aceita, Rejeitada)
  - Lead (busca por nome)
  - Data (range picker)
  - Tipo cliente
- ✅ AC3: Cada proposta mostra:
  - Lead name, data criação
  - Valor total, payback
  - Status badge
  - Link para PDF (download ou preview)
- ✅ AC4: Click em proposta → Abre modal/details com mais info
- ✅ AC5: Lead details → Card "Propostas deste Lead" (UX spec abaixo):
  - Últimas 3-5 propostas listadas
  - Status + data em badge
  - Botões: "Ver PDF" + "Copiar Link Compartilhamento"
  - Link "Ver Todas" → vai p/ tab global filtrado por lead

#### Smoke Tests (UI — STAGING)

```typescript
// SETUP
- Habilitar feature flag 'proposals_tab' = true
- Ter 2-3 leads com propostas criadas em staging

// TEST 1: Tab "Propostas" é acessível
- Settings popover
- Click "Propostas" (ou no menu principal se houver)
- Navigation para ProposalsView

// TEST 2: Propostas são tabuladas
- Deve haver lista de propostas (ou "Nenhuma proposta" se vazio)
- Cada proposta mostra: lead name, data, valor, status badge

// TEST 3: Filtros funcionam (READ-ONLY validação)
- Filtrar por status "Aceita" → Apenas propostas com status "aceita"
- Search por lead name → Resultados filtrados
- Date range picker → Propostas nesse período

// TEST 4: PDF download (STAGING)
- Click em proposta → Botão "Download PDF"
- PDF começa a baixar (verificar no DevTools que URL é {{STAGING_URL}}, não prod)
- PDF não deve retornar 404/500

// TEST 5: Lead details → Card "Propostas deste Lead"
- Abrir lead (click em lead card em Contatos ou Conversas)
- Ir para "Detalhes" tab
- Deve haver card "Propostas deste Lead"
- Card mostra últimas 3-5 propostas
- Cada proposta tem botões: "Ver PDF", "Copiar Link"
- Link "Ver Todas" filtra a tab global para este lead
```

#### Smoke Tests (Backend)

```sql
-- Verificar tabela proposals
SELECT * FROM proposals WHERE lead_id = 'test_lead' ORDER BY created_at DESC;
-- Esperado: 1+ rows com status, valor, data

-- Verificar RPC (se existente)
SELECT * FROM get_proposals_by_lead('test_lead');
-- Esperado: proposals filtradas por lead_id
```

#### Commits Sugeridos

```
1. feat(ui): add ProposalsView tab to SolarZapLayout
2. feat(ui): implement proposal filters (status, date, lead, type)
3. feat(ui): add PDF download link to proposals
4. feat(ui): add proposal history section to lead details
5. test(proposals): verify filtering and PDF access
```

---

### P1.3: Sistema de Notificações (WhatsApp + Email Toggles)

#### Requisito

- Aba "Notificações" em settings
- Toggles para: Lead responde, proposta visualization, stage change, etc.
- Selector de instância WhatsApp (qual instância envia notificações)
- Campo de email recipients (pode multi-add)
- Feature flag per notification type

#### Status Atual

- `NotificationSettingsCard.tsx` existe (330 linhas) - pronto
- Migration `20260220093000_notifications_visits_proposals_digest_foundation.sql` criou schema
- `notification-worker/index.ts` existe (457 linhas) — worker para envio

#### Arquivos a Tocar

1. `src/components/solarzap/NotificationSettingsCard.tsx` → Integrar em settings
2. Possível: Aba nova "notificacoes" em SolarZapLayout
3. `src/hooks/useNotificationSettings.ts` → Para ler/escrever settings

#### Critérios de Aceite (AC)

- ✅ AC1: Aba "Notificações" existe e é acessível (via settings popover ou top-level)
- ✅ AC2: Toggles para tipos de notificação (TODOS default OFF):
  - Lead respondeu
  - Proposta visualizada
  - Proposta aceita/rejeitada
  - Stage mudou
  - Appointment próxima (24h)
- ✅ AC3: Cada toggle pode ativar WhatsApp e/ou Email independentemente
- ✅ AC4: Selector de instância WhatsApp (quando WhatsApp ativado)
- ✅ AC5: Campo multi-add para email recipients
- ✅ AC6: Salvar settings → Persiste em DB (com timestamp updated_at)
- ✅ AC7: Notificações respeitam settings (não enviar se desativado)
- ✅ AC8: Event sources mapeados (vide seção "Event Sources" abaixo)

#### Event Sources Mapping (PRÉ-REQUISITO)

Para P1.3 funcionar, cada evento deve ter uma **fonte de disparo** clara:

| Evento | Disparador | Tabela/RPC | Payload |
|---|---|---|---|
| Lead respondeu | whatsapp-webhook recebe msg | interacoes + lead lookup | lead_id, message, sender_phone |
| Proposta visualizada | API call (proposal-share-link) | proposal_views + timestamp | proposal_id, viewer_org_id |
| Proposta aceita | AI ou usuário move stage | leads + pipeline_movements | lead_id, proposal_id, new_stage |
| Stage mudou | SolarZapLayout.handlePipelineStageChange | leads_history audit | lead_id, old_stage, new_stage |
| Appointment próxima | Cron job (daily 22h) | appointments + verificação delta | lead_id, appointment_start_at |

**Implementação (não nesta fase, mas pré-requisito):**
- Cada disparador publica evento em `notification_events` queue (Supabase Realtime ou fila)
- notification-worker consome fila
- Respeita settings: usuário habilitou notificação para este evento?
- Envia via instância WhatsApp ou email conforme toggles

#### Smoke Tests (UI — STAGING, Feature Flag ON)

```typescript
// ⚠️ TODOS OS TESTES: Staging environment, feature flagged ON

// SETUP
- Habilitar feature flag 'notifications_system' = true
- Criar lead de teste
- Criar proposta de teste
- Adicionar email de teste (seu próprio ou test@staging.local)

// TEST 1: Acessar Notificações
- Settings → "Notificações" OU tab (se integrado)
- Deve haver seção de configurações

// TEST 2: Toggles default OFF
- Verificar que TODOS os toggles começam desativados
- Salvar (sem alterar)
- Nenhuma notificação deve ser enviada

// TEST 3: Ativar 1 tipo (Lead respondeu + WhatsApp)
- Marcar toggle "Lead respondeu" → WhatsApp
- Selector de instância deve aparecer
- Selecionar uma instância
- Salvar
- Settings deve persistir (refresh e verificar)

// TEST 4: Email recipients
- Mesmo teste de "Lead respondeu", marcar Email também
- Adicionar 2-3 emails no campo multi-add
- Remover um
- Salvar
- Refresh → emails devem estar salvos

// TEST 5: Notificação é enfileirada (NÃO validar envio, só enfileiramento)
- Com "Lead respondeu + WhatsApp" ativado
- Enviar mensagem WhatsApp para instância de teste (simular lead respondendo)
- Verificar logs: notification_events table deve ter 1+ row
-- SELECT * FROM notification_events WHERE event_type = 'lead_responded' 
--   AND created_at > now() - interval '5 minutes' LIMIT 1;
-- Esperado: evento foi enfileirado (não validar se foi enviado de verdade)

// TEST 6: Feature flag OFF
- Desabilitar 'notifications_system' 
- Refrescar UI
- Aba "Notificações" não deve aparecer (ou mostrar "Disabled")
```

#### Smoke Tests (Backend)

```sql
-- Verificar settings foram salvos
SELECT * FROM notification_settings WHERE team_id = 'team_123';
-- Esperado: settings com toggles, instance_id, emails

-- Verificar que notification foi enfileirada/enviada
SELECT * FROM whatsapp_webhook_events 
WHERE event_type = 'NOTIFICATION_TRIGGERED' 
ORDER BY created_at DESC LIMIT 1;
-- Esperado: evento registrado
```

#### Commits Sugeridos

```
1. feat(ui): add NotificationSettingsCard to settings/integrations
2. feat(hooks): implement useNotificationSettings for CRUD
3. feat(notifications): add instance selector and email recipients
4. feat(notifications): enforce settings in notification-worker
5. test(notifications): verify toggles and delivery
```

---

## P2 — AUTOMAÇÕES IA (Futures — Design Only)

### P2.1: Digest Diário + Semanal (WhatsApp/Email)

**Status:** `ai-digest-worker/index.ts` (459 linhas) existe

**Requisito:**
- Diário: Resumo de 5-10 leads mais relevantes (próximas etapas, propostas, etc.)
- Sexta 17h: Digest semanal com análises

**Smoke Tests (Conceptual):**
- Executar worker em horário específico (Cron)
- Verificar que digest é enviado para Webhook (WhatsApp) e email

---

### P2.2: Resumo Diário por Lead nos Comentários (Dedupe)

**Status:** Potencial feature pós-IA

**Requisito:**
- AI gera resumo de dia (msgs processadas, respostas dadas, etc.)
- Registra como comentário (1 por lead/dia)
- UI mostra "Daily Insights" badge

**Smoke Tests (Conceptual):**
- Lead com 15+ msgs em 1 dia → 1 insight comment criado (não 15)

---

# 🎬 ORDEM DE EXECUÇÃO (Commits + Validação)

## Sprint 0 — P0 Crítico (Segurança)

```
Commit Order:
1. fix(security): remove hardcoded Evolution credentials from whatsappService
2. refactor(whatsapp): redirect all WhatsAppService calls to evolution-proxy
3. feat(evolution-proxy): add comprehensive auth validation and context checking
4. test(evolution-proxy): add smoke tests for credential handling

Validation Gate:
- ✅ Build passes (npm run build or TypeScript check)
- ✅ No direct Evolution API calls in src/ files
- ✅ evolution-proxy auth tests pass (via backend/test script)
- ✅ WhatsApp instance manager still works (QR code loads)
```

## Sprint 1 — P0 Webhook + Multi-tenant

```
Commit Order:
5. refactor(webhook): consolidate whatsapp-webhook as canonical endpoint
6. feat(webhook): add secret validation and event persistence
7. feat(webhook): integrate with ai-pipeline-agent trigger
8. test(webhook): add endpoint and event-driven smoke tests
9. chore(migrations): apply and validate p0_kb_multitenant_hardening
10. test(kb): validate RLS policies and org-scoping
11. fix(kb-ingest): enforce org_id on document ingestion
12. fix(knowledge-search): add org filtering to search RPC

Validation Gate:
- ✅ Webhook events are persisted correctly
- ✅ ai-pipeline-agent is triggered on WhatsApp messages
- ✅ KB items are isolated by org_id (cross-org access denied)
- ✅ knowledge_search_v3 returns only current-org items
```

## Sprint 2 — P1 Features (UI + Proposals)

```
Commit Order:
13. feat(ui): add VisitOutcomeAfterModal integration
14. feat(domain): auto-detect overdue appointments
15. feat(db): record visit outcomes and move leads
16. test(visit-outcome): smoke tests for modal and movement
17. feat(ui): add ProposalsView to main layout
18. feat(ui): implement proposal filters and PDF links
19. feat(ui): add proposal history to lead details
20. test(proposals): filtering and PDF access
21. feat(ui): add NotificationSettingsCard
22. feat(hooks): implement useNotificationSettings
23. feat(notifications): add instance and email configuration
24. test(notifications): settings persistence and sending

Validation Gates (per feature):
- Visit Outcome: Appointments >3h trigger modal, outcomes move leads correctly
- Proposals: Tab works, filters functional, PDF downloads available
- Notifications: Settings persist, deliveries respect configuration
```

## Sprint 3 — P2 Automations (Backend Only)

```
Commit Order (no UI yet):
25. feat(ai-digest-worker): implement daily digest generation
26. feat(ai-digest-worker): schedule cron jobs (daily @ 8h, Friday @ 17h)
27. feat(ai-digest-worker): send digest via WhatsApp + email
28. test(digest): verify scheduling and content generation

Validation Gates:
- Digest generated at scheduled times
- Content summarizes relevant leads correctly
```

---

## 📊 VALIDAÇÃO MACRO (Final Quality Gate)

### Build Checks

```bash
npm run build
# ✅ No TypeScript errors
# ✅ No unresolved imports
# ✅ No linting violations (if eslint configured)
```

### App Smoke Tests

```bash
npm run dev
# ✅ App starts without errors
# ✅ Can login
# ✅ Dashboard loads (no white screen)
# ✅ Main tabs render (conversas, pipelines, contatos, etc.)
# ✅ Settings → Can access all sub-sections
```

### Database State

```sql
-- Verify all migrations applied
SELECT migration FROM public.schema_migrations 
WHERE migration LIKE '202602%' 
ORDER BY migration;
-- Expect: All new migrations present

-- Verify no orphaned tables/columns
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'kb_%' OR table_name LIKE 'proposal%';
-- Expect: Tables exist, columns correct
```

### Security Sanity Checks

```
# No "evolution" hardcoded strings in compiled output
grep -r "eef86d79f253d5f295edcd33b578c94b" dist/
# Expect: No matches (API key removed)

grep -r "evo.arkanlabs.com" dist/
# Expect: No matches (only evolution-proxy edge function calls)
```

---

## 🎯 CONCLUSÃO

### Inventário Resumido

- **176 arquivos alterados** entre base boa (2964dd4) e atual (e013b48)
- **24.914 linhas adicionadas** (~66% lixo/temporários, ~34% código produção)
- **18 migrations** para KB, Proposals, Notifications, Multitenant
- **13 edge functions novas/modificadas** (proposals, KB ingest, digest, notifications, webhooks)
- **5 componentes UI nouveaux** (NotificationSettingsCard, ProposalsView, VisitOutcomeAfterModal, + updates)
- **1 violação crítica P0.1** (API key hardcoded) — Pronto para fix com evolution-proxy

### Risco de Regressão

**BAIXO** se seguir plano P0 → P1 → P2:
- P0 é isolado (auth + webhook + KB isolation)
- P1 é aditivo (novos tabs + modais, não toca core conversas/pipelines)
- P2 é backend (workers, sem impacto UI se falhar)

---

# ✅ PLANO PRONTO PARA EXECUÇÃO

**Data de Geração:** 21 de Fevereiro de 2026  
**Versão do Plano:** 1.0  
**Status:** ✅ Aprovado para Implementação do P0.1

---

## 📝 Notas de Implementação

- Sempre fazer backup (branches + tags) antes de cada sprint
- Testar incrementalmente (não esperar para testar tudo ao final)
- Validar smoke tests de cada feature antes de mover para próxima
- Escalate se encontrar conflitos ou bugs não previstos
- Comunicar progresso ao final de cada sprint

---

**Documento Gerado:** 21/02/2026 15:10 UTC  
**Responsável:** GitHub Copilot (Claude Haiku 4.5)
