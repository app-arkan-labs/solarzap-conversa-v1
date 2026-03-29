# Plano de Paridade das Abas do SolarZap para o CRM Interno

Data: 2026-03-29
Base de referencia:
- `docs/PLANO_CRM_INTERNO_SOLARZAP_2026-03-28_FINAL.md`
- estado atual do produto em `src/components/solarzap/*`, `src/hooks/*`, `src/hooks/domain/*`
- estado atual do CRM interno em `src/modules/internal-crm/*`

## 1. Objetivo

Levar o CRM interno do painel Admin para um nivel de paridade visual e funcional com o SolarZap principal, copiando o design e o comportamento das abas abaixo, mas mantendo total isolamento de dominio, dados, hooks, queries, workers e efeitos colaterais:

- `Pipelines` -> `CRM Interno > Pipeline`
- `Conversas` -> `CRM Interno > Inbox`
- `Contatos` -> `CRM Interno > Clientes`
- `Disparos` -> `CRM Interno > Campanhas`
- `IA Agentes` / configuracoes de IA -> `CRM Interno > IA`
- `Dashboard` -> `CRM Interno > Financeiro CRM`
- `Calendario` -> nova aba `CRM Interno > Calendarios`

## 2. Regras Nao Negociaveis

1. Nenhuma funcionalidade nova do CRM interno pode ler ou escrever em `public.leads`, `public.interacoes`, `public.deals`, `public.broadcast_campaigns`, `public.ai_settings`, `public.ai_stage_config`, `public.whatsapp_instances` ou qualquer tabela operacional do SolarZap principal.
2. Nenhuma view do SolarZap principal pode ser editada para passar a suportar o CRM interno via `if/else`, `mode`, `tenant_type`, `is_internal`, `is_admin_host` ou qualquer chave equivalente.
3. A regra e `copy-first`: primeiro duplicar view, hook, modal e contrato para `src/modules/internal-crm/*`; so depois, com paridade validada, extrair componentes puros compartilhaveis se houver ganho real.
4. Todo estado, query key, mutation, realtime channel, storage bucket, webhook, instancia WhatsApp, IA job e worker do CRM interno deve ter naming proprio.
5. O Admin atual (`/admin`, `/admin/orgs`, `/admin/financeiro`, `/admin/flags`, `/admin/audit`) continua vivo e intocado do ponto de vista funcional.

## 3. Matriz Fonte -> Destino

| Area | Fonte SolarZap | Destino CRM Interno | Observacao de isolamento |
|---|---|---|---|
| Pipeline | `src/components/solarzap/PipelineView.tsx` | `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx` | Nao reutilizar `usePipeline` nem `useLeads` |
| Inbox | `src/components/solarzap/ConversationList.tsx`, `ChatArea.tsx`, `ActionsPanel.tsx`, `ConversationActionsSheet.tsx` | `src/modules/internal-crm/components/inbox/*` | Nao reutilizar `useChat` |
| Clientes | `src/components/solarzap/ContactsView.tsx` e modais associados | `src/modules/internal-crm/components/clients/*` | Nao reutilizar `useLeads` nem queries de propostas dos tenants |
| Campanhas | `src/components/solarzap/BroadcastView.tsx`, `BroadcastCampaignModal.tsx`, `BroadcastStatusPanel.tsx` | `src/modules/internal-crm/components/campaigns/*` | Nao reutilizar `useBroadcasts` nem `broadcast-worker` atual |
| IA | `src/components/solarzap/AIAgentsView.tsx` e dependencias | `src/modules/internal-crm/components/ai/*` | Nao reutilizar `useAISettings` nem `useUserWhatsAppInstances` |
| Financeiro CRM | `src/components/solarzap/DashboardView.tsx` e `src/components/dashboard/*` | `src/modules/internal-crm/components/finance/*` | Mesma linguagem visual, metricas do `internal_crm` |
| Calendarios | `src/components/solarzap/CalendarView.tsx`, `AppointmentModal.tsx`, `src/components/solarzap/calendar/*` | `src/modules/internal-crm/components/calendar/*` | Nao reutilizar `useAppointments` nem `useLeadTasks` atuais em modo write |

## 4. Arquitetura de Destino

Criar e organizar assim:

- `src/modules/internal-crm/components/pipeline/*`
- `src/modules/internal-crm/components/inbox/*`
- `src/modules/internal-crm/components/clients/*`
- `src/modules/internal-crm/components/campaigns/*`
- `src/modules/internal-crm/components/ai/*`
- `src/modules/internal-crm/components/finance/*`
- `src/modules/internal-crm/components/calendar/*`
- `src/modules/internal-crm/hooks/*`
- `src/modules/internal-crm/repositories/*`
- `src/modules/internal-crm/types/*`
- `src/modules/internal-crm/pages/*`

Rotas finais do admin CRM:

- `/admin/crm/dashboard`
- `/admin/crm/pipeline`
- `/admin/crm/inbox`
- `/admin/crm/clients`
- `/admin/crm/campaigns`
- `/admin/crm/ai`
- `/admin/crm/finance`
- `/admin/crm/calendar`

## 5. Estrategia de Implementacao Segura

### 5.1 Shell e navegacao

1. Acrescentar a aba `Calendarios` na sidebar do CRM interno.
2. Manter o shell visual do admin, mas cada aba do CRM deve carregar uma view interna dedicada.
3. O conjunto atual de pages do CRM interno deve ser tratado como scaffold temporario; a implementacao real deve migrar para componentes espelho do SolarZap.
4. O `InternalCrmGuard` permanece protegendo todas as rotas `/admin/crm/*`.

### 5.2 Camada de dados

Para cada area, criar um hook espelho do SolarZap, mas com nomes, query keys e contratos proprios:

- `useInternalCrmPipeline`
- `useInternalCrmInbox`
- `useInternalCrmClients`
- `useInternalCrmCampaigns`
- `useInternalCrmAi`
- `useInternalCrmFinance`
- `useInternalCrmCalendar`

Todos esses hooks devem falar apenas com:

- `supabase/functions/internal-crm-api`
- `supabase/functions/internal-crm-broadcast-worker`
- `supabase.schema('internal_crm')` quando a leitura for simples e coberta por RLS

## 6. Plano de Acao por Aba

### 6.1 Pipeline -> CRM Interno > Pipeline

Fonte a mapear:

- `src/components/solarzap/PipelineView.tsx`
- `src/hooks/domain/usePipeline.ts`
- `src/hooks/domain/useLeads.ts`
- modais e blocos vinculados: `EditLeadModal.tsx`, `ProposalModal.tsx`, `ProposalReadyModal.tsx`, `LeadCommentsModal.tsx`, `MarkAsLostModal.tsx`, `AssignMemberSelect.tsx`, `ImportContactsModal.tsx`, `ExportContactsModal.tsx`, `LeadNextAction*`

Destino:

- `src/modules/internal-crm/components/pipeline/InternalCrmPipelineView.tsx`
- `src/modules/internal-crm/components/pipeline/modals/*`
- `src/modules/internal-crm/hooks/useInternalCrmPipeline.ts`

Paridade alvo:

- kanban horizontal por etapa
- drag and drop de cards
- busca
- filtros por canal/origem, responsavel e etapa
- cards com badges, valor, ultima interacao, proxima acao e IA
- criacao/edicao de oportunidade
- marcacao de ganho/perda
- comentarios internos
- import/export de base comercial interna

Adaptacao obrigatoria:

- `Contact` vira `InternalCrmClientSummary`/`InternalCrmDealSummary`
- funil usa `internal_crm.pipeline_stages`, `clients`, `deals`, `deal_items`, `tasks`
- perda usa `lost_reason` do CRM interno
- proposta vira combinacao comercial do CRM, nao proposta do tenant

Aceite:

- a UX deve ser visualmente equivalente ao Pipeline do SolarZap
- nenhum write pode tocar `public.leads` ou `public.deals`

### 6.2 Conversas -> CRM Interno > Inbox

Fonte a mapear:

- `src/components/solarzap/ConversationList.tsx`
- `src/components/solarzap/ChatArea.tsx`
- `src/components/solarzap/ActionsPanel.tsx`
- `src/components/solarzap/ConversationActionsSheet.tsx`
- `src/hooks/domain/useChat.ts`

Destino:

- `src/modules/internal-crm/components/inbox/InternalCrmConversationList.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmChatArea.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmActionsPanel.tsx`
- `src/modules/internal-crm/components/inbox/InternalCrmConversationActionsSheet.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmInbox.ts`

Paridade alvo:

- lista de conversas com pesquisa, badges e timestamps
- painel de chat com composer, anexos e status de envio
- notes internas
- atribuicao de responsavel
- marcacao de leitura
- quick actions laterais
- tratamento de mensagens de entrada e saida

Adaptacao obrigatoria:

- usar `internal_crm.conversations`, `messages`, `whatsapp_instances`
- a instancia Evolution do CRM interno e propria
- o webhook do CRM interno entra por `internal-crm-api` action `webhook_inbound`
- nao reutilizar `whatsapp-webhook` dos tenants

Aceite:

- a experiencia precisa parecer a aba Conversas do SolarZap
- nenhuma mensagem do CRM interno pode aparecer no inbox dos clientes e vice-versa

### 6.3 Contatos -> CRM Interno > Clientes

Fonte a mapear:

- `src/components/solarzap/ContactsView.tsx`
- modais e secoes associadas: `LeadCommentsModal.tsx`, `AssignMemberSelect.tsx`, `LeadNextAction*`, `ImportContactsModal.tsx`, `ExportContactsModal.tsx`
- `src/hooks/domain/useLeads.ts`

Destino:

- `src/modules/internal-crm/components/clients/InternalCrmClientsView.tsx`
- `src/modules/internal-crm/components/clients/InternalCrmClientDetail.tsx`
- `src/modules/internal-crm/components/clients/modals/*`
- `src/modules/internal-crm/hooks/useInternalCrmClients.ts`

Paridade alvo:

- lista + detalhe
- edicao inline
- timeline
- comentarios
- atribuicao
- proxima acao
- importacao/exportacao
- seccao de propostas/combinacoes comerciais
- seccao de provisionamento e ponte com app publico

Adaptacao obrigatoria:

- `client` interno substitui `lead`
- detalhe mostra `customer_app_links` e `crm_bridge_org_summary`
- cards e seccoes devem preservar a linguagem visual de `ContactsView`

Aceite:

- o detalhe do cliente interno deve ficar tao profundo quanto o detalhe do contato do SolarZap
- nenhuma leitura de `public.*` pode acontecer direto do frontend

### 6.4 Disparos -> CRM Interno > Campanhas

Fonte a mapear:

- `src/components/solarzap/BroadcastView.tsx`
- `BroadcastCampaignModal.tsx`
- `BroadcastStatusPanel.tsx`
- `BroadcastLeadSelector.tsx`
- `src/hooks/useBroadcasts.ts`

Destino:

- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignsView.tsx`
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignModal.tsx`
- `src/modules/internal-crm/components/campaigns/InternalCrmCampaignStatusPanel.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmCampaigns.ts`

Paridade alvo:

- criacao de campanha
- selecao de audiencia
- painel de status
- start/pause/resume/cancel
- progresso, contadores e erros
- UX equivalente de cards, badges e painel lateral

Adaptacao obrigatoria:

- usar `internal_crm.broadcast_campaigns`, `broadcast_recipients`
- processamento exclusivo no `internal-crm-broadcast-worker`
- nao reutilizar `broadcast-worker` atual nem `public.broadcast_campaigns`

### 6.5 IA -> CRM Interno > IA

Fonte a mapear:

- `src/components/solarzap/AIAgentsView.tsx`
- `src/hooks/useAISettings.ts`
- `src/hooks/useUserWhatsAppInstances.ts`
- `src/types/ai.ts`
- `src/constants/aiPipelineAgents.ts`
- `src/constants/aiSupportStages.ts`

Destino:

- `src/modules/internal-crm/components/ai/InternalCrmAiView.tsx`
- `src/modules/internal-crm/components/ai/InternalCrmStageConfig.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmAi.ts`
- `src/modules/internal-crm/types/ai.ts`

Paridade alvo:

- toggles globais
- configuracao por etapa
- timezone
- prompts
- janelas de agendamento
- cadencia de follow-up
- lista de jobs
- status da IA por instancia

Adaptacao obrigatoria:

- usar `internal_crm.ai_settings`, `ai_stage_config`, `scheduled_agent_jobs`, `ai_action_logs`
- `process_agent_jobs` roda dentro do `internal-crm-api`
- nao reutilizar `public.ai_settings` nem `process-agent-jobs` do produto

### 6.6 Dashboard -> CRM Interno > Financeiro CRM

Fonte a mapear:

- `src/components/solarzap/DashboardView.tsx`
- `src/components/dashboard/*`
- `src/hooks/useDashboardReport.ts`
- `src/types/dashboard.ts`

Destino:

- `src/modules/internal-crm/components/finance/InternalCrmFinanceDashboardView.tsx`
- `src/modules/internal-crm/components/finance/cards/*`
- `src/modules/internal-crm/components/finance/charts/*`
- `src/modules/internal-crm/hooks/useInternalCrmFinance.ts`

Paridade alvo:

- cards KPI
- tabelas operacionais
- graficos
- filtros de periodo
- exportacao
- visao por responsavel

Adaptacao obrigatoria:

- apesar do nome da aba ser `Financeiro CRM`, o visual deve partir do Dashboard do SolarZap
- metricas usam `internal_crm.deals`, `orders`, `subscriptions`, `payment_events`, `customer_app_links`, `customer_app_snapshot`
- a composicao de dados e nova, mas o desenho e interacoes devem espelhar o dashboard principal

### 6.7 Calendario -> CRM Interno > Calendarios

Fonte a mapear:

- `src/components/solarzap/CalendarView.tsx`
- `src/components/solarzap/calendar/*`
- `src/components/solarzap/AppointmentModal.tsx`
- `src/hooks/useAppointments.ts`
- `src/hooks/useLeadTasks.ts`

Destino:

- `src/modules/internal-crm/components/calendar/InternalCrmCalendarView.tsx`
- `src/modules/internal-crm/components/calendar/*`
- `src/modules/internal-crm/components/calendar/InternalCrmAppointmentModal.tsx`
- `src/modules/internal-crm/hooks/useInternalCrmCalendar.ts`

Paridade alvo:

- grade de calendario
- agenda lateral
- filtros
- drawer mobile
- feedback pos-evento
- arquivamento
- ligacao entre evento e proxima acao

Adaptacao obrigatoria:

- usar `internal_crm.appointments` e `tasks`
- nenhuma query em `public.appointments`
- a UX deve ficar equivalente ao calendario do SolarZap

## 7. Ordem Recomendada de Execucao

1. Criar a aba `Calendarios` no shell do CRM interno.
2. Extrair um inventario de componentes visuais por area.
3. Duplicar a camada de presentacao de `Pipeline`, `Conversas` e `Contatos` primeiro.
4. Construir os hooks/repositorios internos equivalentes para essas 3 areas.
5. Fechar paridade de `Campanhas`.
6. Fechar paridade de `IA`.
7. Fechar paridade de `Financeiro CRM` com base no dashboard.
8. Fechar paridade de `Calendarios`.
9. Rodar regressao cruzada garantindo que nada do SolarZap principal mudou.

## 8. Regras Para Nao Afetar o SolarZap

1. Nao alterar assinaturas publicas de `PipelineView`, `ContactsView`, `ConversationList`, `ChatArea`, `BroadcastView`, `AIAgentsView`, `DashboardView`, `CalendarView`.
2. Nao alterar hooks do produto para suportarem `internal_crm`.
3. Nao adicionar condicionais por host dentro dos hooks do produto.
4. Nao mover tabelas ou workers do produto para nomes genericos.
5. Nao reutilizar query keys do SolarZap dentro do CRM interno.
6. Nao compartilhar buckets.
7. Nao compartilhar webhook handlers.

## 9. Criterios de Pronto

- cada aba do CRM interno tem paridade visual clara com sua correspondente do SolarZap
- os dados do CRM interno vivem apenas em `internal_crm`
- o Admin principal continua igual
- o SolarZap principal continua igual
- todas as acoes criticas do CRM interno tem smoke test proprio
- existe checklist de regressao comparando `SolarZap principal` vs `CRM interno`

## 10. Entregavel Esperado

Ao final, o CRM interno deve parecer um SolarZap paralelo dentro do admin:

- mesma densidade de UX
- mesma profundidade funcional
- mesmo nivel de refinamento visual
- dominio de dados completamente separado
- sem risco de contaminar a operacao dos clientes do produto
