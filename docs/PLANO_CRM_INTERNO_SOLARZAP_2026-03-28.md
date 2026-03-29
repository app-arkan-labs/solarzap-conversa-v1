# Plano CRM Interno SolarZap

Data: 2026-03-28

## Objetivo

Transformar o `Admin Panel` em um CRM interno da propria SolarZap para vender, onboardar, operar e acompanhar os clientes do software, sem reutilizar o dominio de dados do produto atual.

Meta pratica:
- pipeline comercial interno;
- inbox/chat interno;
- dashboard comercial e de base ativa;
- disparo de mensagens;
- agente de IA;
- gestao dos clientes do proprio SolarZap;
- onboarding/provisionamento do cliente dentro do app;
- tudo no mesmo banco, mas em estrutura isolada.

## Conclusao executiva

O software ja possui quase tudo o que um CRM interno precisa, mas espalhado em dois dominios diferentes:

1. `Admin Panel`
- hoje e operacional, nao comercial;
- faz gestao de orgs, billing, flags e auditoria;
- nao possui pipeline, inbox, clientes, tasks ou lifecycle de vendas.

2. `SolarZap principal`
- ja tem conversas, pipeline, dashboard, disparos, IA, calendario e gestao de contatos;
- porem tudo esta acoplado ao dominio dos clientes finais do produto:
  - `public.organizations`
  - `public.leads`
  - `public.interacoes`
  - `public.propostas`
  - `public.broadcast_campaigns`
  - `public.ai_settings`
  - `public.whatsapp_instances`

Leitura objetiva:
- a UI e boa parte da experiencia podem ser reaproveitadas;
- a persistencia atual nao pode ser reaproveitada diretamente;
- o caminho mais seguro e rapido e criar um dominio novo em schema proprio e adaptar os modulos visuais por cima dele.

## O que o codigo atual confirma

### 1. O Admin Panel atual nao e um CRM

Rotas atuais:
- `src/pages/Admin.tsx`

Hoje o painel admin expone apenas:
- dashboard de sistema;
- lista de organizacoes;
- financeiro;
- feature flags;
- audit log.

Componentes principais:
- `src/components/admin/AdminDashboard.tsx`
- `src/components/admin/OrgsList.tsx`
- `src/components/admin/OrgDetails.tsx`
- `src/components/admin/FinancialPanel.tsx`
- `src/components/admin/FeatureFlagsPanel.tsx`
- `src/components/admin/AuditLogViewer.tsx`

Backend:
- `src/hooks/useAdminApi.ts`
- `supabase/functions/admin-api/index.ts`

Esse backend le diretamente:
- `organizations`
- `organization_members`
- `leads`
- `propostas`
- `whatsapp_instances`
- `_admin_subscription_plans`
- `_admin_feature_flags`
- `_admin_audit_log`

Ou seja: e um painel de operacao do produto, nao um CRM interno da SolarZap.

### 2. O produto principal ja contem os blocos do CRM interno

Shell principal:
- `src/components/solarzap/SolarZapLayout.tsx`

Abas disponiveis hoje:
- conversas
- pipelines
- calendario
- contatos
- disparos
- dashboard
- propostas
- integracoes
- tracking
- automacoes
- banco de IA
- IA agentes
- configuracoes

Blocos reaproveitaveis:
- inbox/chat:
  - `src/components/solarzap/ConversationList.tsx`
  - `src/components/solarzap/ChatArea.tsx`
  - `src/hooks/domain/useChat.ts`
- pipeline e contatos:
  - `src/components/solarzap/PipelineView.tsx`
  - `src/components/solarzap/ContactsView.tsx`
  - `src/hooks/domain/useLeads.ts`
  - `src/hooks/domain/usePipeline.ts`
- dashboard:
  - `src/components/solarzap/DashboardView.tsx`
  - `src/hooks/useDashboardReport.ts`
  - `src/types/dashboard.ts`
- disparos:
  - `src/components/solarzap/BroadcastView.tsx`
  - `src/hooks/useBroadcasts.ts`
  - `supabase/functions/broadcast-worker/index.ts`
- IA:
  - `src/components/solarzap/AIAgentsView.tsx`
  - `src/hooks/useAISettings.ts`
  - `src/hooks/useUserWhatsAppInstances.ts`
  - `supabase/functions/process-agent-jobs/index.ts`
  - `supabase/functions/ai-pipeline-agent/index.ts`

### 3. O problema real e o acoplamento do dominio

Os hooks atuais estao presos ao schema publico e ao conceito de tenant cliente:

- `useLeads` escreve em `public.leads`
- `useChat` escreve em `public.interacoes`
- `usePipeline` move `public.leads`, grava `public.deals`, `public.propostas`, `public.appointments`
- `useBroadcasts` usa `public.broadcast_campaigns` e `public.broadcast_recipients`
- `useDashboardReport` calcula metricas em cima de `public.leads`, `public.deals`, `public.lead_sale_*`, `public.appointments`
- `useAISettings` usa `public.ai_settings` e `public.ai_stage_config`
- `useUserWhatsAppInstances` usa `public.whatsapp_instances`

Se voce reaproveitar esses dados diretamente para a SolarZap interna, vai misturar:
- oportunidades internas da SolarZap;
- operacao dos clientes que usam o software;
- billing do seu SaaS;
- conversas dos seus clientes;
- automacoes do seu produto.

Isso e exatamente o tipo de mistura que quebra produto em silencio.

### 4. Ja existe um bom gancho para provisionar clientes apos venda

Hoje o admin ja consegue:
- criar usuario + organizacao;
- aplicar plano inicial;
- iniciar trial.

Evidencias:
- `src/components/admin/CreateOrgDialog.tsx`
- `supabase/functions/admin-api/index.ts`

Isto e importante porque o CRM interno nao precisa inventar provisionamento do zero. Ele precisa apenas chamar esse fluxo por uma camada de orquestracao explicita quando um deal for ganho.

### 5. O catalogo atual nao cobre seu mix comercial real

Catalogo atual do produto:
- `supabase/migrations/20260307000000_billing_catalog_v2.sql`

Hoje o SaaS conhece:
- `free`
- `start`
- `pro`
- `scale`
- add-ons tecnicos

Mas o CRM interno precisa vender tambem:
- Mentoria Aceleracao SolarZap 1: R$1997
- Mentoria Aceleracao SolarZap 2: R$1497
- Mentoria Aceleracao SolarZap 3: R$997
- SolarZap Scale: R$369/mes
- SolarZap Pro: R$299/mes
- SolarZap Start: R$199/mes
- Desenvolvimento de Landing Page Premium: R$997
- Desenvolvimento de Landing Page Start: R$497

Conclusao:
- o CRM interno precisa de catalogo proprio;
- nao deve usar `_admin_subscription_plans` como catalogo comercial interno.

## Decisoes nao negociaveis

1. Criar um schema novo: `internal_crm`
- nada de gravar CRM interno em `public.leads`, `public.interacoes`, `public.deals`, `public.broadcast_campaigns`, `public.ai_settings` ou `public.whatsapp_instances`.

2. Manter o Admin Panel atual vivo
- o que hoje existe em `/admin/orgs`, `/admin/financeiro`, `/admin/flags`, `/admin/audit` continua funcionando;
- o CRM entra como uma nova camada dentro do admin, nao como substituicao destrutiva.

3. Reaproveitar UI, nao tabelas
- podemos copiar/adaptar componentes e layouts;
- nao podemos compartilhar o dominio persistido.

4. Criar um anti-corruption layer entre CRM interno e app publico
- o CRM interno so toca o dominio publico em acoes explicitas:
  - provisionar cliente;
  - atualizar snapshot de status do cliente no app;
  - eventualmente consultar billing real do tenant ja criado.

5. Para acelerar e proteger o produto, copiar primeiro e abstrair depois
- primeiro release: duplicar modulos visuais em `src/modules/internal-crm/*`;
- depois do CRM vendavel e estavel, consolidar partes compartilhadas.

## Arquitetura alvo

### 1. Rotas

Manter:
- `/admin`
- `/admin/orgs`
- `/admin/financeiro`
- `/admin/flags`
- `/admin/audit`

Adicionar:
- `/admin/crm`
- `/admin/crm/dashboard`
- `/admin/crm/pipeline`
- `/admin/crm/inbox`
- `/admin/crm/clients`
- `/admin/crm/campaigns`
- `/admin/crm/ai`
- `/admin/crm/finance`

Recomendacao de sidebar:
- CRM Dashboard
- Pipeline
- Inbox
- Clientes
- Campanhas
- IA
- Financeiro CRM
- Operacoes do Sistema

Onde `Operacoes do Sistema` agrupa o admin atual.

### 2. Organizacao de codigo

Criar:
- `src/modules/internal-crm/components/*`
- `src/modules/internal-crm/hooks/*`
- `src/modules/internal-crm/repositories/*`
- `src/modules/internal-crm/types/*`
- `src/modules/internal-crm/pages/*`

Regras:
- os componentes visuais podem nascer copiando os atuais;
- os hooks devem ser novos;
- os repositories devem usar `supabase.schema('internal_crm')`;
- nada de importar `useLeads`, `useChat`, `usePipeline`, `useBroadcasts`, `useDashboardReport`, `useAISettings` diretamente no CRM interno.

### 3. Backend

Criar funcoes novas, separadas:
- `internal-crm-api`
- `internal-crm-broadcast-worker`
- `internal-crm-agent-worker`
- `internal-crm-dashboard`
- `internal-crm-sync-public-app`

Pode reaproveitar utilitarios puros:
- normalizacao de telefone;
- formatacao de mensagens;
- regras de prompt;
- formatacao de dashboard;
- integracao com Evolution/WhatsApp quando nao houver risco de misturar tabelas.

Mas nao reaproveitar entrypoints atuais com branches perigosos.

## Modelo de dados recomendado

### Regra geral

Tudo dentro de `internal_crm`.

Nao criar FKs para tabelas de negocio do `public`.
Se for preciso guardar o vinculo com o app publico, salvar apenas IDs de referencia, sem acoplamento estrutural forte.

### 1. Controle de acesso

Tabelas:
- `internal_crm.workspaces`
- `internal_crm.workspace_members`

Uso:
- um workspace seeded: `solarzap_internal`
- membros vinculados a `auth.users`
- papeis internos:
  - `owner`
  - `sales`
  - `cs`
  - `finance`
  - `ops`
  - `read_only`

Observacao:
- no primeiro release, voce pode liberar acesso so para users que ja passam no `AdminGuard`;
- mesmo assim vale criar `workspace_members` desde o inicio para nao confundir CRM interno com system admin.

### 2. Catalogo comercial

Tabelas:
- `internal_crm.products`
- `internal_crm.product_prices`

Produtos a seedar agora:
- `mentoria_aceleracao_1` -> R$1997 -> `one_time`
- `mentoria_aceleracao_2` -> R$1497 -> `one_time`
- `mentoria_aceleracao_3` -> R$997 -> `one_time`
- `solarzap_scale` -> R$369/mes -> `recurring`
- `solarzap_pro` -> R$299/mes -> `recurring`
- `solarzap_start` -> R$199/mes -> `recurring`
- `landing_page_premium` -> R$997 -> `one_time`
- `landing_page_start` -> R$497 -> `one_time`

Campos minimos:
- `product_code`
- `name`
- `billing_type`
- `price_cents`
- `is_active`
- `sort_order`
- `metadata`

### 3. CRM core

Tabelas:
- `internal_crm.clients`
- `internal_crm.client_contacts`
- `internal_crm.pipeline_stages`
- `internal_crm.stage_history`
- `internal_crm.tasks`
- `internal_crm.appointments`

`clients` deve concentrar:
- nome da empresa
- nome do contato principal
- telefone principal
- email principal
- canal de origem
- responsavel interno
- etapa comercial atual
- status do cliente:
  - `lead`
  - `customer_onboarding`
  - `active_customer`
  - `churn_risk`
  - `churned`
- ultimo contato
- proxima acao
- notas
- `linked_public_org_id` como texto ou uuid sem FK
- `linked_public_user_id` opcional

### 4. Negociacao e receita

Tabelas:
- `internal_crm.deals`
- `internal_crm.deal_items`
- `internal_crm.orders`
- `internal_crm.subscriptions`
- `internal_crm.payment_events`

Objetivo:
- separar venda one-time de receita recorrente;
- permitir um mesmo cliente ter:
  - um plano SaaS
  - uma mentoria
  - uma landing page

Campos minimos de `deals`:
- `client_id`
- `title`
- `owner_user_id`
- `stage_code`
- `status`
- `probability`
- `expected_close_at`
- `one_time_total_cents`
- `mrr_cents`
- `notes`
- `lost_reason`

Campos minimos de `deal_items`:
- `deal_id`
- `product_code`
- `billing_type`
- `unit_price_cents`
- `quantity`
- `total_price_cents`

### 5. Inbox e WhatsApp interno

Tabelas:
- `internal_crm.whatsapp_instances`
- `internal_crm.conversations`
- `internal_crm.messages`

Campos minimos:
- instancia:
  - `instance_name`
  - `display_name`
  - `status`
  - `ai_enabled`
  - `assistant_identity_name`
  - `assistant_prompt_override`
- conversa:
  - `client_id`
  - `contact_id`
  - `assigned_to_user_id`
  - `channel`
  - `status`
  - `last_message_at`
- mensagem:
  - `conversation_id`
  - `direction`
  - `body`
  - `message_type`
  - `attachment_url`
  - `wa_message_id`
  - `remote_jid`
  - `sent_by_user_id`
  - `read_at`
  - `metadata`

### 6. Disparos

Tabelas:
- `internal_crm.broadcast_campaigns`
- `internal_crm.broadcast_recipients`

Mesma ideia do produto atual, mas separada.

Campos chave:
- nome da campanha
- instancia usada
- mensagens
- status
- contadores
- responsavel
- segmento/alvo
- `client_id` opcional no recipient

### 7. IA interna

Tabelas:
- `internal_crm.ai_settings`
- `internal_crm.ai_stage_config`
- `internal_crm.scheduled_agent_jobs`
- `internal_crm.ai_action_logs`

Objetivo:
- IA de qualificacao;
- follow-up automatico;
- assistente de disparos;
- assistente de onboarding;
- prompts por etapa do pipeline interno.

### 8. Ponte com o app publico

Tabelas:
- `internal_crm.customer_app_links`
- `internal_crm.customer_app_snapshot`

Uso:
- `customer_app_links` guarda:
  - `client_id`
  - `linked_public_org_id`
  - `linked_public_owner_user_id`
  - `provisioned_at`
  - `provisioning_status`
- `customer_app_snapshot` replica:
  - plano atual no app
  - subscription status
  - trial/grace/current period end
  - quantidade de usuarios
  - instancias WhatsApp ativas
  - leads/propostas do cliente
  - ultimo sync

Importante:
- o CRM interno consulta o snapshot, nao as tabelas publicas em tempo real;
- o sync pode rodar por cron ou trigger controlada.

### 9. Auditoria interna

Tabela:
- `internal_crm.audit_log`

Nao misturar com `_admin_audit_log`, porque:
- `_admin_audit_log` e auditoria de operacao do sistema;
- `internal_crm.audit_log` e auditoria comercial/operacional do CRM interno.

## Pipeline comercial recomendado

### Pipeline de vendas interno

Etapas seed:
- `lead_entrante`
- `contato_iniciado`
- `qualificado`
- `demo_agendada`
- `proposta_enviada`
- `negociacao`
- `aguardando_pagamento`
- `ganho`
- `perdido`

### Status de lifecycle do cliente

Campo separado do pipeline:
- `lead`
- `customer_onboarding`
- `active_customer`
- `churn_risk`
- `churned`

Motivo:
- nao vale entupir o pipeline comercial com etapas de sucesso do cliente;
- venda e lifecycle sao dimensoes diferentes.

## Dashboard interno minimo

### KPIs obrigatorios

- novos leads no periodo
- leads qualificados
- demos agendadas
- propostas enviadas
- taxa de ganho
- receita one-time fechada
- MRR vendido
- MRR ativo
- onboarding pendente
- clientes em risco de churn
- clientes churned no periodo

### Tabelas obrigatorias

- deals parados por etapa
- fila de proxima acao
- onboarding pendente
- clientes sem resposta
- clientes com pagamento pendente

### Graficos obrigatorios

- funil por etapa
- receita por produto
- MRR por plano
- origem dos leads
- performance por vendedor

## O que pode ser reaproveitado com seguranca

### Reaproveitar quase direto

- layout base do admin
- padrao de cards, tabelas, drawers e dialogs
- `PageHeader`
- componentes de conversa
- componentes visuais de pipeline
- componentes de dashboard
- componentes de campanhas
- componentes visuais de IA

### Reaproveitar so por copia/adaptacao

- `ConversationList`
- `ChatArea`
- `PipelineView`
- `ContactsView`
- `DashboardView`
- `BroadcastView`
- `AIAgentsView`

Motivo:
- esses componentes carregam hooks e contratos do dominio publico;
- para vender rapido e sem quebrar nada, vale mais copiar para `internal-crm` e trocar a camada de dados.

### Nao reaproveitar diretamente

- `useLeads`
- `useChat`
- `usePipeline`
- `useBroadcasts`
- `useDashboardReport`
- `useAISettings`
- `useUserWhatsAppInstances`
- `broadcast-worker`
- `process-agent-jobs`
- `ai-pipeline-agent`

Motivo:
- todos esses modulos estao presos ao schema publico e ao comportamento do app dos clientes.

## Plano de acao em ordem

### Fase 0 - Blindagem estrutural

Objetivo:
- garantir que o CRM interno nasce isolado antes de qualquer tela.

Entregas:
- criar schema `internal_crm`;
- criar bucket proprio:
  - `internal-crm-media`
- criar RLS propria baseada em `workspace_members`;
- criar migrations novas sem alterar tabelas do dominio atual;
- criar base de routes `/admin/crm/*`;
- manter admin atual intocado.

Aceite:
- zero escrita do CRM interno no schema `public`;
- admin atual segue funcionando igual.

### Fase 1 - Core comercial vendavel

Objetivo:
- conseguir cadastrar oportunidade, conversar, mover no pipeline e fechar.

Entregas:
- `products`
- `clients`
- `client_contacts`
- `pipeline_stages`
- `deals`
- `deal_items`
- `tasks`
- `appointments`
- telas:
  - dashboard CRM
  - pipeline
  - clientes
- CTA de criar deal e registrar proxima acao

Aceite:
- voce consegue cadastrar um lead interno, mover etapas, associar produtos e fechar um deal.

### Fase 2 - Inbox interno

Objetivo:
- operar o relacionamento comercial dentro do admin.

Entregas:
- `whatsapp_instances`
- `conversations`
- `messages`
- inbox com:
  - lista de conversas
  - chat
  - notas internas
  - atribuicao de responsavel
  - proxima acao

Aceite:
- voce consegue falar com o lead/cliente interno pelo painel e acompanhar historico.

### Fase 3 - Fechamento e provisionamento

Objetivo:
- transformar venda em cliente real do app sem operacao manual dispersa.

Entregas:
- fluxo `deal -> ganho`;
- tela de onboarding do cliente interno;
- acao explicita `Provisionar conta SolarZap`;
- chamada controlada ao fluxo existente:
  - `create_org_with_user`
- gravacao de `customer_app_links`;
- primeiro `customer_app_snapshot`.

Aceite:
- apos fechar o deal, voce provisiona a conta do cliente no app e o CRM interno passa a mostrar esse vinculo.

### Fase 4 - Disparos

Objetivo:
- disparar campanhas de prospeccao e reativacao pelo CRM interno.

Entregas:
- `broadcast_campaigns`
- `broadcast_recipients`
- worker proprio:
  - `internal-crm-broadcast-worker`
- tela de campanhas
- filtro por lista, etapa, origem e responsavel

Aceite:
- voce cria, inicia, pausa e acompanha campanhas internas sem tocar nas campanhas dos seus clientes.

### Fase 5 - IA interna

Objetivo:
- automatizar qualificacao, follow-up e onboarding.

Entregas:
- `ai_settings`
- `ai_stage_config`
- `scheduled_agent_jobs`
- `ai_action_logs`
- tela de IA no admin CRM
- agentes minimos:
  - qualificacao
  - follow-up
  - agente de disparos
  - agente de onboarding

Aceite:
- o CRM interno consegue operar follow-up e sugestoes sem afetar IA dos tenants clientes.

### Fase 6 - Financeiro CRM

Objetivo:
- acompanhar receita real da SolarZap.

Entregas:
- `orders`
- `subscriptions`
- `payment_events`
- dashboard financeiro CRM
- separacao clara:
  - receita one-time
  - MRR vendido
  - MRR ativo
  - churn

Aceite:
- o financeiro do CRM interno reflete sua operacao comercial, nao apenas orgs do SaaS.

## Recorte minimo para vender logo

Se o foco for velocidade maxima com risco baixo, o primeiro corte comercial deve ser:

1. `Fase 0`
2. `Fase 1`
3. `Fase 2`
4. `Fase 3`

Com isso voce ja tem:
- CRM interno;
- pipeline;
- inbox;
- clientes;
- produtos;
- fechamento;
- provisionamento no SolarZap.

Depois entram:
- disparos
- IA
- financeiro CRM mais completo

Se voce quiser manter a visao completa desde o inicio, eu recomendo no maximo encaixar:
- disparos logo apos inbox;
- IA logo apos disparos;
- nao antes de o provisionamento estar fechado.

## Sequencia recomendada de implementacao no frontend

Para acelerar e reduzir risco:

1. Duplicar layout e views principais para `src/modules/internal-crm`
2. Trocar hooks por hooks novos
3. So depois extrair componentes realmente compartilhaveis

Ordem:
- dashboard CRM
- clients/pipeline
- inbox
- onboarding/provisionamento
- campaigns
- IA

Nao recomendo:
- fazer uma mega-refatoracao do SolarZap publico antes do CRM existir;
- tentar genericizar todos os hooks agora.

## Regras de seguranca para nao quebrar o atual

1. Nenhuma migration do CRM interno pode alterar:
- `public.leads`
- `public.interacoes`
- `public.deals`
- `public.propostas`
- `public.broadcast_campaigns`
- `public.ai_settings`
- `public.ai_stage_config`
- `public.whatsapp_instances`

2. Nenhuma tela `/admin/crm/*` pode usar hooks atuais do produto em modo write.

3. Buckets separados.

4. Workers separados e nomes de cron separados.

5. Auditoria separada.

6. Bridge para o app publico apenas por service layer explicita.

7. Snapshot de dados do app publico no CRM interno; nada de query ad hoc no runtime das telas.

## Blueprint final recomendado

Resumo do desenho:

- manter o admin atual como camada de operacao do sistema;
- criar um `CRM interno` dentro do admin;
- usar o visual e os fluxos do SolarZap principal como base;
- criar um schema novo `internal_crm`;
- recriar nesse schema apenas o que o CRM interno precisa;
- provisionar clientes do app por uma ponte controlada;
- nunca compartilhar as tabelas operacionais do produto atual.

Em uma frase:

`shared presentation, isolated persistence, explicit bridge`

Esse e o desenho mais rapido para colocar o CRM interno no ar sem contaminar o banco do produto nem quebrar o que ja esta vendavel hoje.
