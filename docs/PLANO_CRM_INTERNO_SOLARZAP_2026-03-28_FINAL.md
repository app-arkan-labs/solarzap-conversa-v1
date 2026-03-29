# Plano CRM Interno SolarZap — Versao Final Revisada

Data original: 2026-03-28
Revisao: 2026-03-28

> Este documento e a versao revisada do plano original. As alteracoes estao
> marcadas com `[REVISADO]` para facilitar a comparacao.

---

## Analise da revisao

### O que esta correto no plano original

1. **Diagnostico do admin**: correto. O admin atual e operacional, nao comercial.
2. **Identificacao de hooks acoplados**: correto. `useLeads`, `useChat`, `usePipeline`, etc. estao presos ao schema publico e nao podem ser reutilizados em modo write.
3. **Decisao de schema isolado**: correto. Persistencia separada evita contaminacao cruzada.
4. **Anti-corruption layer**: correto. O CRM interno deve tocar o dominio publico apenas por acoes explicitas.
5. **Copia-primeiro, abstrai-depois**: correto. Reduz risco e acelera entrega.
6. **Faseamento**: correto. A sequencia Fase 0→1→2→3 entrega valor comercial no menor corte.
7. **Pipeline e lifecycle separados**: correto. Venda e sucesso do cliente sao dimensoes diferentes.

### O que precisa de ajuste

| # | Problema | Impacto | Correcao aplicada |
|---|---------|---------|-------------------|
| 1 | Plano ignora completamente a questao dos subdominios (`admin.solarzap.com.br` / `adm.solarzap.com.br`) | Sem isso nao ha separacao de dominio web | Adicionada secao de arquitetura de subdominios |
| 2 | Conceito de `workspaces` e `workspace_members` e over-engineering para V1 — so existe um workspace (SolarZap) | Complexidade desnecessaria, tabelas vazias, RLS mais lenta | Removido. Reutilizar `_admin_system_admins` + campo `crm_role` |
| 3 | Plano nao menciona que schema customizado precisa ser exposto no PostgREST do Supabase Cloud | Frontend nao consegue chamar `internal_crm` via `supabase-js` | Adicionado passo de configuracao |
| 4 | Sessao de autenticacao em subdominios diferentes nao e compartilhada (`localStorage` e per-origin) | Admin user teria que logar duas vezes | Documentado como feature de seguranca, nao como bug |
| 5 | `customer_app_snapshot` com sync por cron e prematuro para V1 — adiciona complexidade sem beneficio imediato | Tabela de snapshot + cron + worker antes de ter clientes | Simplificado: V1 usa leitura direta read-only via Edge Function; snapshot entra na Fase 6 |
| 6 | Catalogo mistura produtos Stripe (recorrentes) com servicos manuais (mentorias, landing pages) sem distincar o fluxo de cobranca | Confusao sobre o que e cobrado automaticamente vs manualmente | Adicionado campo `payment_method` e esclarecimento |
| 7 | Plano propoe 5 Edge Functions separadas para o CRM interno | Overhead desnecessario — o `admin-api` ja usa padrao gateway com actions | Consolidado em 2 functions: `internal-crm-api` (gateway) + `internal-crm-broadcast-worker` |
| 8 | Plano nao menciona como o SPA roteia por hostname | SPA carrega mesmo bundle para todos os dominios, precisa de logica de roteamento | Adicionada logica de hostname-aware routing |
| 9 | `orders` e `subscriptions` (Fase 6) duplicam o que o Stripe ja rastreia | Dados inconsistentes se nao houver sync | Esclarecido: `internal_crm.subscriptions` guarda promessa comercial; Stripe guarda billing real |
| 10 | `internal_crm.whatsapp_instances` pode conflitar com instancias ja existentes no Evolution API | Mesma instancia nao pode existir em dois contextos | Adicionada nota de que a instancia WhatsApp interna e uma instancia propria no Evolution, nao compartilhada |

---

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
- `supabase/functions/admin-api/index.ts` (action `create_org_with_user`)

Isto e importante porque o CRM interno nao precisa inventar provisionamento do zero. Ele precisa apenas chamar esse fluxo por uma camada de orquestracao explicita quando um deal for ganho.

### 5. O catalogo atual nao cobre seu mix comercial real

Catalogo atual do produto:
- `supabase/migrations/20260307000000_billing_catalog_v2.sql`

Hoje o SaaS conhece:
- `free`
- `start` (R$199/mes)
- `pro` (R$299/mes)
- `scale` (R$369/mes)
- add-ons tecnicos (whatsapp_extra, ai_pack, disparo_pack)

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

## `[REVISADO]` Arquitetura de subdominios

### Mapeamento de dominios

| Dominio | Objetivo | Publico-alvo |
|---------|---------|-------------|
| `app.solarzap.com.br` | SolarZap principal (produto vendido aos clientes) | Clientes finais |
| `crm.solarzap.com.br` | SolarZap principal (alias/futuro) | Clientes finais |
| `admin.solarzap.com.br` | Admin Panel + CRM interno da SolarZap | Equipe interna SolarZap |
| `adm.solarzap.com.br` | Alias do admin | Equipe interna SolarZap |

### Como funciona tecnicamente

Hoje o deploy e um unico container Docker com Caddy servindo um SPA React.
O `Caddyfile` usa a env var `{$SOLARZAP_DOMAINS}` para definir quais dominios sao atendidos.
Todos os dominios servem o mesmo `dist/index.html`.

Alteracoes necessarias:

1. **Caddy**: adicionar `admin.solarzap.com.br` e `adm.solarzap.com.br` ao `SOLARZAP_DOMAINS`:
   ```
   SOLARZAP_DOMAINS=<dominios_atuais>,admin.solarzap.com.br,adm.solarzap.com.br
   ```
   - manter os dominios ja ativos e apenas acrescentar `admin` e `adm`.

2. **Frontend — hostname-aware routing**: no entrypoint do React (antes do router), detectar o hostname:
   ```typescript
   // src/lib/hostDetection.ts
   const ADMIN_HOSTNAMES = ['admin.solarzap.com.br', 'adm.solarzap.com.br'];

   export function isAdminHost(): boolean {
     return ADMIN_HOSTNAMES.includes(window.location.hostname);
   }
   ```
   - Se `isAdminHost()` === true e o path e `/`, redirecionar para `/admin`.
   - Se `isAdminHost()` === false e o path comeca com `/admin`, redirecionar 302 para `https://admin.solarzap.com.br${pathname}${search}${hash}` (nao bloquear no V1, para manter backward compat).
   - Opcional (V1): esconder rotas do produto (`/`, conversas, pipeline, etc.) quando acessado pelo hostname admin, e esconder `/admin` quando acessado pelo hostname do app.

3. **Supabase Auth — sessao isolada por subdominio**:
   - `localStorage` e per-origin. Quem loga em `app.solarzap.com.br` NAO tem sessao em `admin.solarzap.com.br`.
   - Isso e uma **feature de seguranca**, nao um bug:
     - Sessao admin completamente isolada da sessao de cliente.
     - Se um token do app for interceptado, nao da acesso ao admin.
     - Admin users fazem login + MFA exclusivamente em `admin.solarzap.com.br`.
   - Adicionar `admin.solarzap.com.br` e `adm.solarzap.com.br` na lista de `Redirect URLs` do Supabase Auth (Dashboard > Auth > URL Configuration).

4. **DNS**: apontar ambos `admin` e `adm` como `A` ou `CNAME` para o mesmo IP/VPS onde roda o container.

### Impacto no fluxo de uso

- Equipe interna SolarZap acessa `admin.solarzap.com.br` → faz login → MFA → chega no admin/CRM.
- Clientes acessam `app.solarzap.com.br` → fazem login → usam o SolarZap normalmente.
- No host admin, rotas do produto devem redirecionar para `/admin`; no host app, rotas `/admin/*` devem redirecionar para `admin.solarzap.com.br`.

## Decisoes nao negociaveis

1. Criar um schema novo: `internal_crm`
- nada de gravar CRM interno em `public.leads`, `public.interacoes`, `public.deals`, `public.broadcast_campaigns`, `public.ai_settings` ou `public.whatsapp_instances`.

2. Manter o Admin Panel atual vivo
- o que hoje existe em `/admin`, `/admin/orgs`, `/admin/financeiro`, `/admin/flags`, `/admin/audit` continua funcionando;
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

6. `[REVISADO]` Subdominios isolados para admin
- `admin.solarzap.com.br` / `adm.solarzap.com.br` servem o SPA com roteamento hostname-aware;
- sessao de auth isolada;
- `app.solarzap.com.br` / `crm.solarzap.com.br` ficam intocados.

## Arquitetura alvo

### 1. Rotas

Manter:
- `/admin` (dashboard de sistema)
- `/admin/orgs`
- `/admin/financeiro`
- `/admin/flags`
- `/admin/audit`

Adicionar:
- `/admin/crm` (redireciona para dashboard CRM)
- `/admin/crm/dashboard`
- `/admin/crm/pipeline`
- `/admin/crm/inbox`
- `/admin/crm/clients`
- `/admin/crm/campaigns`
- `/admin/crm/ai`
- `/admin/crm/finance`

Recomendacao de sidebar atualizada:

```
--- CRM Interno ---
  CRM Dashboard
  Pipeline
  Inbox
  Clientes
  Campanhas
  IA
  Financeiro CRM

--- Sistema ---
  Dashboard Sistema
  Organizacoes
  Financeiro SaaS
  Feature Flags
  Audit Log
```

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

### 3. `[REVISADO]` Backend — Edge Functions

O `admin-api` ja usa padrao gateway com actions. O CRM interno deve seguir o mesmo padrao.

Criar apenas 2 Edge Functions novas:

| Function | Papel |
|----------|-------|
| `internal-crm-api` | Gateway para todas as acoes do CRM interno (CRUD de clients, deals, pipeline, conversations, AI settings, dashboard KPIs, provisionamento, leitura de dados do app publico) |
| `internal-crm-broadcast-worker` | Worker de processamento de campanhas internas (precisa rodar async, separado do gateway) |

Nao criar:
- ~~`internal-crm-agent-worker`~~ → entra como action do `internal-crm-api` que agenda jobs na tabela `scheduled_agent_jobs` do CRM; o processamento pode usar um cron que invoca `internal-crm-api` action `process_agent_jobs`.
- ~~`internal-crm-dashboard`~~ → action do `internal-crm-api`.
- ~~`internal-crm-sync-public-app`~~ → action do `internal-crm-api`.

Pode reaproveitar utilitarios puros:
- normalizacao de telefone;
- formatacao de mensagens;
- regras de prompt;
- integracao com Evolution/WhatsApp quando nao houver risco de misturar tabelas.

Autorizacao do `internal-crm-api`:
- mesmo padrao do `admin-api`: valida JWT → busca role em `_admin_system_admins` → valida MFA AAL2;
- adicionalmente verifica `crm_role` para permissoes finas (ver modelo de dados abaixo).

## `[REVISADO]` Modelo de dados recomendado

### Regra geral

Tudo dentro do schema `internal_crm`.

Nao criar FKs para tabelas de negocio do `public`.
Se for preciso guardar o vinculo com o app publico, salvar apenas IDs de referencia como texto/uuid sem FK.

### Pre-requisito: expor o schema no Supabase Cloud

Para que o frontend consiga usar `supabase.schema('internal_crm')`, o schema precisa
estar na lista `PGRST_DB_SCHEMAS` do PostgREST.

**Como fazer** (Supabase Dashboard):
1. Ir em `Settings > API > Schema`
2. Adicionar `internal_crm` a lista de schemas expostos
3. Salvar (o PostgREST reinicia automaticamente)

Sem isso, qualquer chamada do tipo `supabase.schema('internal_crm').from(...)` retorna 404.

> Nota: Edge Functions que usam `@supabase/supabase-js` com `service_role` tambem passam
> pelo PostgREST e dependem do schema exposto. So nao dependem disso se usarem conexao
> SQL direta (Postgres wire) fora do `supabase-js`.

### 1. `[REVISADO]` Controle de acesso — sem workspaces

~~Tabelas:~~
~~- `internal_crm.workspaces`~~
~~- `internal_crm.workspace_members`~~

Justificativa da remocao:
- so existe UM workspace interno (SolarZap);
- `_admin_system_admins` ja controla quem e admin e com qual role (`super_admin`, `ops`, `billing`, `support`, `read_only`);
- criar `workspaces` introduz complexidade sem beneficio ate que a SolarZap tenha multiplas equipes internas.

Solucao V1:
- adicionar coluna `crm_role` a `_admin_system_admins`:
  ```sql
  ALTER TABLE public._admin_system_admins
    ADD COLUMN crm_role text NOT NULL DEFAULT 'none'
    CHECK (crm_role IN ('none','owner','sales','cs','finance','ops','read_only'));
  ```
- `crm_role = 'none'` → usuario e admin do sistema mas nao tem acesso ao CRM;
- o `internal-crm-api` verifica `crm_role` alem do `system_role` existente;
- RLS do schema `internal_crm` usa uma funcao helper:
  ```sql
  CREATE FUNCTION internal_crm.current_user_crm_role()
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT crm_role FROM public._admin_system_admins
    WHERE user_id = auth.uid()
    LIMIT 1;
  $$;
  ```
- Policies usam `internal_crm.current_user_crm_role() != 'none'` como base.

Evolucao futura:
- se/quando precisar de workspaces (ex: franquias), cria `internal_crm.workspaces` nessa hora.

### 2. `[REVISADO]` Catalogo comercial

Tabelas:
- `internal_crm.products`
- `internal_crm.product_prices`

Produtos a seedar agora:

| product_code | name | billing_type | price_cents | payment_method |
|---|---|---|---|---|
| `mentoria_aceleracao_1` | Mentoria Aceleracao SolarZap 1 | `one_time` | 199700 | `manual` |
| `mentoria_aceleracao_2` | Mentoria Aceleracao SolarZap 2 | `one_time` | 149700 | `manual` |
| `mentoria_aceleracao_3` | Mentoria Aceleracao SolarZap 3 | `one_time` | 99700 | `manual` |
| `solarzap_scale` | SolarZap Scale | `recurring` | 36900 | `stripe` |
| `solarzap_pro` | SolarZap Pro | `recurring` | 29900 | `stripe` |
| `solarzap_start` | SolarZap Start | `recurring` | 19900 | `stripe` |
| `landing_page_premium` | Landing Page Premium | `one_time` | 99700 | `manual` |
| `landing_page_start` | Landing Page Start | `one_time` | 49700 | `manual` |

`[REVISADO]` Campo `payment_method` adicionado:
- `stripe` → produto cobrado via Stripe Checkout. Ao fechar deal, o CRM gera link de checkout Stripe automaticamente.
- `manual` → produto cobrado via Pix/boleto/transferencia. O CRM registra pagamento manualmente.
- `hybrid` → pode ser cobrado por qualquer via (uso futuro).

Campos minimos de `products`:
- `product_code`
- `name`
- `billing_type` (one_time | recurring)
- `payment_method` (stripe | manual | hybrid)
- `is_active`
- `sort_order`
- `metadata` (jsonb)

Campos minimos de `product_prices`:
- `product_code` (FK)
- `price_cents`
- `currency` (default BRL)
- `stripe_price_id` (nullable — preenchido somente para produtos Stripe)
- `valid_from`
- `valid_until` (nullable)

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
- responsavel interno (`owner_user_id` → referencia a `auth.users`, sem FK)
- etapa comercial atual (`current_stage_code`)
- status do cliente (lifecycle):
  - `lead`
  - `customer_onboarding`
  - `active_customer`
  - `churn_risk`
  - `churned`
- ultimo contato (`last_contact_at`)
- proxima acao (`next_action`, `next_action_at`)
- notas
- `linked_public_org_id` (uuid, sem FK — referencia a `public.organizations.id`)
- `linked_public_user_id` (uuid, opcional, sem FK)

### 4. Negociacao e receita

Tabelas:
- `internal_crm.deals`
- `internal_crm.deal_items`

`[REVISADO]` Removidas da Fase 1:
- ~~`internal_crm.orders`~~ → entra na Fase 6 (Financeiro CRM)
- ~~`internal_crm.subscriptions`~~ → entra na Fase 6 (Financeiro CRM)
- ~~`internal_crm.payment_events`~~ → entra na Fase 6 (Financeiro CRM)

Justificativa:
- para vender rapidamente, basta `deals` + `deal_items`;
- o rastreamento financeiro detalhado (orders, subscriptions, payment_events) entra quando houver volume e a necessidade for real.

Campos minimos de `deals`:
- `client_id`
- `title`
- `owner_user_id`
- `stage_code`
- `status` (open | won | lost)
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

### 5. `[REVISADO]` Inbox e WhatsApp interno

Tabelas:
- `internal_crm.whatsapp_instances`
- `internal_crm.conversations`
- `internal_crm.messages`

Campos minimos:
- instancia:
  - `instance_name` (deve ser unico no Evolution API — usar prefixo `sz_internal_`)
  - `display_name`
  - `status`
  - `ai_enabled`
  - `assistant_identity_name`
  - `assistant_prompt_override`
- conversa:
  - `client_id`
  - `contact_id`
  - `assigned_to_user_id`
  - `channel` (whatsapp | manual_note)
  - `status` (open | resolved | archived)
  - `last_message_at`
- mensagem:
  - `conversation_id`
  - `direction` (inbound | outbound)
  - `body`
  - `message_type` (text | image | audio | document | video)
  - `attachment_url`
  - `wa_message_id`
  - `remote_jid`
  - `sent_by_user_id`
  - `read_at`
  - `metadata` (jsonb)

`[REVISADO]` Nota importante sobre instancias WhatsApp:
- a instancia WhatsApp do CRM interno e uma instancia PROPRIA no Evolution API, completamente separada das instancias dos clientes;
- usar prefixo `sz_internal_` no `instance_name` para evitar colisao;
- o webhook dessa instancia deve apontar para o `internal-crm-api` (action `webhook_inbound`), NAO para o `whatsapp-webhook` atual;
- nunca compartilhar a mesma instancia Evolution entre CRM interno e um tenant cliente.

### 6. Disparos

Tabelas:
- `internal_crm.broadcast_campaigns`
- `internal_crm.broadcast_recipients`

Mesma ideia do produto atual, mas separada.

Campos chave:
- nome da campanha
- instancia usada (referencia a `internal_crm.whatsapp_instances`)
- mensagens (jsonb)
- status (draft | running | paused | completed | canceled)
- contadores (sent_count, failed_count)
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

### 8. `[REVISADO]` Ponte com o app publico

#### V1 — Leitura direta via Edge Function (Fases 0–3)

Tabelas V1:
- `internal_crm.customer_app_links`

Uso:
- `customer_app_links` guarda:
  - `client_id`
  - `linked_public_org_id`
  - `linked_public_owner_user_id`
  - `provisioned_at`
  - `provisioning_status` (pending | provisioned | failed)

Leitura de dados do app publico:
- o `internal-crm-api` usa `service_role` para ler `public.organizations`, `public.organization_members`, etc. em tempo real;
- essas leituras sao somente na tela de detalhes do cliente (1 query por vez, nao em listagens);
- nao ha tabela de snapshot — complexidade desnecessaria para a quantidade de clientes inicial.

#### V2 — Snapshot materializado (Fase 6+)

Tabela (futura):
- `internal_crm.customer_app_snapshot`

Quando adicionar:
- quando houver >50 clientes ativos e a leitura direta ficar lenta ou gerar load desnecessario;
- o snapshot replica: plano atual, subscription status, trial/grace/period end, quantidade de usuarios, instancias WhatsApp ativas, leads/propostas do cliente, ultimo sync;
- sync por cron (ex: diario) ou por trigger em eventos criticos (plano mudou, org suspensa).

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

- layout base do admin (`AdminLayout.tsx`)
- padrao de cards, tabelas, drawers e dialogs (shadcn/ui)
- `PageHeader`
- componentes de conversa (visual)
- componentes visuais de pipeline
- componentes de dashboard (visual)
- componentes de campanhas (visual)
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
- `[REVISADO]` expor `internal_crm` em `Settings > API > Schema` no Supabase Dashboard;
- `[REVISADO]` adicionar coluna `crm_role` na `_admin_system_admins`;
- criar bucket proprio: `internal-crm-media` (com RLS: somente usuarios com `crm_role != 'none'` acessam);
- criar RLS propria baseada em `crm_role`;
- criar migrations novas sem alterar tabelas do dominio atual;
- criar base de routes `/admin/crm/*`;
- `[REVISADO]` adicionar `admin.solarzap.com.br` / `adm.solarzap.com.br` ao `SOLARZAP_DOMAINS` no docker-compose;
- `[REVISADO]` adicionar ambos subdominios na lista de `Redirect URLs` do Supabase Auth;
- `[REVISADO]` criar `src/lib/hostDetection.ts` com logica hostname-aware;
- `[REVISADO]` configurar DNS para os novos subdominios;
- manter admin atual intocado.

Aceite:
- zero escrita do CRM interno no schema `public`;
- admin atual segue funcionando igual;
- `[REVISADO]` `admin.solarzap.com.br` carrega o SPA e redireciona para `/admin`;
- `[REVISADO]` `app.solarzap.com.br/admin` redireciona automaticamente para `admin.solarzap.com.br/admin` (backward compat sem duplicar superficie de acesso).

### Fase 1 - Core comercial vendavel

Objetivo:
- conseguir cadastrar oportunidade, conversar, mover no pipeline e fechar.

Entregas:
- `internal_crm.products` + seed de catalogo
- `internal_crm.product_prices` + seed de precos
- `internal_crm.clients`
- `internal_crm.client_contacts`
- `internal_crm.pipeline_stages` + seed de etapas
- `internal_crm.deals`
- `internal_crm.deal_items`
- `internal_crm.tasks`
- `internal_crm.appointments`
- `internal_crm.audit_log`
- Edge Function `internal-crm-api` (actions: CRUD clients, deals, pipeline, tasks, appointments, dashboard KPIs)
- telas:
  - dashboard CRM
  - pipeline (kanban)
  - clientes (listagem + detalhe)
- CTA de criar deal e registrar proxima acao

Aceite:
- voce consegue cadastrar um lead interno, mover etapas, associar produtos e fechar um deal.

### Fase 2 - Inbox interno

Objetivo:
- operar o relacionamento comercial dentro do admin.

Entregas:
- `internal_crm.whatsapp_instances`
- `internal_crm.conversations`
- `internal_crm.messages`
- `[REVISADO]` registrar instancia WhatsApp interna no Evolution API com prefixo `sz_internal_`
- `[REVISADO]` configurar webhook da instancia interna para `internal-crm-api` action `webhook_inbound`
- inbox com:
  - lista de conversas
  - chat
  - notas internas
  - atribuicao de responsavel
  - proxima acao

Aceite:
- voce consegue falar com o lead/cliente interno pelo painel e acompanhar historico.
- `[REVISADO]` mensagens internas nao aparecem no inbox dos clientes e vice-versa.

### Fase 3 - Fechamento e provisionamento

Objetivo:
- transformar venda em cliente real do app sem operacao manual dispersa.

Entregas:
- fluxo `deal -> ganho`:
  - se produto Stripe: gera link Stripe Checkout e aguarda webhook;
  - se produto manual: marca pagamento recebido manualmente;
- tela de onboarding do cliente interno;
- acao explicita `Provisionar conta SolarZap`;
- chamada controlada ao `admin-api` action `create_org_with_user`;
- gravacao de `internal_crm.customer_app_links`;
- `[REVISADO]` leitura dos dados do app publico via `internal-crm-api` com `service_role`, porem somente por actions read-only em allowlist (sem DML no dominio `public`).

Aceite:
- apos fechar o deal, voce provisiona a conta do cliente no app e o CRM interno passa a mostrar esse vinculo.

### Fase 4 - Disparos

Objetivo:
- disparar campanhas de prospeccao e reativacao pelo CRM interno.

Entregas:
- `internal_crm.broadcast_campaigns`
- `internal_crm.broadcast_recipients`
- Edge Function `internal-crm-broadcast-worker`
- tela de campanhas
- filtro por lista, etapa, origem e responsavel

Aceite:
- voce cria, inicia, pausa e acompanha campanhas internas sem tocar nas campanhas dos seus clientes.

### Fase 5 - IA interna

Objetivo:
- automatizar qualificacao, follow-up e onboarding.

Entregas:
- `internal_crm.ai_settings`
- `internal_crm.ai_stage_config`
- `internal_crm.scheduled_agent_jobs`
- `internal_crm.ai_action_logs`
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
- `internal_crm.orders`
- `internal_crm.subscriptions` (promessa comercial — sync com Stripe para dados de recorrencia real)
- `internal_crm.payment_events`
- `[REVISADO]` `internal_crm.customer_app_snapshot` (so agora, quando houver volume que justifique)
- dashboard financeiro CRM
- separacao clara:
  - receita one-time
  - MRR vendido
  - MRR ativo
  - churn

`[REVISADO]` Esclarecimento sobre `subscriptions` vs Stripe:
- `internal_crm.subscriptions` guarda a **promessa comercial** (o que foi vendido ao cliente);
- Stripe guarda o **billing real** (cobrancas, falhas, cancelamentos);
- o `internal-crm-api` sincroniza status Stripe → CRM via webhook ou leitura periodica;
- nao substituir o Stripe por controle manual — o CRM complementa, nao duplica.

Aceite:
- o financeiro do CRM interno reflete sua operacao comercial, nao apenas orgs do SaaS.

## Recorte minimo para vender logo

Se o foco for velocidade maxima com risco baixo, o primeiro corte comercial deve ser:

1. `Fase 0` — blindagem + subdominios
2. `Fase 1` — core comercial
3. `Fase 2` — inbox
4. `Fase 3` — fechamento + provisionamento

Com isso voce ja tem:
- CRM interno;
- pipeline;
- inbox;
- clientes;
- produtos;
- fechamento;
- provisionamento no SolarZap.

Depois entram:
- Fase 4: disparos
- Fase 5: IA
- Fase 6: financeiro CRM + snapshot

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

Excecao permitida: adicionar coluna `crm_role` em `public._admin_system_admins` (tabela admin, nao tabela de negocio).

2. Nenhuma tela `/admin/crm/*` pode usar hooks atuais do produto em modo write.

3. Buckets separados.

4. Workers separados e nomes de cron separados.

5. Auditoria separada.

6. Bridge para o app publico apenas por service layer explicita (Edge Function com service_role).

7. `[REVISADO]` V1: leitura direta do app publico por service_role (somente em telas de detalhe individual).
   V2+: Snapshot de dados do app publico no CRM interno quando houver volume.

8. `[REVISADO]` Instancia WhatsApp interna e propria — jamais compartilhada com tenants.

9. `[REVISADO]` Subdominios admin isolados — sessao de auth nao compartilhada com o app principal.

## `[REVISADO]` Checklist de infraestrutura pre-implementacao

Antes de comecar a Fase 0, garantir:

- [ ] DNS: `admin.solarzap.com.br` → IP do VPS
- [ ] DNS: `adm.solarzap.com.br` → IP do VPS
- [ ] Supabase Dashboard > Auth > URL Configuration > Redirect URLs: adicionar `https://admin.solarzap.com.br`, `https://adm.solarzap.com.br`
- [ ] Supabase Dashboard > Auth > URL Configuration > Site URL: manter o valor atual (nao trocar para dominio admin)
- [ ] Supabase Dashboard > Settings > API > Exposed schemas: adicionar `internal_crm`
- [ ] Supabase Secrets (`admin-api` e `internal-crm-api`): incluir `ALLOWED_ORIGIN` com CSV de origens permitidas, incluindo `https://admin.solarzap.com.br` e `https://adm.solarzap.com.br`
- [ ] `.env` do VPS: atualizar `SOLARZAP_DOMAINS` para incluir os novos subdominios
- [ ] Confirmar que Caddy vai emitir SSL automaticamente para os novos dominios (basta estarem no `SOLARZAP_DOMAINS`)

## `[REVISADO]` Implementacao tecnica incremental (cirurgica)

### Pacote 1 - Base de dados (D0-D1)

Aplicar 4 migrations pequenas e reversiveis:

1. `supabase/migrations/20260328_000100_internal_crm_schema_base.sql`
- criar schema `internal_crm`;
- criar tabelas base da Fase 1 (`products`, `product_prices`, `clients`, `client_contacts`, `pipeline_stages`, `stage_history`, `deals`, `deal_items`, `tasks`, `appointments`, `audit_log`, `customer_app_links`);
- criar indexes minimos:
  - `clients (owner_user_id, current_stage_code, updated_at desc)`
  - `deals (owner_user_id, stage_code, status, expected_close_at)`
  - `tasks (owner_user_id, due_at, status)`
  - `customer_app_links (linked_public_org_id)`.

2. `supabase/migrations/20260328_000200_admin_crm_role.sql`
- `ALTER TABLE public._admin_system_admins ADD COLUMN crm_role text ...`;
- `CHECK (crm_role IN ('none','owner','sales','cs','finance','ops','read_only'))`;
- seed inicial: `super_admin -> owner`, demais -> `none`.

3. `supabase/migrations/20260328_000300_internal_crm_rls.sql`
- habilitar RLS em todas as tabelas `internal_crm`;
- criar helper `internal_crm.current_user_crm_role()` com `SECURITY DEFINER`;
- definir `SET search_path = public, internal_crm` na funcao helper;
- policy baseline:
  - leitura: `crm_role != 'none'`
  - escrita: `crm_role IN ('owner','sales','cs','ops')`
  - financeiro: apenas `owner` e `finance`.

4. `supabase/migrations/20260328_000400_internal_crm_seed.sql`
- seed idempotente de `products`, `product_prices` e `pipeline_stages`;
- `ON CONFLICT (product_code) DO UPDATE` para evitar seed duplicado.

### Pacote 2 - API gateway (D1-D3)

Criar `supabase/functions/internal-crm-api/index.ts` no mesmo padrao do `admin-api`.

Actions V1 obrigatorias:
- `crm_whoami`
- `list_clients`
- `upsert_client`
- `list_deals`
- `upsert_deal`
- `move_deal_stage`
- `list_tasks`
- `upsert_task`
- `list_dashboard_kpis`
- `provision_customer`
- `get_linked_public_org_summary`

Regras de seguranca no gateway:
- validar JWT e AAL2;
- resolver `system_role` e `crm_role` a partir de `_admin_system_admins`;
- bloquear qualquer action nao listada;
- registrar trilha em `internal_crm.audit_log`.

Bridge read-only para dominio publico:
- encapsular leitura em SQL function `public.crm_bridge_org_summary(p_org_id uuid)` e chamar por `rpc`;
- nao expor queries ad hoc para `public.*` no frontend;
- toda escrita no dominio publico permanece no `admin-api` (`create_org_with_user`).

### Pacote 3 - Frontend minimo vendavel (D3-D6)

Arquivos alvo:
- `src/lib/hostDetection.ts` (novo)
- `src/App.tsx` (redirect hostname-aware antes das rotas)
- `src/pages/Admin.tsx` (novas rotas `/admin/crm/*`)
- `src/components/admin/AdminLayout.tsx` (grupo "CRM Interno")
- `src/modules/internal-crm/*` (copias adaptadas com hooks novos)

Sequencia de telas:
1. Dashboard CRM (KPI + fila de proxima acao)
2. Pipeline (kanban + drag/drop de etapa)
3. Clientes (lista + detalhe + timeline)
4. Provisionamento (botao "Provisionar conta SolarZap")

### Pacote 4 - Validacao de release (D6-D7)

Checklist tecnico de aceite:
- teste SQL: nenhuma migration toca tabelas operacionais `public` listadas nas regras de seguranca;
- teste API: `internal-crm-api` retorna 403 quando `crm_role='none'`;
- teste host: `app.solarzap.com.br/admin` redireciona para `admin.solarzap.com.br/admin`;
- teste CORS: `admin-api` e `internal-crm-api` aceitam origem `admin.solarzap.com.br`;
- teste provisioning: deal ganho cria `customer_app_links` e chama `create_org_with_user` com sucesso;
- smoke manual: criar lead interno -> mover para ganho -> provisionar cliente.

## Blueprint final

Resumo do desenho:

- manter o admin atual como camada de operacao do sistema;
- criar um `CRM interno` dentro do admin, acessivel por `admin.solarzap.com.br`;
- usar o visual e os fluxos do SolarZap principal como base;
- criar um schema novo `internal_crm`;
- recriar nesse schema apenas o que o CRM interno precisa;
- controle de acesso via `crm_role` em `_admin_system_admins` (sem workspace extra);
- provisionar clientes do app por uma ponte controlada;
- nunca compartilhar as tabelas operacionais do produto atual;
- sessao de auth isolada por subdominio.

Em uma frase:

`shared presentation, isolated persistence, explicit bridge, separate origin`
