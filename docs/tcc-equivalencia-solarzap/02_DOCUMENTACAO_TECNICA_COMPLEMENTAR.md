# Documentacao Tecnica Complementar - SolarZap

## Visao geral do sistema

O SolarZap e uma aplicacao web de CRM e automacao comercial para empresas/consultores do setor de energia solar. O sistema centraliza leads, conversas, pipeline, calendario, propostas comerciais, automacoes, tracking de conversoes, integracoes externas, billing, administracao e um CRM interno.

A aplicacao principal e uma SPA React/TypeScript com Supabase como backend. O acesso autenticado e organizado por empresas/organizacoes, com papeis, rotas protegidas, feature flags e controle de plano.

## Stack tecnologica real encontrada

| Area | Tecnologias |
|---|---|
| Front-end | React 18, Vite, TypeScript, React Router, TanStack Query |
| Interface | Tailwind CSS, shadcn/Radix UI, lucide-react, Recharts |
| Formularios/validacao | React Hook Form, Zod |
| Backend | Supabase Auth, PostgreSQL, RLS, Storage, Edge Functions |
| Integracoes | Evolution API/WhatsApp, Google OAuth/Ads/Calendar/GA4, Meta, Stripe, Resend, OpenAI/LLM, geocoding/PVGIS |
| Arquivos/PDF | jsPDF, jsPDF AutoTable, xlsx |
| Testes | Vitest, Testing Library, Playwright |
| Deploy | Docker, docker-compose, Caddy |

Evidencias principais: `package.json`, `src/App.tsx`, `src/lib/supabase.ts`, `supabase/config.toml`, `Dockerfile`, `Caddyfile`.

## Estrutura de pastas

| Pasta/arquivo | Descricao |
|---|---|
| `src/pages/` | Paginas e rotas de alto nivel, incluindo login, index, admin, billing, pricing e embed de contratos. |
| `src/components/` | Componentes reutilizaveis e componentes do produto. |
| `src/components/solarzap/` | Modulos do CRM principal: layout, pipeline, conversas, dashboard, integracoes, automacoes, propostas, calendario e contatos. |
| `src/components/ui/` | Componentes de interface baseados em shadcn/Radix. |
| `src/contexts/` | Contextos globais: autenticacao, automacoes, integracoes, tema. |
| `src/hooks/` | Hooks de aplicacao para propostas, integracoes, billing, notificacoes, dashboards, tracking etc. |
| `src/hooks/domain/` | Hooks de dominio para leads, chat e pipeline. |
| `src/modules/internal-crm/` | CRM interno administrativo. |
| `src/modules/contracts/` | Modulo de contratos, schemas, repositorio, renderizacao e UI. |
| `src/utils/` | Calculos solares, modelo financeiro, PDF e utilitarios. |
| `supabase/migrations/` | Migrations de banco, RLS, seeds, RPCs, cron e estruturas auxiliares. |
| `supabase/functions/` | Edge Functions para backend serverless e integracoes. |
| `tests/` | Testes unitarios, golden tests e E2E. |
| `public/` | Assets publicos. |
| `docs/` | Documentacao do projeto. |

## Principais modulos

### Autenticacao e organizacoes

- `src/contexts/AuthContext.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/pages/Login.tsx`
- `src/pages/SelectOrganization.tsx`
- Migrations: `20260218_m1_organizations_foundation.sql`, `20260218000002_m3_rls_org_scoped.sql`, `20260218000003_m4_lead_visibility.sql`

Funcionalidades: login, signup, recuperacao de senha, selecao de organizacao, papeis, status da organizacao, controle de acesso e gating por billing/onboarding.

### CRM principal

- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/mobileNavConfig.ts`
- `src/types/solarzap.ts`
- `src/hooks/domain/useLeads.ts`
- `src/hooks/domain/usePipeline.ts`
- `src/hooks/domain/useChat.ts`

Funcionalidades: conversas, pipeline, calendario, contatos, disparos, propostas, dashboard, integracoes, tracking, automacoes, IA, conta, equipe e plano.

### Propostas comerciais

- `src/hooks/useProposalForm.ts`
- `src/utils/solarSizing.ts`
- `src/utils/proposalFinancialModel.ts`
- `supabase/functions/proposal-composer`
- `supabase/functions/proposal-context-engine`
- `supabase/functions/proposal-share`
- `supabase/functions/proposal-storage-intent`
- Migrations `20260212170100_proposal_premium_foundation.sql` e `20260212170400_proposal_sections.sql`

Funcionalidades: dimensionamento solar, dados financeiros, geracao de proposta, versoes, secoes, compartilhamento e eventos de entrega.

### Automacoes e IA

- `src/contexts/AutomationContext.tsx`
- `src/hooks/useAutomationSettings.ts`
- `src/components/solarzap/AutomationsView.tsx`
- `supabase/functions/process-agent-jobs`
- `supabase/functions/ai-pipeline-agent`
- `supabase/functions/ai-reporter`
- `supabase/functions/ai-digest-worker`
- Migrations `20260312101000_automation_settings_persistence.sql`, `20260205000001_ai_system_schema.sql`, `20260310100000_pipeline_agents_jobs.sql`

Funcionalidades: automacoes de funil, mensagens padronizadas, follow-up, jobs de IA, configuracoes por organizacao e base de conhecimento.

### Integracoes

- `src/hooks/useIntegrations.ts`
- `src/components/solarzap/IntegrationsView.tsx`
- Edge Functions: `google-oauth`, `google-callback`, `meta-oauth`, `meta-callback`, `whatsapp-connect`, `evolution-api`, `evolution-webhook`, `integration-disconnect`

Funcionalidades: conexao com Google, Meta, WhatsApp/Evolution API, instancias de atendimento e status de integracao.

### Tracking e conversoes

- `src/components/solarzap/tracking/useTrackingData.ts`
- `supabase/functions/attribution-webhook`
- `supabase/functions/conversion-dispatcher`
- `supabase/functions/tracking-credentials`
- Migration `20260304170000_tracking_v3_schema.sql`

Funcionalidades: credenciais de plataformas, webhook de atribuicao, eventos de conversao, entregas para plataformas de anuncios e snippet de atribuicao.

### Administracao, billing e feature flags

- `src/pages/Admin.tsx`
- `src/components/admin/AdminGuard.tsx`
- `src/hooks/useAdminApi.ts`
- `src/hooks/useOrgBilling.ts`
- Edge Functions: `admin-api`, `stripe-checkout`, `stripe-pack-checkout`, `stripe-portal`, `stripe-webhook`, `org-admin`
- Migrations `20260305110000_admin_foundation.sql`, `20260305130000_admin_feature_flags.sql`, `20260307100000_billing_data_model.sql`, `20260307100001_billing_rpcs.sql`

Funcionalidades: painel admin, organizacoes, usuarios, planos, financeiro SaaS, flags, billing e status de organizacao.

### CRM interno

- `src/modules/internal-crm/`
- `supabase/functions/internal-crm-api`
- `supabase/functions/internal-crm-broadcast-worker`
- `supabase/functions/internal-crm-google-callback`
- Migrations `20260328000100_internal_crm_schema_base.sql`, `20260328000300_internal_crm_rls.sql`, `20260329181000_internal_crm_arkan_blueprint.sql`

Funcionalidades: clientes, deals, produtos, pipeline interno, tarefas, inbox, campanhas, automacoes, agenda, financeiro, customer app snapshot e roles internas.

### Contratos

- `src/modules/contracts/`
- `src/pages/ContractEmbed.tsx`
- Edge Functions: `contract-embed-api`, `contract-embed-link`, `contract-embed-public-link`, `contract-storage-intent`
- Migrations `20260416000100_contract_module_foundation.sql`, `20260416000200_contract_embed_sessions.sql`

Funcionalidades: minutas, eventos de contrato, artefatos, embed publico e workspace de contratos.

## Rotas/paginas

Rotas principais identificadas em `src/App.tsx`:

| Rota | Descricao |
|---|---|
| `/login` | Login/autenticacao. |
| `/select-organization` | Selecao de organizacao. |
| `/update-password` | Atualizacao de senha. |
| `/qr/call` | Pagina relacionada a chamada/QR. |
| `/privacidade` | Politica de privacidade. |
| `/termos` | Termos de uso. |
| `/pricing` | Planos/precos. |
| `/billing` | Billing. |
| `/embed/contracts` | Embed de contratos. |
| `/onboarding` | Onboarding protegido. |
| `/` | Area principal protegida do SolarZap. |
| `/settings/members` | Gestao de membros/equipe. |
| `/admin/*` | Area administrativa. |

Rotas admin em `src/pages/Admin.tsx` incluem dashboard, organizacoes, detalhes de org, financeiro, auditoria, feature flags e CRM interno.

## Servicos e Edge Functions

Edge Functions agrupadas por finalidade:

| Grupo | Funcoes |
|---|---|
| Admin/organizacao | `admin-api`, `org-admin`, `admin-broadcast-worker` |
| IA | `ai-digest-worker`, `ai-pipeline-agent`, `ai-reporter`, `process-agent-jobs`, `kb-ingest` |
| WhatsApp/mensageria | `evolution-api`, `evolution-proxy`, `evolution-webhook`, `whatsapp-connect`, `whatsapp-webhook`, `broadcast-worker` |
| Google/Meta | `google-oauth`, `google-callback`, `google-ads-oauth`, `google-ads-callback`, `meta-oauth`, `meta-callback`, `meta-webhook` |
| Tracking | `attribution-webhook`, `conversion-dispatcher`, `tracking-credentials` |
| Propostas | `proposal-composer`, `proposal-context-engine`, `proposal-copy-generator`, `proposal-share`, `proposal-share-link`, `proposal-storage-intent` |
| Billing | `stripe-checkout`, `stripe-pack-checkout`, `stripe-portal`, `stripe-webhook` |
| CRM interno | `internal-crm-api`, `internal-crm-broadcast-worker`, `internal-crm-google-callback`, `internal-crm-media-resolver`, `internal-crm-storage-intent` |
| Contratos | `contract-embed-api`, `contract-embed-link`, `contract-embed-public-link`, `contract-storage-intent` |
| Utilitarios | `appointments-api`, `reports-dashboard`, `reports-export`, `solar-resource`, `storage-intent`, `media-resolver`, `notification-worker`, `process-reminders` |

## Hooks relevantes

| Hook | Responsabilidade |
|---|---|
| `useLeads` | CRUD, importacao, realtime e escopo de leads. |
| `usePipeline` | Movimentacao de pipeline, agendamentos, propostas e eventos. |
| `useChat` | Mensagens, midias, realtime e envio via integracao. |
| `useIntegrations` | Status e conexao de Google, Meta e WhatsApp. |
| `useProposalForm` | Estado e execucao do fluxo de proposta. |
| `useSolarResource` | Geocodificacao e recurso solar/irradiancia. |
| `useAutomationSettings` | Regras de automacao e mensagens. |
| `useOrgBilling` | Status de plano e limites. |
| `useAdminApi` | Chamadas administrativas. |
| `useDashboardReport` | Dados de relatorio/dashboard. |
| `useNotifications` | Notificacoes. |
| `useAppointments` | Agenda. |

## Banco de dados, migrations e schemas

Migrations relevantes:

- Organizacoes/RLS: `20260218_m1_organizations_foundation.sql`, `20260218000002_m3_rls_org_scoped.sql`, `20260218000003_m4_lead_visibility.sql`.
- Calendario: `20260128000001_calendar_module.sql`.
- Dashboard: `20260130_dashboard_analytics.sql`, `20260130000001_fix_dashboard_schema.sql`.
- Base de conhecimento: `20260203000002_knowledge_base_module.sql`, `20260204_knowledge_base_v2.sql`, `20260212170300_create_kb_items.sql`, `20260213090000_kb_ingest_chunks_and_search_v3.sql`.
- IA: `20260205000001_ai_system_schema.sql`, `20260205_ai_system_refinement.sql`, `20260310100000_pipeline_agents_jobs.sql`.
- Propostas: `20260212170100_proposal_premium_foundation.sql`, `20260212170400_proposal_sections.sql`.
- Tarefas: `20260212_lead_tasks.sql`, `20260212170200_lead_tasks.sql`.
- Notificacoes: `20260220093000_notifications_visits_proposals_digest_foundation.sql`, `20260222140000_notification_email_sender_and_event_toggles.sql`.
- Disparos: `20260304153000_broadcast_campaigns_and_recipients.sql`.
- Tracking: `20260304170000_tracking_v3_schema.sql`, `20260304193000_tracking_v3_stage_router.sql`, `20260304212000_tracking_v3_dispatcher_cron.sql`.
- Admin: `20260305110000_admin_foundation.sql`, `20260305120000_admin_org_status.sql`, `20260305130000_admin_feature_flags.sql`.
- Billing: `20260306000000_subscription_plans.sql`, `20260307100000_billing_data_model.sql`, `20260307100001_billing_rpcs.sql`.
- Automacoes: `20260312101000_automation_settings_persistence.sql`.
- Onboarding: `20260312150000_onboarding_progress.sql`, `20260312151000_guided_tour_v2.sql`.
- CRM interno: `20260328000100_internal_crm_schema_base.sql`, `20260328000300_internal_crm_rls.sql`, `20260328000450_internal_crm_inbox_campaigns_ai.sql`, `20260329181000_internal_crm_arkan_blueprint.sql`.
- Contratos: `20260416000100_contract_module_foundation.sql`, `20260416000200_contract_embed_sessions.sql`.

## Variaveis de ambiente necessarias identificadas

Os nomes abaixo foram identificados em codigo, configuracoes, funcoes ou scripts. Valores nao devem ser anexados.

### Front-end/Vite

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_EVOLUTION_API_URL`
- `VITE_GOOGLE_GEOCODING_API_KEY`
- `VITE_USE_SOLAR_RESOURCE_API`
- `VITE_USE_UNIFIED_GENERATION`
- `VITE_USE_OM_COST_MODEL`
- `VITE_USE_DEGRADATION_ALL_CLIENTS`
- `VITE_USE_TUSD_TE_SIMPLIFIED`
- `VITE_USE_FINANCIAL_SHADOW_MODE`
- `VITE_USE_CHART_FIXED_SEASONAL_PROFILE`
- `VITE_USE_PDF_RENDERER_V2`

### Backend/Supabase Functions

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGIN`
- `ALLOWED_ORIGINS`
- `ALLOW_LOCALHOST_CORS`
- `ALLOW_WILDCARD_CORS`
- `SITE_URL`
- `APP_URL`
- `PUBLIC_APP_URL`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `WHATSAPP_WEBHOOK_URL`
- `EDGE_INTERNAL_API_KEY`
- `ARKAN_WEBHOOK_SECRET`
- `MEDIA_RESOLVER_INTERNAL_SECRET`
- `OPENAI_API_KEY`
- `PROPOSAL_COPY_MODEL`
- `PROPOSAL_COMPOSER_MODEL`
- `DIGEST_OPENAI_MODEL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_GEOCODING_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `META_APP_ID`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_EMBED_ALLOWED_ORIGINS`
- `CONTRACT_EMBED_SHARED_SECRET`
- `CONTRACT_EMBED_PUBLIC_BASE_URL`
- `PROPOSAL_SHARE_HMAC_SECRET`
- `SERPER_API_KEY`
- `GOOGLE_SERPER_API_KEY`
- `AI_WEB_SEARCH_ENABLED`

### Testes/scripts

- `TEST_SYSTEM_ADMIN_EMAIL`
- `TEST_SYSTEM_ADMIN_PASSWORD`
- `SOLARZAP_APP_EMAIL`
- `SOLARZAP_APP_PASSWORD`
- `GOOGLE_ACCOUNT_EMAIL`
- `GOOGLE_ACCOUNT_PASSWORD`

Observacao de seguranca: foram identificadas referencias a credenciais/variaveis no repositorio. Os valores foram omitidos neste dossie. Antes de anexar qualquer material, revisar prints, arquivos e PDFs para impedir exposicao de valores sensiveis.

## Instrucoes de execucao local

As instrucoes abaixo foram deduzidas de `README.md` e `package.json`.

```bash
npm i
npm run dev
```

Scripts disponiveis:

| Script | Finalidade |
|---|---|
| `npm run dev` | Inicia servidor Vite. |
| `npm run build` | Build de producao. |
| `npm run build:dev` | Build em modo development. |
| `npm run typecheck` | TypeScript build/typecheck. |
| `npm run test` | Testes Vitest. |
| `npm run test:unit` | Testes unitarios. |
| `npm run test:boundary` | Testes de boundary. |
| `npm run test:golden` | Golden tests. |
| `npm run lint` | ESLint. |
| `npm run preview` | Preview Vite. |

Para execucao completa, e necessario configurar variaveis de ambiente e instancia Supabase. Nao anexar arquivos `.env` nem valores sensiveis.

## Riscos tecnicos e pontos pendentes

| Item | Situacao |
|---|---|
| Dados pessoais academicos | Preencher manualmente. |
| Ambiente de producao | Pendente de confirmacao e print. |
| Execucao de testes | Pendente, caso deseje anexar resultado. |
| Prints do sistema | Pendentes. |
| Segredos no repositorio | Revisar e garantir que nao sejam anexados; considerar rotacao se necessario. |
| Base DDL historica de algumas tabelas centrais | Pendente de confirmacao caso a UNIVESP solicite schema completo. |
| Integracoes ativas em producao | Pendente de confirmacao por tela/configuracao. |
| Dados reais de clientes | Devem ser anonimizados ou omitidos. |

