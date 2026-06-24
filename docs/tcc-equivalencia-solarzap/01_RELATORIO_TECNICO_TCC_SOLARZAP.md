# Relatorio Tecnico de Desenvolvimento de Software

## Capa

**Nome do aluno:** Rodrigo [PREENCHER SOBRENOME]  
**RA:** [PREENCHER]  
**Curso:** [PREENCHER]  
**Polo:** [PREENCHER]  
**Instituicao:** UNIVESP  
**Titulo:** Desenvolvimento de uma plataforma CRM com automacoes para gestao comercial no setor de energia solar  
**Sistema analisado:** SolarZap  
**Repositorio:** SolarZap Conversa  
**Periodo de desenvolvimento:** [PREENCHER OU CONFIRMAR]  
**Data:** [PREENCHER]

## Resumo

Este relatorio tecnico apresenta o sistema SolarZap, uma plataforma web de CRM voltada a gestao comercial no setor de energia solar. A analise foi realizada a partir do codigo-fonte do repositorio, contemplando arquitetura, tecnologias, modelagem de dados, fluxos de negocio, automacoes, integracoes externas, controle de acesso, testes e evidencias necessarias para solicitacao de equivalencia/convalidacao de Trabalho de Conclusao de Curso.

O sistema implementa uma aplicacao React/TypeScript com backend baseado em Supabase, incluindo autenticacao, banco de dados PostgreSQL, Row Level Security, Edge Functions, storage, jobs agendados e integracoes com servicos externos. Entre as funcionalidades identificadas estao: gestao de leads e contatos, conversas por canais digitais, funil comercial/pipeline, calendario, tarefas, propostas comerciais em PDF, automacoes por etapa, base de conhecimento para IA, rastreamento de conversoes, integracoes com WhatsApp/Evolution API, Google, Meta, Stripe, Resend e servicos de geocodificacao/irradiancia solar. Tambem foram identificados modulos administrativos, billing, feature flags, CRM interno e modulo de contratos.

A documentacao demonstra que o SolarZap possui escopo, complexidade tecnica e aderencia pratica compativeis com um projeto aplicado de Computacao/Ciencia de Dados, especialmente por envolver desenvolvimento de software, modelagem relacional, automacao de processos comerciais, integracao de dados, regras de negocio e evidencias tecnicas verificaveis no repositorio.

## Palavras-chave

CRM; energia solar; automacao comercial; desenvolvimento web; Supabase; React; TypeScript; PostgreSQL; integracao de dados; ciencia de dados aplicada.

## Introducao

O setor de energia solar demanda processos comerciais com alto volume de contatos, qualificacao de leads, follow-up recorrente, agendamento de reunioes e visitas, elaboracao de propostas tecnicas e acompanhamento de oportunidades ate a conclusao do projeto. Nesse contexto, o SolarZap foi desenvolvido como uma plataforma web para centralizar comunicacao, organizacao de funil comercial, automacoes, propostas e acompanhamento de indicadores.

O repositorio analisado contem uma aplicacao front-end em React/TypeScript, com rotas protegidas, componentes modulares, hooks de dominio e integracao com Supabase. A camada de dados e backend utiliza migrations SQL, funcoes RPC, Edge Functions e politicas de seguranca. A estrutura observada indica um sistema em evolucao, com multiplos modulos funcionais e preocupacoes de produto, como multiempresa, planos de assinatura, feature flags, painel administrativo e observabilidade operacional.

Este documento foi produzido com base em inspecao tecnica do codigo, sem execucao de comandos destrutivos e sem exposicao de valores sensiveis. Valores de credenciais, tokens, chaves, variaveis de ambiente e segredos foram omitidos deliberadamente.

## Contextualizacao do problema

Empresas e consultores de energia solar precisam gerir relacionamentos com potenciais clientes desde o primeiro contato ate a assinatura de contrato e instalacao. Em muitos casos, o processo envolve canais dispersos, como WhatsApp, formularios, anuncios, chamadas, visitas tecnicas, planilhas e ferramentas financeiras. Essa fragmentacao dificulta a continuidade do atendimento, o acompanhamento de etapas, a mensuracao de resultados e a padronizacao da comunicacao.

O SolarZap responde a esse problema por meio de uma plataforma unica para atendimento e gestao comercial. O sistema organiza leads por etapas de pipeline, registra interacoes, agenda compromissos, gera propostas, aciona automacoes, calcula dados associados a projetos solares e integra sinais de marketing e atendimento.

## Justificativa

A relevancia do projeto esta na aplicacao de conceitos de Computacao e Ciencia de Dados a um problema real de negocio. O repositorio evidencia:

| Dimensao | Evidencia tecnica identificada |
|---|---|
| Desenvolvimento web | Aplicacao React/Vite/TypeScript em `src/App.tsx`, `src/pages/Index.tsx` e componentes em `src/components/solarzap/`. |
| Modelagem de dados | Migrations SQL em `supabase/migrations/`, com entidades de organizacoes, membros, leads, propostas, agendamentos, tracking, billing, CRM interno e contratos. |
| Integracao de dados | Edge Functions em `supabase/functions/`, incluindo WhatsApp, Google, Meta, Stripe, tracking, propostas e IA. |
| Automacao | Persistencia de automacoes em `supabase/migrations/20260312101000_automation_settings_persistence.sql` e regras internas em `supabase/migrations/20260329181000_internal_crm_arkan_blueprint.sql`. |
| Seguranca | Supabase Auth, RLS, roles de organizacao, `ProtectedRoute` e `AdminGuard`. |
| Validacao tecnica | Testes unitarios, golden tests e Playwright em `tests/`, `vitest.config.ts` e `playwright.config.ts`. |

O projeto tambem demonstra capacidade de traducao de requisitos de negocio em componentes, rotas, hooks, tabelas, fluxos de dados, regras de automacao e integracoes externas.

## Objetivo geral

Desenvolver uma plataforma web de CRM com automacoes para gestao comercial de empresas do setor de energia solar, centralizando leads, conversas, pipeline, propostas, integracoes, indicadores e regras de atendimento.

## Objetivos especificos

- Implementar autenticacao, selecao de organizacao e controle de acesso por papeis.
- Permitir cadastro, importacao, listagem, edicao e acompanhamento de leads/contatos.
- Organizar oportunidades em pipeline comercial com etapas especificas do ciclo de venda solar.
- Registrar interacoes e conversas associadas a leads.
- Integrar canais e provedores externos, especialmente WhatsApp, Google, Meta e servicos auxiliares.
- Disponibilizar calendario, tarefas e agendamentos comerciais.
- Gerar propostas tecnicas/comerciais em PDF, com dados de dimensionamento e informacoes financeiras.
- Persistir automacoes comerciais e mensagens padronizadas por etapa.
- Registrar dados de tracking e conversoes para analise de origem de leads.
- Fornecer modulo administrativo, billing e feature flags para operacao do produto.
- Disponibilizar testes e evidencias tecnicas para validacao do sistema.

## Escopo do sistema

O SolarZap abrange um conjunto amplo de funcionalidades de CRM e automacao comercial. O escopo implementado ou evidenciado pelo codigo inclui:

- Aplicacao web SPA com rotas publicas e protegidas, definida em `src/App.tsx`.
- Area autenticada principal em `src/pages/Index.tsx`, renderizando `SolarZapLayout`.
- Modulos de conversas, pipeline, calendario, contatos, disparos, propostas, dashboard, integracoes, tracking, automacoes, banco de IA, agentes de IA, equipe, conta e plano, conforme `src/types/solarzap.ts` e `src/components/solarzap/mobileNavConfig.ts`.
- Multiempresa/multiorganizacao com `organizations` e `organization_members`, conforme migrations `20260218_m1_organizations_foundation.sql` e politicas posteriores de RLS.
- Controle de acesso por papeis e status da organizacao em `src/contexts/AuthContext.tsx` e `src/components/ProtectedRoute.tsx`.
- CRM interno administrativo com rotas em `src/pages/Admin.tsx` e tipos em `src/modules/internal-crm/types/index.ts`.
- Modulo de contratos em `src/modules/contracts/`.
- Backend serverless em Supabase Edge Functions e banco PostgreSQL via migrations.

Itens que exigem validacao manual: data exata de desenvolvimento, ambiente de producao ativo, escopo efetivamente utilizado por clientes e evidencias visuais de execucao.

## Metodologia de desenvolvimento

A metodologia inferida pelo repositorio e compativel com desenvolvimento incremental e orientado a produto. O sistema apresenta evolucao por migrations datadas, organizacao em modulos, testes automatizados e separacao entre camada de apresentacao, hooks de dominio, servicos e funcoes backend.

Elementos metodologicos identificados:

- **Prototipacao e evolucao incremental:** o `README.md` indica origem/edicao via Lovable e execucao local por Vite.
- **Arquitetura modular:** componentes em `src/components/solarzap/`, hooks de dominio em `src/hooks/domain/`, modulos especificos em `src/modules/`.
- **Controle de schema por migrations:** arquivos em `supabase/migrations/` registram evolucao do banco e funcoes.
- **Validacao automatizada:** testes unitarios/golden em `tests/unit` e `tests/golden`; testes E2E em `tests/e2e`.
- **Deploy conteinerizado:** `Dockerfile`, `docker-compose.vps.yml` e `Caddyfile`.
- **Seguranca por camadas:** autenticacao Supabase, RLS no banco, guards de rota, roles de organizacao, MFA em admin e cabecalhos HTTP no Caddy.

## Levantamento de requisitos

Os requisitos foram inferidos a partir de rotas, componentes, hooks, tipos, migrations e funcoes de backend. A documentacao detalhada esta no arquivo `03_REQUISITOS_E_CASOS_DE_USO.md`.

### Requisitos funcionais

| Codigo | Requisito | Evidencia no repositorio |
|---|---|---|
| RF01 | Autenticar usuarios e manter sessao. | `src/contexts/AuthContext.tsx`, `src/pages/Login.tsx`, `src/App.tsx`. |
| RF02 | Selecionar e operar dentro de uma organizacao. | `organizations`, `organization_members`, `src/pages/SelectOrganization.tsx`. |
| RF03 | Controlar acesso por papeis. | `ProtectedRoute`, `AdminGuard`, `useSellerPermissions`, RLS em migrations. |
| RF04 | Gerenciar leads/contatos. | `src/hooks/domain/useLeads.ts`, `src/types/solarzap.ts`, `ContactsView`. |
| RF05 | Organizar leads em pipeline comercial. | `src/hooks/domain/usePipeline.ts`, `PipelineView`, `PipelineStage`. |
| RF06 | Registrar conversas e interacoes. | `src/hooks/domain/useChat.ts`, tabela inferida `interacoes`, funcoes Evolution/WhatsApp. |
| RF07 | Enviar e receber mensagens via WhatsApp/integracoes. | `supabase/functions/evolution-api`, `evolution-webhook`, `whatsapp-connect`, `useIntegrations.ts`. |
| RF08 | Criar agendamentos, tarefas e calendario. | `20260128000001_calendar_module.sql`, `useAppointments`, `LeadTasks`, `CalendarView`. |
| RF09 | Criar propostas comerciais e PDF. | `useProposalForm.ts`, `proposal_*` migrations, `src/utils/solarSizing.ts`, `generateProposalPDF`. |
| RF10 | Configurar automacoes comerciais. | `AutomationContext.tsx`, `AutomationsView.tsx`, `automation_settings`. |
| RF11 | Gerenciar tracking e conversoes. | `TrackingView`, `useTrackingData.ts`, `tracking_v3_schema.sql`, `conversion-dispatcher`. |
| RF12 | Gerenciar integracoes externas. | `IntegrationsView`, `useIntegrations.ts`, Edge Functions Google/Meta/WhatsApp. |
| RF13 | Gerenciar plano, billing e assinatura. | `useOrgBilling`, migrations `billing_*`, Edge Functions Stripe. |
| RF14 | Administrar organizacoes, planos e feature flags. | `src/pages/Admin.tsx`, `useAdminApi.ts`, `admin-api`, migrations admin. |
| RF15 | Operar CRM interno e modulo de contratos. | `src/modules/internal-crm/`, `src/modules/contracts/`, migrations `internal_crm_*` e `contract_*`. |

### Requisitos nao funcionais

| Codigo | Requisito | Evidencia no repositorio |
|---|---|---|
| RNF01 | Aplicacao web responsiva e modular. | React, Tailwind, shadcn/Radix, componentes em `src/components/`. |
| RNF02 | Tipagem estatica. | TypeScript, `tsconfig`, interfaces em `src/types/`. |
| RNF03 | Controle de acesso e isolamento por organizacao. | Supabase Auth, RLS, `org_id`, `ProtectedRoute`, migrations RLS. |
| RNF04 | Manutenibilidade por migrations e funcoes versionadas. | `supabase/migrations/`, `supabase/functions/`. |
| RNF05 | Observabilidade operacional minima. | Logs/eventos, audit log admin, notificacoes, `runtime_alerts`, testes. |
| RNF06 | Deploy reproducivel. | `Dockerfile`, `docker-compose.vps.yml`, `Caddyfile`. |
| RNF07 | Testabilidade. | Vitest, Playwright, golden tests. |
| RNF08 | Protecao de dados sensiveis. | Uso de variaveis de ambiente, Supabase Vault em tracking, RLS e omissao de valores nesta documentacao. |

## Arquitetura da solucao

A arquitetura e composta por uma SPA React/TypeScript, um backend Supabase e integracoes externas por Edge Functions. O front-end se comunica com o Supabase Client (`src/lib/supabase.ts`) e invoca funcoes serverless para operacoes que dependem de terceiros, segredos ou processamento backend.

Camadas principais:

| Camada | Responsabilidade | Evidencia |
|---|---|---|
| Interface web | Telas, rotas, formularios, dashboards e navegacao. | `src/App.tsx`, `src/pages/`, `src/components/solarzap/`. |
| Estado e dominio | Hooks para leads, pipeline, chat, automacoes, billing, integracoes. | `src/hooks/`, `src/hooks/domain/`. |
| Autenticacao/autorizacao | Sessao, org atual, roles, acesso admin. | `AuthContext.tsx`, `ProtectedRoute.tsx`, `AdminGuard.tsx`. |
| Dados | PostgreSQL/Supabase com migrations, RLS e RPCs. | `supabase/migrations/`. |
| Backend serverless | Integracoes, webhooks, propostas, tracking, IA, billing. | `supabase/functions/`. |
| Infra/deploy | Build web, Caddy e Docker. | `Dockerfile`, `docker-compose.vps.yml`, `Caddyfile`. |

## Tecnologias utilizadas

| Categoria | Tecnologia identificada | Evidencia |
|---|---|---|
| Linguagem | TypeScript | `package.json`, arquivos `.ts` e `.tsx`. |
| Front-end | React 18, Vite | `package.json`, `vite.config.ts`, `src/App.tsx`. |
| UI | Tailwind CSS, shadcn/Radix UI, lucide-react | `package.json`, `tailwind.config.ts`, componentes em `src/components/ui`. |
| Estado/dados | TanStack Query, React Context | `QueryClientProvider`, `AuthProvider`, `AutomationProvider`. |
| Backend/BaaS | Supabase Auth, Postgres, Storage, Edge Functions | `src/lib/supabase.ts`, `supabase/`. |
| Validacao | Zod, React Hook Form | `package.json`, modulo de contratos/propostas. |
| PDFs/arquivos | jsPDF, xlsx | `package.json`, geracao de propostas. |
| Graficos | Recharts | `package.json`, dashboards. |
| Testes | Vitest, Testing Library, Playwright | `vitest.config.ts`, `playwright.config.ts`, `tests/`. |
| Deploy | Docker, Caddy | `Dockerfile`, `docker-compose.vps.yml`, `Caddyfile`. |
| Pagamentos | Stripe | Edge Functions `stripe-*`, hooks de billing. |
| Mensageria | WhatsApp/Evolution API | `evolution-api`, `evolution-webhook`, `whatsapp-connect`. |
| Marketing/conversoes | Google, Meta, GA4 | `google-*`, `meta-*`, tracking/conversion functions. |
| IA | OpenAI/LLM por Edge Functions | `ai-*`, `proposal-copy-generator`, `proposal-composer`, `kb-ingest`. |

## Estrutura do projeto/repositório

| Caminho | Conteudo |
|---|---|
| `src/App.tsx` | Definicao das rotas, providers globais e lazy loading das paginas. |
| `src/pages/` | Paginas principais: login, index, admin, billing, pricing, onboarding, contratos embed. |
| `src/components/solarzap/` | Componentes de CRM: layout, conversas, pipeline, calendario, contatos, propostas, automacoes, integracoes, dashboard. |
| `src/hooks/` | Hooks de dados e integracoes, incluindo billing, propostas, automacoes, notificacoes e tracking. |
| `src/hooks/domain/` | Hooks de dominio para leads, pipeline e chat. |
| `src/contexts/` | Contextos de autenticacao, automacoes, integracoes e tema. |
| `src/modules/internal-crm/` | CRM interno administrativo, produtos, pipeline, inbox, campanhas, automacoes, financeiro e tipos. |
| `src/modules/contracts/` | Modulo de contratos, schemas, persistencia, renderizacao e fluxo de estados. |
| `src/utils/` | Funcoes auxiliares, calculos solares, modelo financeiro, proposta PDF. |
| `supabase/migrations/` | Historico de schema, tabelas, RLS, RPCs, crons e seeds. |
| `supabase/functions/` | Edge Functions para integracoes, webhooks, IA, propostas, billing, tracking e admin. |
| `tests/` | Testes unitarios, golden tests e E2E. |
| `Dockerfile`, `docker-compose.vps.yml`, `Caddyfile` | Deploy e configuracao de servidor web. |

## Modelagem de dados

A modelagem usa PostgreSQL/Supabase com tabelas publicas e schema `internal_crm`. O padrao dominante e o isolamento por `org_id`, associado a politicas RLS e relacionamento com `organization_members`.

Algumas tabelas centrais, como `leads`, `interacoes`, `propostas` e `whatsapp_instances`, aparecem fortemente referenciadas em tipos, hooks e funcoes. A migration inicial exata de algumas delas nao foi localizada de forma conclusiva na inspecao atual, portanto sua criacao historica deve ser marcada como **pendente de confirmacao** caso seja necessario anexar DDL completo. Ainda assim, sua existencia funcional e comprovada por uso consistente em `src/lib/supabase.ts`, `src/hooks/domain/useLeads.ts`, `src/hooks/domain/useChat.ts` e `src/hooks/domain/usePipeline.ts`.

### Principais entidades/tabelas/modelos encontrados

| Entidade | Finalidade | Evidencia |
|---|---|---|
| `organizations` | Cadastro de empresas/organizacoes. | `20260218_m1_organizations_foundation.sql`, `AuthContext.tsx`. |
| `organization_members` | Associacao usuario-organizacao e papeis. | `20260218_m1_organizations_foundation.sql`, `AuthContext.tsx`. |
| `leads` | Leads/contatos do CRM, pipeline e dados comerciais. | `src/lib/supabase.ts`, `src/types/solarzap.ts`, `useLeads.ts`. |
| `interacoes` | Historico de mensagens/interacoes por lead. | `src/lib/supabase.ts`, `useChat.ts`. |
| `appointments` | Agenda, visitas, reunioes e eventos comerciais. | `20260128000001_calendar_module.sql`, `usePipeline.ts`. |
| `lead_tasks` | Tarefas associadas a leads. | `20260212_lead_tasks.sql`, `20260212170200_lead_tasks.sql`. |
| `propostas` | Propostas comerciais vinculadas a leads. | `src/lib/supabase.ts`, `usePipeline.ts`. |
| `proposal_versions` | Versoes de propostas e dados snapshot. | `20260212170100_proposal_premium_foundation.sql`. |
| `proposal_sections` | Secoes configuraveis da proposta. | `20260212170400_proposal_sections.sql`. |
| `proposal_delivery_events` | Eventos de envio/entrega/abertura de propostas. | `20260212170100_proposal_premium_foundation.sql`. |
| `automation_settings` | Configuracoes de automacao por organizacao. | `20260312101000_automation_settings_persistence.sql`, `AutomationContext.tsx`. |
| `company_profile`, `kb_items`, `knowledge_base_*` | Base de conhecimento e contexto de IA. | Migrations `knowledge_base_*`, `kb-ingest`. |
| `ai_settings`, `ai_action_logs`, `scheduled_agent_jobs` | Configuracoes e execucao de IA/agentes. | `20260205000001_ai_system_schema.sql`, `20260310100000_pipeline_agents_jobs.sql`. |
| `user_integrations` | Status de integracoes Google/Meta. | `useIntegrations.ts`, funcoes OAuth. |
| `whatsapp_instances` | Instancias de WhatsApp por usuario/organizacao. | `useIntegrations.ts`, `whatsapp-connect`, `evolution-webhook`. |
| `broadcast_campaigns`, `broadcast_recipients` | Campanhas de disparos. | `20260304153000_broadcast_campaigns_and_recipients.sql`. |
| `org_tracking_settings`, `ad_platform_credentials`, `lead_attribution`, `conversion_events`, `conversion_deliveries` | Tracking e conversoes. | `20260304170000_tracking_v3_schema.sql`, `useTrackingData.ts`. |
| `subscription_plans`, billing/metrica de uso | Planos, assinatura e limites. | `20260306000000_subscription_plans.sql`, `20260307100000_billing_data_model.sql`. |
| `internal_crm.clients`, `internal_crm.deals`, `internal_crm.tasks`, `internal_crm.appointments` | CRM interno administrativo. | `20260328000100_internal_crm_schema_base.sql`. |
| `contract_drafts`, `contract_events`, `contract_artifacts` | Modulo de contratos. | `20260416000100_contract_module_foundation.sql`. |

## Fluxos principais do sistema

### Fluxo de autenticacao e organizacao

1. Usuario acessa `/login`, `/select-organization` ou rota protegida.
2. `AuthProvider` em `src/contexts/AuthContext.tsx` recupera sessao Supabase.
3. O contexto consulta `organization_members`, `company_profile` e status da organizacao por RPC.
4. `ProtectedRoute` valida autenticacao, organizacao ativa, onboarding e billing.
5. O usuario acessa `SolarZapLayout` ou e redirecionado para onboarding, billing ou selecao de organizacao.

### Fluxo de lead e atendimento

1. Lead e cadastrado/importado por interface, API, webhook ou integracao.
2. `useLeads.ts` consulta leads por `org_id`, aplica escopo de usuario/equipe e assina realtime.
3. Conversas sao lidas e enviadas por `useChat.ts`, com persistencia em `interacoes`.
4. Integracoes WhatsApp sao operadas por `evolution-api`, `evolution-webhook` e `whatsapp-connect`.

### Fluxo de pipeline comercial

1. Lead possui `status_pipeline`, tipado em `PipelineStage` em `src/types/solarzap.ts`.
2. Movimentacoes de etapa sao realizadas por `usePipeline.ts` e componentes de pipeline.
3. Mudancas podem atualizar deals, propostas, eventos e automacoes.
4. Etapas como `aguardando_proposta`, `proposta_pronta`, `contrato_assinado`, `projeto_pago` e `projeto_instalado` representam o ciclo de vendas solar.

### Fluxo de propostas

1. Usuario preenche dados tecnicos/comerciais no modulo de propostas.
2. Calculos solares usam `src/utils/solarSizing.ts` e modelo financeiro em `src/utils/proposalFinancialModel.ts`.
3. Dados externos de irradiancia/geocodificacao podem ser buscados por `useSolarResource.ts` e Edge Function `solar-resource`.
4. Versoes e secoes sao persistidas em `proposal_versions` e `proposal_sections`.
5. PDF e compartilhamento usam funcoes e utilitarios como `proposal-composer`, `proposal-share`, `proposal-storage-intent` e geracao PDF.

### Fluxo de tracking e conversoes

1. Configuracoes sao administradas em `TrackingView`/`useTrackingData.ts`.
2. Eventos de origem chegam por `attribution-webhook`.
3. `conversion_events` e `conversion_deliveries` registram eventos e tentativas de envio.
4. `conversion-dispatcher` processa entregas para Meta CAPI, Google Ads e GA4.

### Fluxo administrativo e CRM interno

1. Rotas `/admin/*` sao protegidas por `AdminGuard`.
2. `useAdminApi.ts` invoca `admin-api` para organizacoes, feature flags, auditoria e financeiro.
3. `src/modules/internal-crm/` implementa CRM interno com clientes, deals, inbox, campanhas, automacoes, calendario e financeiro.

## Telas e funcionalidades principais

| Tela/modulo | Funcionalidade | Evidencia |
|---|---|---|
| Login | Autenticacao e recuperacao de senha. | `/login` em `src/App.tsx`, `src/pages/Login.tsx`. |
| Dashboard | Indicadores e relatorios comerciais. | `DashboardView`, `reports-dashboard`, `useDashboardReport`. |
| Conversas | Atendimento por mensagens e midias. | `ChatView`, `useChat.ts`, `evolution-api`. |
| Pipeline | Funil comercial por etapas. | `PipelineView`, `usePipeline.ts`, `PipelineStage`. |
| Contatos | Listagem e gestao de leads. | `ContactsView`, `useLeads.ts`. |
| Calendario | Agendamentos, visitas e reunioes. | `CalendarView`, `appointments` migration. |
| Propostas | Criacao, versao, PDF e compartilhamento. | `ProposalsView`, `useProposalForm.ts`, `proposal_*`. |
| Automacoes | Regras e mensagens por etapa. | `AutomationsView.tsx`, `AutomationContext.tsx`. |
| Integracoes | Google, Meta, WhatsApp e instancias. | `IntegrationsView`, `useIntegrations.ts`. |
| Tracking | Credenciais, webhooks e conversoes. | `TrackingView`, `useTrackingData.ts`, `tracking_v3_schema.sql`. |
| Banco de IA/Agentes | Conhecimento, configuracoes e jobs de IA. | Migrations `knowledge_base_*`, `ai_*`, `AIAgentsView`. |
| Admin | Organizacoes, flags, financeiro e auditoria. | `src/pages/Admin.tsx`, `useAdminApi.ts`. |
| CRM interno | Pipeline interno, clientes, campanhas e financeiro. | `src/modules/internal-crm/`. |
| Contratos | Minutas, artefatos, eventos e embed. | `src/modules/contracts/`, migrations `contract_*`. |

## Automacoes e regras de negocio

As automacoes estao presentes em tres camadas principais:

1. **Automacoes configuraveis do CRM principal:** `src/contexts/AutomationContext.tsx` define configuracoes como habilitar arrastar/soltar no pipeline, evitar retrocessos automaticos, mensagens padronizadas e gatilhos por etapa. A persistencia ocorre em `public.automation_settings`, criada por `20260312101000_automation_settings_persistence.sql`.
2. **Automacoes de pipeline e propostas:** `src/hooks/domain/usePipeline.ts` executa a troca de etapas, sincroniza informacoes comerciais e cria/atualiza registros de proposta conforme mudancas do funil.
3. **Automacoes backend/CRM interno:** migrations como `20260329181000_internal_crm_arkan_blueprint.sql` e `20260331120200_internal_crm_automation_cron.sql` evidenciam regras, filas de execucao e agendamento por cron para processar automacoes internas.

Tambem foram identificados jobs de IA e follow-up em `scheduled_agent_jobs`, `process-agent-jobs`, `ai-pipeline-agent`, `ai-reporter` e `ai-digest-worker`.

## Integracoes identificadas

| Integracao | Finalidade | Evidencia |
|---|---|---|
| Supabase | Auth, banco, storage, RLS e Edge Functions. | `src/lib/supabase.ts`, `supabase/`. |
| WhatsApp/Evolution API | Conexao, envio, webhook e instancias. | `evolution-api`, `evolution-webhook`, `whatsapp-connect`, `useChat.ts`. |
| Google OAuth/Calendar/Ads/GA4 | Login/autorizacao, calendario, Ads e conversoes. | `google-oauth`, `google-callback`, `google-ads-oauth`, `google-ads-callback`, `useTrackingData.ts`. |
| Meta | OAuth, Messenger/Instagram, webhooks e CAPI. | `meta-oauth`, `meta-callback`, `meta-webhook`, `conversion-dispatcher`. |
| Stripe | Checkout, portal, webhook e planos. | `stripe-checkout`, `stripe-pack-checkout`, `stripe-portal`, `stripe-webhook`. |
| Resend | Envio de notificacoes/e-mails. | `notification-worker`, migrations de notificacao. |
| OpenAI/LLM | IA, digest, propostas e base de conhecimento. | `ai-*`, `proposal-copy-generator`, `proposal-composer`, `kb-ingest`. |
| PVGIS/geocoding | Irradiancia e dados solares. | `solar-resource`, `useSolarResource.ts`. |
| Caddy/Docker | Deploy web e seguranca HTTP. | `Caddyfile`, `Dockerfile`. |

## Seguranca, autenticacao e controle de acesso

O sistema possui evidencias de seguranca em diferentes niveis:

- **Autenticacao Supabase:** uso de `supabase.auth` em `AuthContext.tsx`.
- **Multiorganizacao:** resolucao de organizacao atual e papeis por `organization_members`.
- **Papeis organizacionais:** `owner`, `admin`, `user` e `consultant` em `AuthContext.tsx`.
- **Protecao de rotas:** `ProtectedRoute.tsx` valida autenticacao, organizacao, onboarding e billing.
- **Admin com MFA:** `AdminGuard.tsx` valida acesso administrativo e fluxo MFA.
- **RLS:** varias migrations aplicam politicas por `org_id`, inclusive `20260218000003_m4_lead_visibility.sql` e `20260328000300_internal_crm_rls.sql`.
- **Segredos fora da documentacao:** foram identificados nomes de variaveis e credenciais de ambiente no repositorio, mas seus valores nao foram reproduzidos neste dossie.
- **Vault/credenciais protegidas:** tracking usa campos de vault em `20260304170000_tracking_v3_schema.sql`.
- **Cabecalhos HTTP:** `Caddyfile` define HTTPS, HSTS, CSP, X-Content-Type-Options e politicas de frame.

Ponto pendente: antes do protocolo, revisar todo material anexado para garantir que nenhum `.env`, token, chave, print de segredo, URL privada com credencial ou valor sensivel seja incluido.

## Testes, validacao e evidencias de funcionamento

O repositorio contem estrutura de testes automatizados:

- `vitest.config.ts` configura testes unitarios e golden tests.
- `tests/unit/` cobre modulos como admin, auth, automacoes, dashboard, Evolution API, feature flags, financeiro, importacao, internal CRM, notificacoes, pipeline agent, propostas, solar sizing e tracking.
- `tests/golden/` inclui validacoes de proposta PDF e modulo de contratos.
- `playwright.config.ts` configura E2E em `tests/e2e/`, com servidor Vite local, screenshots, videos e traces em falha.

Nesta preparacao documental nao foram executados testes automatizados. Para anexos academicos, recomenda-se gerar evidencias adicionais:

- print do terminal com `npm run test`, se executado com sucesso;
- print ou relatorio de `npm run typecheck`, se executado com sucesso;
- prints das principais telas do sistema em ambiente local ou producao;
- captura do historico de commits, omitindo dados sensiveis.

## Resultados obtidos

A partir da inspecao do repositorio, conclui-se que o SolarZap possui um produto web de complexidade significativa, composto por:

- CRM comercial com pipeline especifico para energia solar.
- Gestao de contatos/leads e conversas digitais.
- Automacoes por etapa e jobs de follow-up.
- Modulo de propostas com calculos solares e financeiros.
- Integrações com canais de atendimento, marketing, pagamentos e IA.
- Modelagem relacional extensa com RLS e controle multiorganizacao.
- Modulos administrativos, billing, contratos, CRM interno e feature flags.
- Estrutura de testes e deploy.

Esses elementos demonstram desenvolvimento aplicado, articulando engenharia de software, banco de dados, automacao de processos, integracao de APIs e analise operacional.

## Limitacoes

- Dados pessoais academicos do aluno estao pendentes de preenchimento.
- Data exata de inicio/fim do desenvolvimento esta pendente de confirmacao.
- Ambiente de producao, dominio e status de deploy devem ser comprovados manualmente.
- Prints das telas ainda precisam ser gerados.
- Alguns schemas/tabelas historicas do CRM principal sao evidenciados por uso no codigo, mas a migration inicial exata nao foi localizada conclusivamente nesta inspecao.
- Testes nao foram executados durante a elaboracao deste dossie.
- Integracoes externas aparecem implementadas no codigo, mas a configuracao ativa em ambiente real deve ser confirmada.
- Antes do envio, e obrigatoria revisao de confidencialidade para evitar inclusao de secrets, dados de clientes, tokens ou informacoes comerciais sensiveis.

## Trabalhos futuros

- Anexar evidencias visuais completas das telas principais.
- Executar e registrar resultados dos testes automatizados.
- Produzir PDF final com sumario, anexos e prints.
- Inserir linha do tempo do desenvolvimento com datas e commits representativos.
- Anonimizar bases, prints e exemplos de clientes.
- Detalhar metricas de uso real, se houver autorizacao e dados anonimizados.
- Completar DDL consolidado das tabelas principais caso seja exigido pela instituicao.
- Documentar procedimento operacional de deploy e monitoramento em producao.

## Conclusao

O SolarZap, conforme evidenciado pelo repositorio analisado, e uma plataforma web de CRM e automacao comercial com escopo tecnico consistente para apresentacao como documentacao tecnica de desenvolvimento de software acompanhada de relatorio tecnico. O projeto abrange front-end, backend serverless, modelagem relacional, seguranca, automacoes, integracoes externas, propostas comerciais, tracking de conversoes, billing, administracao e testes.

Sob a perspectiva academica, o sistema demonstra aplicacao pratica de conhecimentos de Computacao/Ciencia de Dados, incluindo levantamento de requisitos, arquitetura de software, modelagem de dados, integracao de APIs, automacao de processos, controle de acesso, validacao e documentacao tecnica. Com a inclusao dos dados pessoais, prints, evidencias de execucao e revisao de confidencialidade, o material pode compor um dossie robusto para solicitacao de equivalencia/convalidacao de TCC.

## Referencias tecnicas

- `README.md` - instrucoes basicas do projeto e stack inicial.
- `package.json` - dependencias, scripts e bibliotecas utilizadas.
- `src/App.tsx` - rotas, providers e estrutura da aplicacao.
- `src/contexts/AuthContext.tsx` - autenticacao, organizacoes e papeis.
- `src/components/ProtectedRoute.tsx` - protecao de rotas e gating de acesso.
- `src/components/solarzap/SolarZapLayout.tsx` - layout e modulos principais do CRM.
- `src/types/solarzap.ts` - modelos de contato, pipeline, mensagens e canais.
- `src/hooks/domain/useLeads.ts` - logica de leads/contatos.
- `src/hooks/domain/usePipeline.ts` - logica de pipeline, propostas e eventos.
- `src/hooks/domain/useChat.ts` - logica de conversas e mensagens.
- `src/contexts/AutomationContext.tsx` - configuracoes de automacoes.
- `src/hooks/useIntegrations.ts` - integracoes Google, Meta e WhatsApp.
- `src/hooks/useProposalForm.ts` - fluxo de proposta.
- `src/utils/solarSizing.ts` - calculo de dimensionamento solar.
- `src/utils/proposalFinancialModel.ts` - modelo financeiro de proposta.
- `src/components/solarzap/tracking/useTrackingData.ts` - configuracao de tracking e conversoes.
- `src/pages/Admin.tsx` e `src/hooks/useAdminApi.ts` - modulo administrativo.
- `src/modules/internal-crm/` - CRM interno.
- `src/modules/contracts/` - modulo de contratos.
- `supabase/migrations/` - schema, RLS, RPCs e evolucao do banco.
- `supabase/functions/` - Edge Functions e integracoes.
- `vitest.config.ts`, `playwright.config.ts`, `tests/` - estrutura de testes.
- `Dockerfile`, `docker-compose.vps.yml`, `Caddyfile` - deploy e servidor web.

## Anexos

- [INSERIR PRINT: 01-login.png]
- [INSERIR PRINT: 02-dashboard.png]
- [INSERIR PRINT: 03-pipeline-crm.png]
- [INSERIR PRINT: 04-contatos-leads.png]
- [INSERIR PRINT: 05-detalhe-lead.png]
- [INSERIR PRINT: 06-propostas.png]
- [INSERIR PRINT: 07-automacoes.png]
- [INSERIR PRINT: 08-integracoes.png]
- [INSERIR PRINT: 09-tracking-conversoes.png]
- [INSERIR PRINT: 10-admin-ou-crm-interno.png]
- [INSERIR PRINT: 11-supabase-migrations-functions.png]
- [INSERIR PRINT: 12-testes-ou-build.png]

