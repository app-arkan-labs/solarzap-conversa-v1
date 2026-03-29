# Plano de Paridade Comercial — CRM Interno SolarZap

Data: 2026-03-29
Base: `docs/PLANO_PARIDADE_ABAS_SOLARZAP_PARA_CRM_INTERNO_2026-03-29.md`
Contexto arquitetural: `docs/PLANO_CRM_INTERNO_SOLARZAP_2026-03-28_FINAL.md`

---

## 0. Premissa Comercial

O CRM interno existe para uma unica finalidade: **vender o SolarZap, mentorias e servicos complementares** e depois **operar o relacionamento com quem comprou**.

Toda decisao de prioridade neste plano segue esta cadeia de valor:

```
Captar lead → Qualificar → Agendar demo → Enviar proposta → Fechar →
Receber pagamento → Provisionar conta → Onboardar → Reter → Expandir
```

Qualquer feature que nao acelere uma dessas etapas **nao entra no V1**.

---

## 1. Estado Atual do Modulo `src/modules/internal-crm`

### O que ja existe e funciona

| Artefato | Status |
|----------|--------|
| Schema `internal_crm` com 11+ tabelas | migrado |
| `internal-crm-api` Edge Function (gateway) | deployed |
| Types com 29 actions | implementado |
| Hook `useInternalCrmApi.ts` com queries e mutations | implementado |
| `InternalCrmUi.tsx` (MetricCard, TokenBadge, formatters) | implementado |
| `InternalCrmDashboardPage.tsx` (~120 linhas) | funcional, basico |
| `InternalCrmPipelinePage.tsx` (~300 linhas) | funcional, basico |
| `InternalCrmClientsPage.tsx` (~250 linhas) | funcional, basico |
| `InternalCrmInboxPage.tsx` (~200 linhas) | funcional, basico |
| `InternalCrmCampaignsPage.tsx` (~150 linhas) | funcional, basico |
| `InternalCrmAiPage.tsx` (~200 linhas) | funcional, basico |
| `InternalCrmFinancePage.tsx` (~130 linhas) | funcional, basico |
| Rotas `/admin/crm/*` com `InternalCrmGuard` | implementado |
| Sidebar com 7 itens CRM | implementado |
| `crm_role` em `_admin_system_admins` | migrado |
| Catalogo de produtos + seed | migrado |
| Pipeline stages + seed | migrado |

### O que NAO existe ainda

| Artefato | Impacto |
|----------|---------|
| `InternalCrmCalendarPage.tsx` | sem calendario no CRM |
| Rota `/admin/crm/calendar` | nao registrada |
| Item "Calendarios" na sidebar CRM | ausente |
| Diretorio `repositories/` | vazio |
| Paridade visual com SolarZap | nenhuma pagina tem a densidade visual do produto |
| `internal-crm-broadcast-worker` | campanhas nao processam |
| Instancia WhatsApp interna | nao provisionada no Evolution |
| IA agent jobs do CRM | nao processam |
| Realtime/subscriptions para inbox | nao implementado |

### Diagnostico

As 7 paginas atuais sao **scaffolds funcionais** — fazem CRUD e exibem dados, mas com UX minimalista. A distancia visual e funcional para o SolarZap principal e grande:

- SolarZap `PipelineView.tsx`: ~800 linhas, kanban com drag-drop, filtros, badges, modais de edicao, marcacao de ganho/perda, comentarios
- CRM `InternalCrmPipelinePage.tsx`: ~300 linhas, kanban basico com drag-drop, modal de criacao simples

O plano de paridade visa fechar esse gap, mas **orientado pela cadeia comercial**, nao pela simetria mecanica.

---

## 2. Regras de Isolamento — Inegociaveis

Todas as regras do plano original permanecem integrais:

1. **Zero escrita** no schema `public` a partir de telas `/admin/crm/*`
2. **Zero reutilizacao de hooks de write** do SolarZap (`useLeads`, `useChat`, `usePipeline`, `useBroadcasts`, `useAISettings`)
3. **Zero compartilhamento** de tabelas operacionais, buckets, workers, crons, webhook handlers, instancias WhatsApp ou query keys
4. **Zero condicional** por host/mode/tenant_type dentro de componentes do SolarZap principal
5. **Bridge read-only** para dominio publico somente via `internal-crm-api` com `service_role` em actions allowlisted
6. Toda escrita no dominio publico permanece exclusivamente no `admin-api` (`create_org_with_user`)
7. A regra e **copy-first**: duplicar view → trocar camada de dados → so depois extrair componente puro se houver ganho real

---

## 3. Analise por Aba — O que Copiar, Adaptar ou Ignorar

### 3.1 Pipeline (Prioridade: CRITICA — e onde venda acontece)

**Fonte SolarZap:**
- `src/components/solarzap/PipelineView.tsx` (~800 linhas)
- `src/hooks/domain/usePipeline.ts`
- `src/hooks/domain/useLeads.ts`
- Modais: `EditLeadModal`, `ProposalModal`, `ProposalReadyModal`, `LeadCommentsModal`, `MarkAsLostModal`, `AssignMemberSelect`, `LeadNextAction*`

**Destino CRM Interno:**
- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`
- `src/modules/internal-crm/components/pipeline/modals/EditDealModal.tsx`
- `src/modules/internal-crm/components/pipeline/modals/DealCheckoutModal.tsx`
- `src/modules/internal-crm/components/pipeline/modals/MarkAsLostModal.tsx`
- `src/modules/internal-crm/components/pipeline/modals/DealCommentsSheet.tsx`
- `src/modules/internal-crm/components/pipeline/DealCard.tsx`
- `src/modules/internal-crm/components/pipeline/PipelineFilters.tsx`
- `src/modules/internal-crm/components/pipeline/AssignOwnerSelect.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmPipeline.ts`

**O que copiar com paridade total:**
- Layout kanban horizontal por etapa com scroll
- Drag-and-drop de cards entre colunas (usar mesma lib: `@dnd-kit` ou a que o SolarZap usa)
- Card de deal com: nome do cliente, valor (MRR + one-time), responsavel, badge de etapa, ultima interacao, proxima acao
- Contadores por coluna (quantidade + valor total)
- Busca por nome de cliente/deal
- Filtros por responsavel, etapa, canal de origem
- Marcacao de ganho com fluxo de fechamento
- Marcacao de perda com `lost_reason`

**O que adaptar para o contexto interno:**
- `Lead` → `Client` + `Deal` (no SolarZap o lead e a entidade principal; no CRM interno a entidade principal e o `Client` e o card do pipeline e o `Deal`)
- `ProposalModal` → `DealCheckoutModal` (em vez de gerar proposta solar, gera link Stripe Checkout para produtos `stripe` ou registra pagamento manual para produtos `manual`)
- `ProposalReadyModal` → nao se aplica (nao existe proposta solar no CRM interno)
- Cards devem mostrar `deal_items` resumidos (ex: "Scale + Mentoria 1")
- Coluna `aguardando_pagamento` deve mostrar badge de status Stripe (paid/pending/failed)
- Coluna `ganho` deve ter CTA "Provisionar conta" se `provisioning_status != 'provisioned'`

**O que NAO copiar:**
- `ImportContactsModal` / `ExportContactsModal` no pipeline (fica na aba Clientes)
- Integracao com propostas solares
- Logica de scoring de lead
- Qualquer referencia a `public.leads`, `public.deals`, `public.propostas`

**Hook interno:**
```typescript
// src/modules/internal-crm/hooks/useInternalCrmPipeline.ts
// NAO importa usePipeline nem useLeads
// Usa exclusivamente useInternalCrmDeals(), useInternalCrmPipelineStages(), useInternalCrmMutation()
// Expoe:
//   deals agrupados por stage_code
//   moveDeal(dealId, newStageCode)
//   markAsWon(dealId)
//   markAsLost(dealId, lostReason)
//   createCheckoutLink(dealId)
//   totais por coluna
```

**Contrato de dados:**
- Leitura: `InternalCrmDealSummary[]` agrupado por `stage_code`
- Escrita: `upsert_deal`, `move_deal_stage`, `create_deal_checkout_link`
- Query keys: `internalCrmQueryKeys.deals()`, `internalCrmQueryKeys.stages()`

**Criterio de aceite:**
- [ ] Kanban visual identico ao PipelineView do SolarZap em layout e densidade
- [ ] Drag-drop funciona e persiste mudanca de etapa via `move_deal_stage`
- [ ] Deal mostra cliente, valor, items, responsavel, proxima acao
- [ ] Marcacao de ganho gera link Stripe (se `payment_method='stripe'`) ou marca manual
- [ ] Marcacao de perda exige motivo
- [ ] Filtros por responsavel e etapa funcionam
- [ ] Zero leitura/escrita em `public.leads` ou `public.deals`

---

### 3.2 Inbox (Prioridade: CRITICA — e onde relacionamento acontece)

**Fonte SolarZap:**
- `src/components/solarzap/ConversationList.tsx` (~600 linhas)
- `src/components/solarzap/ChatArea.tsx` (~1100 linhas)
- `src/components/solarzap/ActionsPanel.tsx` (~500 linhas)
- `src/components/solarzap/ConversationActionsSheet.tsx`
- `src/hooks/domain/useChat.ts`

**Destino CRM Interno:**
- `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmChatArea.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanel.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmMessageComposer.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`

**O que copiar com paridade total:**
- Layout 3 colunas: lista | chat | painel lateral
- Lista de conversas com: avatar, nome, preview, timestamp, badge de nao-lida, badge de canal
- Busca na lista
- Area de chat com bolhas, timestamps, status de entrega (sent/delivered/read/failed)
- Composer com envio de texto, emoji picker, upload de arquivo (imagem, documento, audio)
- Notas internas (mensagem tipo `note` exibida diferente)
- Atribuicao de responsavel por conversa
- Marcacao de leitura
- Status da conversa (open/resolved/archived)

**O que adaptar para o contexto interno:**
- `ActionsPanel` → `InternalCrmActionsPanel` mostra: dados do client (empresa, contato, lifecycle), deals abertos, proximas acoes, historico de compras, link para detalhe do cliente, botao "Provisionar conta"
- A conversa esta ligada a `internal_crm.conversations` e `internal_crm.messages`, nao a `public.interacoes`
- A instancia WhatsApp e a interna (`sz_internal_*`), nao as dos tenants
- O webhook entra por `internal-crm-api` action `webhook_inbound`
- Realtime channel: `internal_crm_messages:{conversation_id}` (nome proprio, nao reutilizar channel do SolarZap)

**O que NAO copiar:**
- Gravacao de audio inline (pode entrar V2 — nao e critico para vendas)
- Forward de mensagem entre conversas
- Integracao com WhatsApp templates (V2)
- Badge de scoring de lead
- Qualquer referencia a `public.interacoes`, `public.leads`, `public.whatsapp_instances`

**Hook interno:**
```typescript
// src/modules/internal-crm/hooks/useInternalCrmInbox.ts
// NAO importa useChat
// Usa exclusivamente useInternalCrmConversations(), useInternalCrmConversationDetail()
// Expoe:
//   conversations filtradas/buscadas
//   messages da conversa ativa
//   sendMessage(conversationId, body, messageType, attachmentUrl?)
//   markAsRead(conversationId)
//   assignConversation(conversationId, userId)
//   updateConversationStatus(conversationId, status)
//   createNote(conversationId, body)
```

**Contrato de dados:**
- Leitura: `InternalCrmConversationSummary[]`, `InternalCrmConversationDetail`
- Escrita: `append_message`, `get_conversation_detail`
- Realtime: Supabase Realtime subscription em `internal_crm.messages` (INSERT)
- Query keys: `internalCrmQueryKeys.conversations()`, `internalCrmQueryKeys.conversationDetail(id)`

**Criterio de aceite:**
- [ ] Layout 3 colunas identico ao Inbox do SolarZap
- [ ] Lista mostra conversas com preview, timestamp e badge de nao-lida
- [ ] Chat exibe historico com bolhas, status de entrega e timestamps
- [ ] Envio de texto funciona via instancia WhatsApp interna
- [ ] Upload de imagem/documento funciona com bucket `internal-crm-media`
- [ ] Notas internas visiveis so para equipe
- [ ] Atribuicao de responsavel funciona
- [ ] Painel lateral mostra dados do cliente e deals
- [ ] Zero cruzamento com mensagens dos tenants clientes

---

### 3.3 Clientes (Prioridade: ALTA — e o cadastro central)

**Fonte SolarZap:**
- `src/components/solarzap/ContactsView.tsx` (~900 linhas)
- Modais: `LeadCommentsModal`, `AssignMemberSelect`, `LeadNextAction*`, `ImportContactsModal`, `ExportContactsModal`
- `src/hooks/domain/useLeads.ts`

**Destino CRM Interno:**
- `src/modules/internal-crm/components/clients/InternalCrmClientsView.tsx`
- `src/modules/internal-crm/components/clients/InternalCrmClientDetail.tsx`
- `src/modules/internal-crm/components/clients/InternalCrmClientTimeline.tsx`
- `src/modules/internal-crm/components/clients/modals/EditClientModal.tsx`
- `src/modules/internal-crm/components/clients/modals/ImportClientsModal.tsx`
- `src/modules/internal-crm/components/clients/modals/ExportClientsModal.tsx`
- `src/modules/internal-crm/components/clients/modals/ClientCommentsSheet.tsx`
- `src/modules/internal-crm/components/clients/modals/NextActionModal.tsx`
- `src/modules/internal-crm/components/clients/modals/ProvisionCustomerModal.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmClients.ts`

**O que copiar com paridade total:**
- Tabela de clientes com colunas: empresa, contato, telefone, email, etapa, lifecycle, responsavel, MRR, proxima acao, ultimo contato
- Busca full-text
- Filtros por etapa, lifecycle, responsavel, canal de origem
- Ordenacao por colunas
- Import/export CSV
- Edicao inline de campos rapidos (etapa, responsavel, proxima acao)
- Pagination

**O que adaptar para o contexto interno:**
- `Lead` → `Client` (entidade central e `internal_crm.clients`)
- Detalhe do cliente mostra:
  - Dados cadastrais (empresa, contatos, canal de origem)
  - Deals associados (abertos e historico)
  - Lifecycle status com historico de transicoes
  - Timeline de interacoes (mensagens, tasks, stage changes, deals)
  - Secao "Conta no SolarZap" (se `linked_public_org_id` existe): plano, status, trial, membros, instancias — lido via `get_linked_public_org_summary`
  - Botao "Provisionar conta" (se nao provisionado)
  - Secao de proximas acoes e tasks
  - Comentarios internos
- `ContactsView` no SolarZap une contato + proposta + scoring; no CRM interno a entidade e `Client` + `Deals` + `CustomerAppLink`
- Import CSV traz clientes potenciais para o CRM, nao leads de energia solar

**O que NAO copiar:**
- Scoring de lead baseado em engajamento solar
- Secao de propostas solares
- Integracao com calculadora solar
- Qualquer referencia a `public.leads`, `public.propostas`

**Hook interno:**
```typescript
// src/modules/internal-crm/hooks/useInternalCrmClients.ts
// NAO importa useLeads
// Usa exclusivamente useInternalCrmClients(), useInternalCrmClientDetail()
// Expoe:
//   clients paginados/filtrados
//   clientDetail(id) com deals, tasks, contacts, app_link, public_org_summary
//   upsertClient(data)
//   assignOwner(clientId, userId)
//   setNextAction(clientId, action, actionAt)
//   updateLifecycle(clientId, newStatus)
//   provisionCustomer(clientId) — chama internal-crm-api → admin-api
//   importClients(csv)
//   exportClients(filters)
```

**Contrato de dados:**
- Leitura: `InternalCrmClientSummary[]`, `InternalCrmClientDetail`
- Escrita: `upsert_client`, `provision_customer`
- Query keys: `internalCrmQueryKeys.clients()`, `internalCrmQueryKeys.clientDetail(id)`

**Criterio de aceite:**
- [ ] Tabela de clientes com mesma densidade visual do ContactsView
- [ ] Busca, filtros e ordenacao funcionam
- [ ] Detalhe mostra timeline completa
- [ ] Secao "Conta no SolarZap" mostra dados reais do app publico (read-only)
- [ ] Provisionamento cria org + user no app publico e vincula
- [ ] Import/export CSV funciona
- [ ] Zero leitura direta de `public.leads`

---

### 3.4 Dashboard CRM (Prioridade: ALTA — e a visao de gestao)

**Fonte SolarZap:**
- `src/components/solarzap/DashboardView.tsx` (~400 linhas)
- `src/components/dashboard/*`
- `src/hooks/useDashboardReport.ts`
- `src/types/dashboard.ts`

**Destino CRM Interno:**
- `src/modules/internal-crm/components/dashboard/InternalCrmDashboardView.tsx`
- `src/modules/internal-crm/components/dashboard/cards/KpiGrid.tsx`
- `src/modules/internal-crm/components/dashboard/cards/StalledDealsTable.tsx`
- `src/modules/internal-crm/components/dashboard/cards/NextActionsPanel.tsx`
- `src/modules/internal-crm/components/dashboard/cards/OnboardingQueue.tsx`
- `src/modules/internal-crm/components/dashboard/charts/FunnelChart.tsx`
- `src/modules/internal-crm/components/dashboard/charts/RevenueByProductChart.tsx`
- `src/modules/internal-crm/components/dashboard/charts/MrrByPlanChart.tsx`
- `src/modules/internal-crm/components/dashboard/charts/LeadSourceChart.tsx`
- `src/modules/internal-crm/components/dashboard/charts/SellerPerformanceChart.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmDashboard.ts`

**O que copiar com paridade total:**
- Grid de KPIs no topo (cards com titulo, valor, subtitulo)
- Filtro de periodo (date range picker)
- Layout responsivo de cards e graficos
- Tabela de deals parados
- Tabela de proximas acoes
- Linguagem visual: cores, fontes, espacamento do DashboardView

**O que adaptar para o contexto interno:**
- KPIs sao os do CRM comercial, nao os do produto:
  - Leads no periodo
  - Leads qualificados
  - Demos agendadas
  - Propostas enviadas
  - Taxa de ganho (%)
  - Receita one-time fechada (R$)
  - MRR vendido (R$)
  - MRR ativo (R$)
  - Onboarding pendente
  - Clientes em risco de churn
  - Churned no periodo
- Graficos sao novos:
  - Funil por etapa do pipeline comercial
  - Receita por produto (Scale vs Pro vs Start vs Mentorias vs LP)
  - MRR por plano
  - Origem dos leads (indicacao, site, WhatsApp, campanha outbound)
  - Performance por vendedor
- Tabela "Fila de proxima acao" com clientes sem resposta e deals parados
- Tabela "Onboarding pendente" com clientes que fecharam mas nao foram provisionados
- Tabela "Pagamentos pendentes" com deals ganhos aguardando pagamento

**O que NAO copiar:**
- Metricas de propostas solares (kWp, ROI)
- Analise de perdas por motivo solar
- Metricas de engajamento do produto
- Qualquer query em `public.leads`, `public.deals`, `public.lead_sale_*`

**Hook interno:**
```typescript
// src/modules/internal-crm/hooks/useInternalCrmDashboard.ts
// NAO importa useDashboardReport
// Usa exclusivamente useInternalCrmDashboard() — ja existe, precisa expandir
// Expoe:
//   kpis: InternalCrmDashboardKpis (com periodo selecionado)
//   stalledDeals: InternalCrmDealSummary[]
//   nextActions: InternalCrmTask[]
//   onboardingQueue: InternalCrmClientSummary[] (lifecycle=customer_onboarding, provisioning_status!=provisioned)
//   pendingPayments: InternalCrmDealSummary[] (status=won, payment_status=pending)
```

**Contrato de dados:**
- Leitura: `InternalCrmDashboardKpis` (expandido com filtro de periodo)
- Actions: `list_dashboard_kpis` com parametros `from_date`, `to_date`
- Query keys: `internalCrmQueryKeys.dashboard(fromDate, toDate)`

**Criterio de aceite:**
- [ ] Grid de KPIs com mesma linguagem visual do DashboardView
- [ ] Filtro de periodo funciona e recarrega dados
- [ ] Todas as 11 metricas exibidas
- [ ] Tabelas de deals parados, proximas acoes e onboarding pendente
- [ ] Pelo menos 3 graficos implementados (funil, receita por produto, performance por vendedor)
- [ ] Zero query em schema `public`

---

### 3.5 Campanhas (Prioridade: MEDIA — acelera prospeccao outbound)

**Fonte SolarZap:**
- `src/components/solarzap/BroadcastView.tsx` (~500 linhas)
- `BroadcastCampaignModal.tsx`
- `BroadcastStatusPanel.tsx`
- `BroadcastLeadSelector.tsx`
- `src/hooks/useBroadcasts.ts`

**Destino CRM Interno:**
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignsView.tsx`
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignModal.tsx`
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignStatusPanel.tsx`
- `src/modules/internal-crm/components/campaigns/InternalCrmRecipientSelector.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmCampaigns.ts`

**O que copiar com paridade total:**
- Lista de campanhas com: nome, status, datas, contadores (sent/failed), responsavel
- Modal de criacao: nome, mensagens (texto + midia), selecao de audiencia
- Painel de status em tempo real: progresso, contadores, erros
- Acoes: start, pause, resume, cancel
- Cards com badges de status

**O que adaptar para o contexto interno:**
- Audiencia e `internal_crm.clients` filtrados por etapa, lifecycle, responsavel, canal, tags — nao `public.leads`
- Instancia usada e a interna (`sz_internal_*`)
- Worker e o `internal-crm-broadcast-worker`, nao o `broadcast-worker` do produto
- Campanhas tipicas:
  - Prospeccao outbound fria (leads importados)
  - Reativacao de leads que nao responderam
  - Follow-up de demos nao fechadas
  - Campanha de upsell para clientes ativos (Start→Pro, Pro→Scale)
  - Campanha de reengajamento de churned
- Mensagens devem poder incluir variaveis: `{nome}`, `{empresa}`, `{plano}`

**O que NAO copiar:**
- Templates de mensagem solar
- Integracao com calculadora de proposta
- Qualquer referencia a `public.broadcast_campaigns`, `public.broadcast_recipients`

**Worker:**
- `supabase/functions/internal-crm-broadcast-worker/index.ts`
- Processa `internal_crm.broadcast_recipients` pendentes
- Envia via instancia interna no Evolution API
- Atualiza contadores em `internal_crm.broadcast_campaigns`
- Loga erros por recipient
- Respeita rate limiting do WhatsApp

**Criterio de aceite:**
- [ ] Lista de campanhas com mesma densidade do BroadcastView
- [ ] Criar campanha seleciona audiencia do CRM interno
- [ ] Start/pause/cancel funcionam
- [ ] Worker processa e atualiza contadores
- [ ] Zero processamento no `broadcast-worker` do produto
- [ ] Zero leitura de `public.broadcast_campaigns`

---

### 3.6 IA (Prioridade: MEDIA-ALTA — diferencial de velocidade comercial)

**Fonte SolarZap:**
- `src/components/solarzap/AIAgentsView.tsx` (~800 linhas)
- `src/hooks/useAISettings.ts`
- `src/hooks/useUserWhatsAppInstances.ts`
- `src/types/ai.ts`
- `src/constants/aiPipelineAgents.ts`
- `src/constants/aiSupportStages.ts`

**Destino CRM Interno:**
- `src/modules/internal-crm/components/ai/InternalCrmAiView.tsx`
- `src/modules/internal-crm/components/ai/InternalCrmAiStageConfig.tsx`
- `src/modules/internal-crm/components/ai/InternalCrmAiJobsList.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmAi.ts`
- `src/modules/internal-crm/types/ai.ts`

**O que copiar com paridade total:**
- Toggle global de IA
- Toggles por capacidade (qualificacao, follow-up, broadcast, onboarding)
- Editor de prompt por etapa do pipeline
- Configuracao de timezone
- Selecao de modelo
- Lista de jobs pendentes/processados

**O que adaptar para o contexto interno:**
- Etapas sao do pipeline comercial interno (`lead_entrante`, `contato_iniciado`, `qualificado`, `demo_agendada`, `proposta_enviada`, `negociacao`, `aguardando_pagamento`), nao do pipeline solar
- Prompts devem ser otimizados para venda de SaaS/mentoria:
  - Qualificacao: identificar porte da empresa solar, volume de propostas, se ja usa CRM, orcamento
  - Follow-up: cadencia de reengajamento de leads frios, lembrete de demo, nudge de proposta
  - Onboarding: guiar cliente recente na configuracao do SolarZap
- A instancia WhatsApp e a interna
- Jobs rodam no `internal-crm-api` action `process_agent_jobs`
- Cadencia de follow-up configuravel por etapa
- Janelas de agendamento (horario comercial) para envios automaticos

**O que NAO copiar:**
- Agentes de suporte tecnico do produto (esses ficam no SolarZap)
- Configuracao de stages de atendimento (SAC)
- Qualquer referencia a `public.ai_settings`, `public.ai_stage_config`

**Criterio de aceite:**
- [ ] Tela de IA com mesma densidade do AIAgentsView
- [ ] Toggles por capacidade funcionam e persistem em `internal_crm.ai_settings`
- [ ] Configuracao por etapa do pipeline comercial interno funciona
- [ ] Jobs de qualificacao processam e enviam mensagem via instancia interna
- [ ] Follow-up automatico respeita cadencia e janela horaria
- [ ] Zero uso de `public.ai_settings` ou `process-agent-jobs` do produto

---

### 3.7 Financeiro CRM (Prioridade: MEDIA — visao de receita)

**Fonte SolarZap:**
- `src/components/solarzap/DashboardView.tsx` (~400 linhas)
- `src/components/dashboard/*`

**Destino CRM Interno:**
- `src/modules/internal-crm/components/finance/InternalCrmFinanceView.tsx`
- `src/modules/internal-crm/components/finance/cards/RevenueKpiGrid.tsx`
- `src/modules/internal-crm/components/finance/tables/OrdersTable.tsx`
- `src/modules/internal-crm/components/finance/tables/SubscriptionsTable.tsx`
- `src/modules/internal-crm/components/finance/tables/PendingPaymentsTable.tsx`
- `src/modules/internal-crm/components/finance/charts/MrrTrendChart.tsx`
- `src/modules/internal-crm/components/finance/charts/RevenueBreakdownChart.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmFinance.ts`

**O que copiar com paridade total:**
- Grid de KPIs financeiros
- Tabelas operacionais com filtros
- Graficos de tendencia
- Filtro de periodo
- Export de dados

**O que adaptar para o contexto interno:**
- Metricas financeiras do CRM interno, nao do SaaS:
  - Receita one-time total (mentorias + landing pages)
  - MRR vendido (planos fechados no periodo)
  - MRR ativo (planos com billing em dia)
  - Pagamentos pendentes
  - Churn rate
  - ARPU
  - LTV estimado
- Tabela de orders (todos os pagamentos registrados)
- Tabela de subscriptions (promessas comerciais vs billing real Stripe)
- Tabela de pagamentos pendentes
- Grafico de evolucao MRR
- Grafico de receita por produto

Nota: esta aba depende das tabelas `orders`, `subscriptions`, `payment_events` que estao planejadas para fases mais avancadas. O V1 do Financeiro usa dados de `deals` ganhos como proxy.

**O que NAO copiar:**
- Metricas do SaaS (essas ficam no Financeiro SaaS do admin)
- Qualquer referencia a `public.*` billing tables

**Criterio de aceite:**
- [ ] KPIs financeiros exibidos corretamente
- [ ] Tabela de orders e subscriptions
- [ ] Filtro de periodo
- [ ] Graficos de MRR e receita por produto
- [ ] Zero confusao com Financeiro SaaS do admin

---

### 3.8 Calendario (Prioridade: BAIXA-MEDIA — suporte a demos e follow-ups)

**Fonte SolarZap:**
- `src/components/solarzap/CalendarView.tsx` (~600 linhas)
- `src/components/solarzap/calendar/CalendarFilters.tsx`
- `src/components/solarzap/calendar/EventArchiveModal.tsx`
- `src/components/solarzap/calendar/EventFeedbackModal.tsx`
- `src/components/solarzap/AppointmentModal.tsx` (~600 linhas)
- `src/hooks/useAppointments.ts`
- `src/hooks/useLeadTasks.ts`

**Destino CRM Interno:**
- `src/modules/internal-crm/components/calendar/InternalCrmCalendarView.tsx`
- `src/modules/internal-crm/components/calendar/InternalCrmCalendarFilters.tsx`
- `src/modules/internal-crm/components/calendar/InternalCrmAppointmentModal.tsx`
- `src/modules/internal-crm/components/calendar/InternalCrmEventFeedbackModal.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmCalendar.ts`

**O que copiar com paridade total:**
- Grade de calendario (mensal/semanal/diario)
- Agenda lateral com lista de eventos do dia
- Filtros por tipo, responsavel, status
- Drawer mobile
- Modal de criacao/edicao de evento

**O que adaptar para o contexto interno:**
- Tipos de evento: `call`, `demo`, `meeting`, `visit`, `follow_up`, `onboarding_session`
- Evento vinculado a `internal_crm.clients` e `internal_crm.deals`, nao a `public.leads`
- Feedback pos-evento (demo feita → registrar resultado, call feita → proxima acao)
- Arquivamento de eventos passados
- Ligacao entre evento e proxima acao do deal

**O que NAO copiar:**
- Integracao com Google Calendar (pode entrar V3)
- Qualquer referencia a `public.appointments`, `useAppointments`, `useLeadTasks`

**Criterio de aceite:**
- [ ] Calendario com mesma grade visual do CalendarView
- [ ] Criar evento vinculado a cliente/deal
- [ ] Filtros funcionam
- [ ] Feedback pos-evento registra resultado
- [ ] Zero query em `public.appointments`

---

## 4. Recorte por Versao

### V1 — Vendavel (foco: fechar primeira venda usando o CRM)

**Objetivo:** Operar o ciclo completo captar → qualificar → conversar → fechar → cobrar → provisionar.

**Abas incluidas:**

| Aba | Nivel de paridade | Observacao |
|-----|-------------------|------------|
| Pipeline | 90% | Kanban completo, drag-drop, fechamento com Stripe/manual |
| Inbox | 80% | Lista + chat + notas. Sem audio recording, sem forward |
| Clientes | 80% | Lista + detalhe + timeline + provisionamento. Sem import CSV |
| Dashboard CRM | 70% | KPIs + tabelas. Sem graficos (entram V2) |

**O que NAO entra no V1:**
- Campanhas (disparo manual via Inbox resolve no comeco)
- IA (follow-up manual e aceitavel com poucos leads)
- Financeiro CRM (deals ganhos sao proxy suficiente)
- Calendario (agendar por WhatsApp resolve no comeco)

**Entregas tecnicas V1:**

Frontend (upgrade das pages atuais para paridade visual):
- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx` (novo, substitui logica do PipelinePage)
- `src/modules/internal-crm/components/pipeline/DealCard.tsx` (novo)
- `src/modules/internal-crm/components/pipeline/PipelineFilters.tsx` (novo)
- `src/modules/internal-crm/components/pipeline/modals/EditDealModal.tsx` (novo)
- `src/modules/internal-crm/components/pipeline/modals/DealCheckoutModal.tsx` (novo)
- `src/modules/internal-crm/components/pipeline/modals/MarkAsLostModal.tsx` (novo)
- `src/modules/internal-crm/components/pipeline/modals/DealCommentsSheet.tsx` (novo)
- `src/modules/internal-crm/components/pipeline/AssignOwnerSelect.tsx` (novo)
- `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx` (novo)
- `src/modules/internal-crm/components/inbox/InternalCrmChatArea.tsx` (novo)
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanel.tsx` (novo)
- `src/modules/internal-crm/components/inbox/InternalCrmMessageComposer.tsx` (novo)
- `src/modules/internal-crm/components/clients/InternalCrmClientsView.tsx` (novo)
- `src/modules/internal-crm/components/clients/InternalCrmClientDetail.tsx` (novo)
- `src/modules/internal-crm/components/clients/InternalCrmClientTimeline.tsx` (novo)
- `src/modules/internal-crm/components/clients/modals/EditClientModal.tsx` (novo)
- `src/modules/internal-crm/components/clients/modals/ProvisionCustomerModal.tsx` (novo)
- `src/modules/internal-crm/components/clients/modals/NextActionModal.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/InternalCrmDashboardView.tsx` (novo, substitui logica do DashboardPage)
- `src/modules/internal-crm/components/dashboard/cards/KpiGrid.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/cards/StalledDealsTable.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/cards/NextActionsPanel.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/cards/OnboardingQueue.tsx` (novo)

Hooks (novos, composicao sobre hooks existentes):
- `src/modules/internal-crm/hooks/useInternalCrmPipeline.ts`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`
- `src/modules/internal-crm/hooks/useInternalCrmClients.ts`
- `src/modules/internal-crm/hooks/useInternalCrmDashboard.ts`

Backend (ajustes no `internal-crm-api`):
- Expandir `list_dashboard_kpis` para aceitar `from_date`/`to_date`
- Garantir `provision_customer` chama `admin-api` `create_org_with_user` e grava `customer_app_links`
- Garantir `create_deal_checkout_link` gera sessao Stripe Checkout correta
- Garantir `webhook_inbound` processa mensagens da instancia interna
- Realtime: habilitar `supabase.channel('internal_crm_messages')` para refresh de chat

Instancia WhatsApp:
- Registrar `sz_internal_01` no Evolution API
- Configurar webhook para `internal-crm-api` action `webhook_inbound`
- Escanear QR code e conectar

Testes V1:
- Smoke test: criar client → criar deal → mover etapas → marcar ganho → gerar checkout Stripe → provisionar conta
- Smoke test: enviar mensagem WhatsApp → receber resposta → ver no inbox
- Smoke test: dashboard mostra KPIs corretos para periodo selecionado
- Smoke test: detalhe de cliente mostra dados do app publico apos provisionamento
- Teste de isolamento: confirmar zero writes em tabelas `public`

**Criterio de V1 pronto:**
- [ ] Equipe interna consegue cadastrar lead, conversar, fechar venda, cobrar e provisionar conta usando exclusivamente o CRM interno
- [ ] Nenhuma operacao desse fluxo toca o SolarZap principal
- [ ] Pipeline visual e equivalente ao PipelineView do SolarZap
- [ ] Inbox visual e funcional e equivalente ao Conversations do SolarZap (menos audio recording e forward)

---

### V2 — Operacional (foco: escalar operacao comercial e reter clientes)

**Objetivo:** Automatizar prospeccao, follow-up e acompanhamento pos-venda.

**Abas incluidas:**

| Aba | Nivel de paridade | Observacao |
|-----|-------------------|------------|
| Campanhas | 90% | Disparo outbound + reativacao + upsell |
| IA | 80% | Qualificacao + follow-up + onboarding. Sem agente de campanhas |
| Calendario | 80% | Grade + agenda + feedback. Sem Google Calendar |
| Dashboard CRM | 90% | Adiciona graficos (funil, receita, MRR, performance) |
| Clientes | 90% | Adiciona import/export CSV, timeline enriquecida |
| Inbox | 90% | Adiciona WhatsApp templates, audio recording |

**Entregas tecnicas V2:**

Frontend:
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignsView.tsx` (upgrade, substitui CampaignsPage)
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignModal.tsx` (novo)
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignStatusPanel.tsx` (novo)
- `src/modules/internal-crm/components/campaigns/InternalCrmRecipientSelector.tsx` (novo)
- `src/modules/internal-crm/components/ai/InternalCrmAiView.tsx` (upgrade, substitui AiPage)
- `src/modules/internal-crm/components/ai/InternalCrmAiStageConfig.tsx` (novo)
- `src/modules/internal-crm/components/ai/InternalCrmAiJobsList.tsx` (novo)
- `src/modules/internal-crm/components/calendar/InternalCrmCalendarView.tsx` (novo)
- `src/modules/internal-crm/components/calendar/InternalCrmCalendarFilters.tsx` (novo)
- `src/modules/internal-crm/components/calendar/InternalCrmAppointmentModal.tsx` (novo)
- `src/modules/internal-crm/components/calendar/InternalCrmEventFeedbackModal.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/charts/FunnelChart.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/charts/RevenueByProductChart.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/charts/MrrByPlanChart.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/charts/LeadSourceChart.tsx` (novo)
- `src/modules/internal-crm/components/dashboard/charts/SellerPerformanceChart.tsx` (novo)
- `src/modules/internal-crm/components/clients/modals/ImportClientsModal.tsx` (novo)
- `src/modules/internal-crm/components/clients/modals/ExportClientsModal.tsx` (novo)

Hooks:
- `src/modules/internal-crm/hooks/useInternalCrmCampaigns.ts` (novo)
- `src/modules/internal-crm/hooks/useInternalCrmAi.ts` (novo)
- `src/modules/internal-crm/hooks/useInternalCrmCalendar.ts` (novo)

Pages (novos):
- `src/modules/internal-crm/pages/InternalCrmCalendarPage.tsx` (novo)

Rotas:
- Adicionar `/admin/crm/calendar` em `Admin.tsx`
- Adicionar "Calendarios" na sidebar do AdminLayout

Backend:
- `supabase/functions/internal-crm-broadcast-worker/index.ts` (novo)
- `internal-crm-api` actions novas: `process_agent_jobs` (IA), `list_appointments`, `upsert_appointment`
- Cron para processar `internal_crm.scheduled_agent_jobs`
- Migration para tabelas V2: `internal_crm.broadcast_campaigns`, `internal_crm.broadcast_recipients`, `internal_crm.ai_settings`, `internal_crm.ai_stage_config`, `internal_crm.scheduled_agent_jobs`, `internal_crm.ai_action_logs`

Nota: verificar quais dessas tabelas ja existem na migration base. Se ja existem mas estao vazias, apenas add a seed. Se nao existem, criar migration incremental.

Testes V2:
- Smoke test: criar campanha → selecionar audiencia → disparar → acompanhar progresso → ver contadores
- Smoke test: IA qualifica lead automaticamente apos primeira mensagem
- Smoke test: follow-up automatico envia mensagem apos N dias sem resposta
- Smoke test: criar evento de demo → registrar feedback → gerar proxima acao
- Smoke test: dashboard mostra graficos corretos
- Teste de isolamento: broadcast worker nao toca `public.broadcast_campaigns`

**Criterio de V2 pronto:**
- [ ] Campanhas outbound e de reativacao funcionam end-to-end
- [ ] IA opera qualificacao e follow-up automaticamente
- [ ] Calendario permite agendar e registrar demos
- [ ] Dashboard mostra graficos de funil e performance
- [ ] Import/export de clientes funciona
- [ ] Inbox suporta templates e audio

---

### V3 — Maturidade (foco: sofisticacao e inteligencia)

**Objetivo:** Tornar o CRM interno tao poderoso quanto o SolarZap principal em todos os aspectos.

**Abas incluidas:**

| Aba | Nivel de paridade | Observacao |
|-----|-------------------|------------|
| Financeiro CRM | 95% | Orders, subscriptions, payment events, sync Stripe |
| Dashboard CRM | 100% | Todos os graficos, export, visao por vendedor |
| IA | 95% | Agente de campanhas, sugestao de upsell |
| Calendario | 95% | Google Calendar sync |
| Inbox | 95% | Forward, quick replies, chatbot inline |
| Pipeline | 100% | Automacoes de etapa, SLA por coluna |
| Clientes | 100% | Customer health score, snapshot materializado |

**Entregas tecnicas V3:**

Migrations:
- `internal_crm.orders`
- `internal_crm.subscriptions`
- `internal_crm.payment_events`
- `internal_crm.customer_app_snapshot`

Frontend:
- `src/modules/internal-crm/components/finance/InternalCrmFinanceView.tsx` (upgrade completo)
- `src/modules/internal-crm/components/finance/cards/RevenueKpiGrid.tsx`
- `src/modules/internal-crm/components/finance/tables/OrdersTable.tsx`
- `src/modules/internal-crm/components/finance/tables/SubscriptionsTable.tsx`
- `src/modules/internal-crm/components/finance/tables/PendingPaymentsTable.tsx`
- `src/modules/internal-crm/components/finance/charts/MrrTrendChart.tsx`
- `src/modules/internal-crm/components/finance/charts/RevenueBreakdownChart.tsx`

Backend:
- Sync Stripe → `internal_crm.subscriptions` via webhook ou cron
- Snapshot materializado com cron
- Agente IA de campanhas
- Google Calendar OAuth flow para calendario

Testes V3:
- Smoke test: pagamento Stripe reflete em `orders` e `subscriptions`
- Smoke test: snapshot de clientes atualiza via cron
- Smoke test: IA sugere upsell para clientes ativos
- Smoke test: Google Calendar sync bidirecional

---

## 5. Sequencia de Implementacao Recomendada (por prioridade comercial)

```
FASE  PRIORIDADE  ABA/ENTREGA                           JUSTIFICATIVA
────  ──────────  ────────────────────────────────────   ──────────────────────────────────
V1.1  CRITICA     Pipeline (paridade visual)             Sem pipeline nao ha venda
V1.2  CRITICA     Inbox (paridade visual + realtime)     Sem conversa nao ha relacionamento
V1.3  ALTA        Clientes (paridade visual + prov.)     Sem cadastro central nao ha gestao
V1.4  ALTA        Dashboard CRM (KPIs + tabelas)         Sem visao nao ha gestao
V1.5  ALTA        Instancia WhatsApp interna             Habilita inbox e campanhas futuras
V1.6  ALTA        Provisionamento end-to-end             Fechar ciclo venda → conta ativa
────  ──────────  ────────────────────────────────────   ──────────────────────────────────
V2.1  MEDIA-ALTA  IA (qualificacao + follow-up)          Automatiza o que mais consome tempo
V2.2  MEDIA       Campanhas (outbound + reativacao)      Escala prospeccao
V2.3  MEDIA       Calendario (demos + feedback)          Organiza agenda comercial
V2.4  MEDIA       Dashboard graficos                     Visao analitica
V2.5  MEDIA       Import/export CSV de clientes          Base transicional
V2.6  MEDIA       Inbox templates + audio                Qualidade de conversa
────  ──────────  ────────────────────────────────────   ──────────────────────────────────
V3.1  BAIXA       Financeiro CRM completo                Controle financeiro fino
V3.2  BAIXA       Snapshot materializado                 Performance com escala
V3.3  BAIXA       IA agente de campanhas                 Automacao passiva
V3.4  BAIXA       Google Calendar sync                   Conveniencia
V3.5  BAIXA       Customer health score                  Predicao de churn
V3.6  BAIXA       Automacoes de etapa + SLA              Processo blindado
```

---

## 6. Orientacao de Execucao por Sprint

### Sprint V1.1 — Pipeline com Paridade Visual

**Ponto de partida:** `InternalCrmPipelinePage.tsx` (300 linhas) ja funciona mas e basico.

**Estrategia:** Copiar estrutura visual de `PipelineView.tsx` (800 linhas) para componentes dedicados em `src/modules/internal-crm/components/pipeline/*`. A PipelinePage passa a montar esses componentes em vez de ter tudo inline.

Acoes:
1. Criar `InternalCrmPipelineView.tsx` copiando o layout kanban de `PipelineView.tsx`
2. Trocar toda referencia a `usePipeline`/`useLeads` por `useInternalCrmDeals()`/`useInternalCrmPipelineStages()`
3. Trocar `Lead` por `InternalCrmDealSummary` no contrato dos cards
4. Criar `DealCard.tsx` espelhando os cards de lead do PipelineView mas usando `InternalCrmDealSummary`
5. Criar `PipelineFilters.tsx` com filtros de responsavel/etapa/origem
6. Criar modal `EditDealModal.tsx` com formulario de deal + deal_items
7. Criar modal `DealCheckoutModal.tsx` para gerar link Stripe ou registrar manual
8. Criar modal `MarkAsLostModal.tsx` com campo `lost_reason`
9. Atualizar `InternalCrmPipelinePage.tsx` para importar `InternalCrmPipelineView`
10. Testar drag-drop, criacao, edicao, ganho e perda

### Sprint V1.2 — Inbox com Paridade Visual

**Ponto de partida:** `InternalCrmInboxPage.tsx` (200 linhas) tem lista e chat basicos.

**Estrategia:** Copiar layout de 3 colunas de `ConversationList.tsx` + `ChatArea.tsx` + `ActionsPanel.tsx` para componentes dedicados em `src/modules/internal-crm/components/inbox/*`.

Acoes:
1. Criar `InternalCrmConversationList.tsx` copiando layout de `ConversationList.tsx`
2. Trocar referencia a `useChat` por `useInternalCrmConversations()`
3. Criar `InternalCrmChatArea.tsx` copiando layout de `ChatArea.tsx`
4. Trocar `interacoes` por `InternalCrmMessage[]`
5. Implementar composer com envio de texto, emoji picker e upload
6. Criar `InternalCrmActionsPanel.tsx` mostrando dados do client e deals
7. Implementar Realtime subscription para novas mensagens
8. Criar `useInternalCrmInbox.ts` como hook de composicao
9. Atualizar `InternalCrmInboxPage.tsx` para montar os 3 paineis
10. Testar envio, recebimento, notas internas e atribuicao

### Sprint V1.3 — Clientes com Paridade Visual

**Ponto de partida:** `InternalCrmClientsPage.tsx` (250 linhas) tem lista e modal basicos.

**Estrategia:** Copiar densidade de `ContactsView.tsx` (900 linhas) para lista + detalhe.

Acoes:
1. Criar `InternalCrmClientsView.tsx` com tabela completa (empresa, contato, telefone, email, etapa, lifecycle, responsavel, MRR, proxima acao)
2. Criar `InternalCrmClientDetail.tsx` com tabs: dados, deals, timeline, conta SolarZap, tasks
3. Criar `InternalCrmClientTimeline.tsx` agregando mensagens, mudancas de etapa, deals e tasks
4. Criar modais: `EditClientModal`, `ProvisionCustomerModal`, `NextActionModal`
5. Implementar busca e filtros
6. Trocar `useLeads` por `useInternalCrmClients()`
7. Atualizar `InternalCrmClientsPage.tsx`
8. Testar CRUD, provisionamento, filtros e detalhe

### Sprint V1.4 — Dashboard com KPIs Reais

**Ponto de partida:** `InternalCrmDashboardPage.tsx` (120 linhas) mostra KPIs basicos.

**Estrategia:** Expandir para paridade com `DashboardView.tsx` (400 linhas) em layout e cards.

Acoes:
1. Criar `InternalCrmDashboardView.tsx` com grid de KPIs + tabelas
2. Implementar filtro de periodo (date range picker)
3. Expandir `list_dashboard_kpis` no backend para aceitar `from_date`/`to_date`
4. Criar `StalledDealsTable`, `NextActionsPanel`, `OnboardingQueue`
5. Atualizar `InternalCrmDashboardPage.tsx`
6. Testar com dados reais

---

## 7. Regras Para Nao Afetar o SolarZap

Replicadas do plano original — sem excecao:

1. Nao alterar assinaturas publicas de `PipelineView`, `ContactsView`, `ConversationList`, `ChatArea`, `BroadcastView`, `AIAgentsView`, `DashboardView`, `CalendarView`, `AppointmentModal`
2. Nao alterar hooks do produto para suportarem `internal_crm`
3. Nao adicionar condicionais por host dentro dos hooks do produto
4. Nao mover tabelas ou workers do produto para nomes genericos
5. Nao reutilizar query keys do SolarZap dentro do CRM interno
6. Nao compartilhar buckets
7. Nao compartilhar webhook handlers
8. Nao criar FKs entre `internal_crm.*` e `public.*`
9. Nao alterar migrations existentes do schema `public`

---

## 8. Mapa de Componentes — Fonte para Destino

### V1

| Componente SolarZap (fonte de layout) | Componente CRM Interno (destino) | Acao |
|---------------------------------------|----------------------------------|------|
| `PipelineView.tsx` | `pipeline/InternalCrmPipelineView.tsx` | copiar layout, trocar hooks |
| Cards de lead do PipelineView | `pipeline/DealCard.tsx` | copiar visual, trocar tipo |
| Filtros do PipelineView | `pipeline/PipelineFilters.tsx` | copiar layout, trocar filtros |
| `EditLeadModal.tsx` | `pipeline/modals/EditDealModal.tsx` | adaptar campos para deal |
| `MarkAsLostModal.tsx` | `pipeline/modals/MarkAsLostModal.tsx` | copiar quase direto |
| — | `pipeline/modals/DealCheckoutModal.tsx` | novo (Stripe + manual) |
| `LeadCommentsModal.tsx` | `pipeline/modals/DealCommentsSheet.tsx` | copiar layout |
| `AssignMemberSelect.tsx` | `pipeline/AssignOwnerSelect.tsx` | copiar layout, trocar query |
| `ConversationList.tsx` | `inbox/InternalCrmConversationList.tsx` | copiar layout, trocar hooks |
| `ChatArea.tsx` | `inbox/InternalCrmChatArea.tsx` | copiar layout, trocar hooks |
| `ActionsPanel.tsx` | `inbox/InternalCrmActionsPanel.tsx` | adaptar para client/deals |
| Composer do ChatArea | `inbox/InternalCrmMessageComposer.tsx` | copiar, simplificar (sem audio V1) |
| `ContactsView.tsx` | `clients/InternalCrmClientsView.tsx` | copiar layout, trocar entidade |
| Detalhe do lead | `clients/InternalCrmClientDetail.tsx` | adaptar para client + deals + app_link |
| — | `clients/InternalCrmClientTimeline.tsx` | novo |
| — | `clients/modals/ProvisionCustomerModal.tsx` | novo |
| `DashboardView.tsx` | `dashboard/InternalCrmDashboardView.tsx` | copiar layout, trocar metricas |
| Cards KPI do Dashboard | `dashboard/cards/KpiGrid.tsx` | copiar layout, trocar dados |

### V2

| Componente SolarZap (fonte de layout) | Componente CRM Interno (destino) | Acao |
|---------------------------------------|----------------------------------|------|
| `BroadcastView.tsx` | `campaigns/InternalCrmCampaignsView.tsx` | copiar layout, trocar hooks |
| `BroadcastCampaignModal.tsx` | `campaigns/InternalCrmCampaignModal.tsx` | copiar layout, trocar audiencia |
| `BroadcastStatusPanel.tsx` | `campaigns/InternalCrmCampaignStatusPanel.tsx` | copiar direto |
| `BroadcastLeadSelector.tsx` | `campaigns/InternalCrmRecipientSelector.tsx` | adaptar para clients |
| `AIAgentsView.tsx` | `ai/InternalCrmAiView.tsx` | copiar layout, trocar hooks |
| Stage config do AIAgentsView | `ai/InternalCrmAiStageConfig.tsx` | copiar, trocar stages |
| — | `ai/InternalCrmAiJobsList.tsx` | novo |
| `CalendarView.tsx` | `calendar/InternalCrmCalendarView.tsx` | copiar layout, trocar hooks |
| `CalendarFilters.tsx` | `calendar/InternalCrmCalendarFilters.tsx` | copiar direto |
| `AppointmentModal.tsx` | `calendar/InternalCrmAppointmentModal.tsx` | copiar, trocar tipo |
| `EventFeedbackModal.tsx` | `calendar/InternalCrmEventFeedbackModal.tsx` | copiar direto |
| — | Graficos do Dashboard | 5 graficos novos (ver secao 3.4) |

---

## 9. Mapa de Hooks — Isolamento Garantido

| Hook SolarZap (NAO usar) | Hook CRM Interno (criar/expandir) | Query Keys |
|---------------------------|------------------------------------|------------|
| `usePipeline` | `useInternalCrmPipeline` | `internalCrmQueryKeys.deals()`, `.stages()` |
| `useLeads` | `useInternalCrmClients` | `internalCrmQueryKeys.clients()`, `.clientDetail(id)` |
| `useChat` | `useInternalCrmInbox` | `internalCrmQueryKeys.conversations()`, `.conversationDetail(id)` |
| `useBroadcasts` | `useInternalCrmCampaigns` | `internalCrmQueryKeys.campaigns()` |
| `useAISettings` | `useInternalCrmAi` | `internalCrmQueryKeys.ai()` |
| `useDashboardReport` | `useInternalCrmDashboard` | `internalCrmQueryKeys.dashboard(from, to)` |
| `useAppointments` | `useInternalCrmCalendar` | `internalCrmQueryKeys.calendar()` |
| `useUserWhatsAppInstances` | `useInternalCrmInstances` (ja existe) | `internalCrmQueryKeys.instances()` |

Todos os hooks do CRM interno:
- Ja tem base em `useInternalCrmApi.ts` (queries e mutations genericas)
- Os hooks novos sao **hooks de composicao** que usam as queries/mutations existentes para expor APIs especificas por dominio
- Nenhum importa diretamente hooks do SolarZap

---

## 10. Workers e Background Jobs

| Worker | Schema | Funcao | Cron |
|--------|--------|--------|------|
| `internal-crm-broadcast-worker` | `internal_crm` | Processa `broadcast_recipients` pendentes via instancia interna | invocado por `internal-crm-api` action `start_campaign` + pg_cron a cada 1min enquanto campanha ativa |
| `internal-crm-api` action `process_agent_jobs` | `internal_crm` | Processa `scheduled_agent_jobs` (qualificacao, follow-up, onboarding) | pg_cron a cada 5min |

Nao reutilizar:
- `broadcast-worker` (produto)
- `process-agent-jobs` (produto)
- `ai-pipeline-agent` (produto)

---

## 11. Smoke Tests por Fase

### V1 — Tests obrigatorios antes de usar em producao

```
TESTE                                        ACOES                                                          ACEITE
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
T1: Ciclo de venda completo                  Criar client → criar deal com Scale + Mentoria 1 →            Deal aparece como ganho,
                                             mover lead_entrante → qualificado → demo_agendada →           checkout Stripe pago,
                                             proposta_enviada → negociacao → aguardando_pagamento →        client lifecycle = customer_onboarding
                                             ganho → gerar checkout Stripe → simular pagamento

T2: Provisionamento pos-venda                A partir de T1, clicar "Provisionar conta" →                  customer_app_links.provisioning_status = provisioned,
                                             verificar criacao de org + user no app publico →               linked_public_org_id preenchido,
                                             verificar vinculo no detalhe do cliente                        detalhe mostra dados do app publico

T3: Conversa completa no Inbox               Enviar mensagem para numero de teste →                        Mensagem aparece no chat com status sent,
                                             receber resposta → ver resposta no inbox →                    resposta aparece com direcao inbound,
                                             criar nota interna → atribuir a outro usuario                  nota visivel, assignee atualizado

T4: Dashboard correto                        Cadastrar 3+ clients com deals em etapas diferentes →         KPIs refletem dados corretos,
                                             verificar KPIs → verificar tabela de deals parados →           tabela de stalled deals mostra deals >7 dias sem mover,
                                             verificar fila de proximas acoes                               next actions mostra tasks com due_at proximo

T5: Isolamento total                         Executar T1-T4 → verificar que:                               Zero rows inseridos em public.leads,
                                             - public.leads nao tem rows novos                              zero rows em public.interacoes,
                                             - public.interacoes nao tem rows novos                         zero rows em public.deals,
                                             - public.deals nao tem rows novos                              zero rows em public.broadcast_campaigns
                                             - public.broadcast_campaigns nao tem rows novos

T6: Guard de seguranca                        Tentar acessar /admin/crm/* com user crm_role='none' →       Retorna 403 / redirect,
                                             Tentar chamar internal-crm-api com token de user normal →     retorna erro 'not_crm_member'
                                             Tentar chamar internal-crm-api sem MFA →                      retorna erro 'mfa_required'
```

### V2 — Tests adicionais

```
T7: Campanha outbound                        Criar campanha → selecionar 5 clients →                      sent_count = 5 (ou com falhas documentadas),
                                             disparar → acompanhar progresso                               mensagens chegam nos destinatarios

T8: IA qualificacao                           Configurar IA com prompt de qualificacao →                   Lead recebe mensagem de qualificacao automatica,
                                             receber lead novo → verificar acao da IA                      ai_action_logs registra execucao

T9: Follow-up automatico                     Configurar follow-up para etapa "contato_iniciado" →          Apos 3 dias, mensagem automatica enviada,
                                             deixar lead sem resposta por 3 dias →                         scheduled_agent_jobs processado
                                             verificar envio automatico

T10: Calendario de demos                      Criar evento de demo → marcar como realizado →               Evento registrado, feedback salvo,
                                             registrar feedback → verificar proxima acao gerada            task de proxima acao criada
```

---

## 12. Recomendacoes Finais

### Prioridades absolutas para impacto comercial

1. **Pipeline visual** — e a primeira impressao e onde a equipe vive. Se o kanban for bonito e funcional, o CRM sera adotado. Se for feio, ninguem usa.

2. **Inbox funcional** — cada mensagem nao respondida e uma venda perdida. O inbox precisa funcionar em tempo real com a mesma fluidez do WhatsApp Web.

3. **Provisionamento one-click** — a experiencia de "fechar deal → provisionar conta → cliente no ar" precisa ser um fluxo continuo, nao 5 abas manuais.

### O que pode esperar sem dor

1. **Graficos do dashboard** — KPIs em cards ja dao visao suficiente no V1.
2. **Import/export CSV** — com poucos leads no inicio, cadastro manual resolve.
3. **IA** — com poucos leads, follow-up manual e aceitavel. A IA brilha quando ha volume.
4. **Campanhas** — no inicio, enviar mensagens pelo inbox resolve.
5. **Financeiro CRM** — deals ganhos sao proxy suficiente ate ter volume.
6. **Calendario** — agendar por WhatsApp resolve enquanto a equipe e pequena.

### Riscos a monitorar

1. **Instancia WhatsApp interna**: se banir, perde inbox e campanhas. Manter numero limpo, respeitar rate limits, nao fazer spam.
2. **Stripe Checkout**: testar exaustivamente em sandbox antes de produzir. Um link quebrado = venda perdida.
3. **Provisionamento**: se falhar, o cliente fica preso. Precisa de retry + alerta + estado `failed` tratado.
4. **Paridade visual**: nao precisa ser pixel-perfect, mas precisa ser "mesma familia". Usar mesmos componentes shadcn, mesmas cores, mesmos espacamentos.

---

## 13. Resumo Executivo

| Versao | Foco | Abas | Resultado |
|--------|------|------|-----------|
| **V1** | Fechar primeira venda pelo CRM | Pipeline, Inbox, Clientes, Dashboard (KPIs) | Ciclo completo: captar → conversar → fechar → cobrar → provisionar |
| **V2** | Escalar operacao | + Campanhas, IA, Calendario, graficos, import/export | Prospeccao automatica, follow-up inteligente, agenda organizada |
| **V3** | Maturidade | + Financeiro completo, snapshot, health score, automacoes | CRM interno tao poderoso quanto o SolarZap principal |

Principio guia: **`shared presentation, isolated persistence, explicit bridge, separate origin`**

A ordem e: primeiro vender, depois escalar, depois sofisticar.
