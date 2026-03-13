## Blueprint Definitivo v2: Monetização SolarZap

> REVISÃO FINAL — corrige regressões comerciais do blueprint v1.
> NÃO implementar. Documento de decisão e especificação.

**Resumo** — Cobrança recorrente via Stripe Checkout. 3 planos pagos (Start R$199 / Pro R$299 / Scale R$369). Trial de 7 dias com cartão obrigatório na entrada. Disparos cobrados por crédito de destinatário. IA e disparos extras vendidos como packs pré-pagos. Tracking avançado exclusivo do Scale. Enforcement real em frontend e backend via `check_plan_limit` RPC + `access_state`. Metering em duas camadas: `usage_events` append-only + `usage_counters` agregados. O repositório já possui catálogo de planos (`_admin_subscription_plans`), colunas de billing em `organizations`, RPCs (`get_org_plan_info`, `get_org_status`, `get_org_feature_flags`), painel admin, e bloqueio por suspensão. **Nenhum limite é enforced em runtime** — zero Stripe, zero trial, zero metering. Este blueprint fecha todas as lacunas.

---

## 1. Modelo Comercial Final

### 1.1 Planos

| | Start | Pro | Scale |
|---|---|---|---|
| **Preço** | R$199/mês | R$299/mês | R$369/mês |
| **Leads** | 300 | 1.500 | Ilimitado (-1) |
| **WhatsApp incluso** | 1 | 3 | 10 |
| **Créditos de disparo/mês** | 50 | 200 | 1.000 |
| **Campanhas de broadcast/mês** | 5 | 20 | Ilimitado (-1) |
| **Propostas/mês** | 50 | 300 | Ilimitado (-1) |
| **Membros** | 3 | 10 | Ilimitado (-1) |
| **Temas de proposta** | 3 | Ilimitado (-1) | Ilimitado (-1) |
| **IA Pipeline** | Sim | Sim | Sim |
| **Agendamentos** | Sim | Sim | Sim |
| **Google Integration** | Não | Sim | Sim |
| **Reports avançados** | Sim | Sim | Sim |
| **Tracking avançado** | Não | Não | Sim |
| **Automações/mês** | 5.000 | 20.000 | 100.000 |

**Não existe plano free público.** Toda entrada é via pricing → signup → checkout com cartão → trial 7 dias no plano escolhido. Após trial sem conversão, org fica em `subscription_status = 'canceled'` com `access_state = 'blocked'`.

### 1.2 Add-ons

| Add-on | Tipo | Preço | Mecânica |
|---|---|---|---|
| WhatsApp extra (+1 número) | `recurring` | R$59,90/mês | Stripe subscription item recorrente. Incrementa `max_whatsapp_instances` em +1. Cancela = decrementa. |
| Automações excedentes (+10K) | `prepaid_pack` | R$39 (avulso) | Stripe one-time payment. Credita +10.000 em `credit_balances.automations`. Saldo persiste entre ciclos (carryover) até ser consumido. |
| IA Pack 1K | `prepaid_pack` | R$79 | Credita +1.000 no saldo de IA. |
| IA Pack 5K | `prepaid_pack` | R$299 | Credita +5.000 no saldo de IA. |
| IA Pack 20K | `prepaid_pack` | R$999 | Credita +20.000 no saldo de IA. |
| Disparo Pack 1K | `prepaid_pack` | R$49 | Credita +1.000 créditos de disparo. |
| Disparo Pack 5K | `prepaid_pack` | R$149 | Credita +5.000 créditos de disparo. |
| Disparo Pack 25K | `prepaid_pack` | R$399 | Credita +25.000 créditos de disparo. |

**Tipos de add-on:**
- `recurring` — Stripe subscription item. Aparece no MRR. Cancela automaticamente.
- `prepaid_pack` — Stripe Checkout one-time. Credita saldo na `credit_balances`. **Carryover até usar** — saldo persiste entre ciclos, não reseta, não expira. Não recarrega automaticamente. Isso vale igualmente para packs de disparo, IA e automações.

### 1.3 Unidade de disparo: crédito por destinatário

- 1 crédito = 1 destinatário em 1 campanha de broadcast.
- Uma campanha para 200 destinatários consome 200 créditos.
- Limite secundário de campanhas/mês existe (5/20/ilimitado) como proteção contra spam, mas a unidade principal de cobrança é o crédito.
- Créditos inclusos no plano resetam todo mês (cycle reset). Créditos de packs não resetam (saldo persistente).

### 1.4 Nomenclatura UX vs. interna

| Contexto | Termo |
|---|---|
| **Termo para o cliente (UI, pricing, emails)** | "Disparos", "Campanhas de disparo", "Créditos de disparo" |
| **Termo técnico interno (código, DB, hooks)** | `broadcast`, `broadcast_campaigns`, `broadcast_credits`, `useBroadcasts` |

O código continua usando `broadcast` em tabelas, hooks e edge functions. A UI traduz para "Disparo" em todos os pontos de contato com o cliente: Pricing page, UsageBar, PlanBadge, UpgradeWall, PackPurchaseModal, Meu Plano, BillingBanner, tooltips e emails.

---

## 2. Matriz de Entitlements Final

### 2.1 Schema `_admin_subscription_plans`

```
plan_key          text PK
display_name      text
price_cents       integer
billing_cycle     text CHECK ('monthly','yearly')
stripe_price_id   text
limits            jsonb   -- hard limits numéricos
features          jsonb   -- feature flags booleanos
sort_order        integer
is_active         boolean
```

**`limits` jsonb por plano:**

| Campo | Start | Pro | Scale | Semântica |
|---|---|---|---|---|
| `max_leads` | 300 | 1500 | -1 | Absoluto: `count(leads WHERE org_id AND deleted_at IS NULL)` |
| `max_whatsapp_instances` | 1 | 3 | 10 | Absoluto: `count(whatsapp_instances WHERE org_id)` |
| `monthly_broadcast_credits` | 50 | 200 | 1000 | Cycle: reseta todo mês. Enriquecido por packs. |
| `max_campaigns_month` | 5 | 20 | -1 | Cycle: `count(broadcast_campaigns created_at no mês)` |
| `max_proposals_month` | 50 | 300 | -1 | Cycle: counter mensal |
| `max_members` | 3 | 10 | -1 | Absoluto: `count(organization_members WHERE org_id)` |
| `max_proposal_themes` | 3 | -1 | -1 | Absoluto |
| `max_automations_month` | 5000 | 20000 | 100000 | Cycle: counter mensal reseta a cada ciclo. Excedente consumido de `credit_balances.automations` (pack carryover). |
| `included_ai_requests_month` | 500 | 2000 | 10000 | Cycle: reseta. Enriquecido por packs. |

**`features` jsonb por plano:**

| Campo | Start | Pro | Scale |
|---|---|---|---|
| `ai_enabled` | true | true | true |
| `google_integration_enabled` | false | true | true |
| `appointments_enabled` | true | true | true |
| `advanced_reports_enabled` | true | true | true |
| `advanced_tracking_enabled` | false | false | true |

### 2.2 Schema `_admin_addon_catalog`

```
addon_key           text PK
addon_type          text CHECK ('recurring','prepaid_pack')
display_name        text
price_cents         integer
stripe_price_id     text
limit_key           text          -- qual campo de limits/credits afeta
credit_amount       integer       -- quanto credita (packs) ou incrementa (recurring)
is_active           boolean
sort_order          integer
```

**Seed:**

| addon_key | addon_type | price_cents | limit_key | credit_amount |
|---|---|---|---|---|
| `whatsapp_extra` | recurring | 5990 | `max_whatsapp_instances` | 1 |
| `automations_10k` | prepaid_pack | 3900 | `automations` | 10000 |
| `ai_pack_1k` | prepaid_pack | 7900 | `ai_requests` | 1000 |
| `ai_pack_5k` | prepaid_pack | 29900 | `ai_requests` | 5000 |
| `ai_pack_20k` | prepaid_pack | 99900 | `ai_requests` | 20000 |
| `disparo_pack_1k` | prepaid_pack | 4900 | `broadcast_credits` | 1000 |
| `disparo_pack_5k` | prepaid_pack | 14900 | `broadcast_credits` | 5000 |
| `disparo_pack_25k` | prepaid_pack | 39900 | `broadcast_credits` | 25000 |

---

## 3. Modelo de Dados Final

### 3.1 Alterações em `organizations`

Colunas novas (sobre as existentes `plan`, `plan_limits`, `status`, `billing_email`, `plan_started_at`, `plan_expires_at`, `stripe_customer_id`):

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `subscription_status` | text | `'none'` | CHECK IN (`none`, `pending_checkout`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`) |
| `stripe_subscription_id` | text | null | Stripe subscription ID do plano principal |
| `trial_started_at` | timestamptz | null | Início do trial |
| `trial_ends_at` | timestamptz | null | Fim do trial |
| `grace_ends_at` | timestamptz | null | Fim do grace period (3 dias pós past_due) |
| `current_period_end` | timestamptz | null | Fim do ciclo de billing atual |
| `onboarding_state` | jsonb | `'{}'` | Estado do setup guiado |

Backfill: orgs com `plan != 'free'` → `subscription_status = 'active'`; orgs com `plan = 'free'` → `subscription_status = 'none'`.

### 3.2 Nova tabela: `usage_events` (append-only audit trail)

```sql
CREATE TABLE usage_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organizations(id),
  event_type    text NOT NULL,
    -- broadcast_credit_consumed, ai_request, automation_execution,
    -- proposal_generated, lead_created, whatsapp_message_sent
  quantity      integer NOT NULL DEFAULT 1,
  metadata      jsonb DEFAULT '{}',
    -- { campaign_id, lead_id, interaction_id, instance_name, ... }
  billing_cycle text NOT NULL,
    -- 'YYYY-MM' do ciclo em que o evento ocorreu
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_org_cycle ON usage_events (org_id, billing_cycle);
CREATE INDEX idx_usage_events_org_type_cycle ON usage_events (org_id, event_type, billing_cycle);
```

RLS: service_role full. authenticated SELECT WHERE `org_id` = own org.
Partitioning futuro por `billing_cycle` quando volume justificar.

### 3.3 Nova tabela: `usage_counters` (agregados para fast reads)

```sql
CREATE TABLE usage_counters (
  org_id        uuid NOT NULL REFERENCES organizations(id),
  billing_cycle text NOT NULL,  -- 'YYYY-MM'
  counter_key   text NOT NULL,
    -- broadcast_credits_used, ai_requests_used, automations_used,
    -- proposals_generated, leads_created, campaigns_created
  value         integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, billing_cycle, counter_key)
);
```

RLS: service_role full write. authenticated SELECT WHERE `org_id` = own org.

### 3.4 Nova tabela: `credit_balances` (saldo de packs pré-pagos)

```sql
CREATE TABLE credit_balances (
  org_id        uuid NOT NULL REFERENCES organizations(id),
  credit_type   text NOT NULL,
    -- broadcast_credits, ai_requests, automations
  balance       integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, credit_type)
);
```

RLS: service_role full write. authenticated SELECT WHERE `org_id` = own org.

Lógica de consumo: primeiro consome créditos inclusos do plano (via `usage_counters` < `plan_limits`), depois consome `credit_balances` de packs. Se ambos esgotados → bloqueio.

### 3.5 Nova tabela: `billing_events` (audit trail de Stripe)

```sql
CREATE TABLE billing_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id),
  event_type      text NOT NULL,
    -- checkout_completed, invoice_paid, invoice_failed,
    -- subscription_updated, subscription_canceled,
    -- trial_started, trial_will_end, trial_ended,
    -- pack_purchased, addon_activated, addon_canceled
  stripe_event_id text UNIQUE,
  payload         jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

RLS: service_role only.

### 3.6 Nova tabela: `addon_subscriptions` (add-ons recorrentes ativos)

```sql
CREATE TABLE addon_subscriptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL REFERENCES organizations(id),
  addon_key                   text NOT NULL REFERENCES _admin_addon_catalog(addon_key),
  quantity                    integer NOT NULL DEFAULT 1,
  stripe_subscription_item_id text,
  status                      text NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','canceled')),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  canceled_at                 timestamptz
);
```

RLS: service_role full. authenticated SELECT WHERE `org_id` = own org.

### 3.7 Adicionar `stripe_price_id` em `_admin_subscription_plans`

```sql
ALTER TABLE _admin_subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id text;
```

---

## 4. Modelo de Metering Final

### 4.1 Arquitetura de duas camadas

```
Ação no app
    │
    ├─► INSERT INTO usage_events (append-only, imutável, auditoria)
    │
    └─► UPSERT usage_counters SET value = value + N (fast read para enforcement)
```

- **`usage_events`**: source of truth granular. Cada disparo, cada request de IA, cada automação executada vira uma row. Permite recomputação, debugging, relatórios temporais.
- **`usage_counters`**: cache desnormalizado. Upsert atômico via RPC. Usado por `check_plan_limit` para decisão em <5ms. Se divergir, pode ser recomputado de `usage_events`.

### 4.2 RPC `record_usage(p_org_id, p_event_type, p_quantity, p_metadata)`

```sql
-- 1) Insere evento append-only
INSERT INTO usage_events (org_id, event_type, quantity, metadata, billing_cycle)
VALUES (p_org_id, p_event_type, p_quantity, p_metadata, to_char(now(), 'YYYY-MM'));

-- 2) Atualiza counter agregado
INSERT INTO usage_counters (org_id, billing_cycle, counter_key, value, updated_at)
VALUES (p_org_id, to_char(now(), 'YYYY-MM'), p_event_type || '_used', p_quantity, now())
ON CONFLICT (org_id, billing_cycle, counter_key)
DO UPDATE SET value = usage_counters.value + p_quantity, updated_at = now();
```

SECURITY DEFINER. Callable por service_role e authenticated (com org membership check).

### 4.3 RPC `check_plan_limit(p_org_id, p_limit_key, p_quantity DEFAULT 1)`

Retorna `jsonb { allowed: bool, current: int, projected: int, effective_max: int, pack_remaining: int }`.

**Parâmetro `p_quantity`:** quantidade que o caller quer consumir. Default 1 para checks simples (criar 1 instância, gerar 1 proposta). Para broadcast, o caller passa `p_quantity = recipientCount` para validar se há créditos suficientes para o envio inteiro antes de iniciar.

Lógica:
1. Lê `organizations.plan_limits → p_limit_key` → `plan_max`
2. Para limites absolutos (`max_leads`, `max_whatsapp_instances`, `max_members`): faz `COUNT(*)` na tabela correspondente + soma de add-ons recurring → `current`
3. Para limites de ciclo (`monthly_broadcast_credits`, `included_ai_requests_month`, `max_automations_month`, `max_proposals_month`, `max_campaigns_month`): lê `usage_counters` do ciclo atual → `current`
4. Soma `credit_balances` do tipo correspondente (para packs) → `pack_remaining`
5. `effective_max = plan_max + pack_remaining`
6. `projected = current + p_quantity`
7. Se `plan_max = -1` → `allowed = true` (ilimitado)
8. Se `projected > effective_max` → `allowed = false`
9. Se `projected <= effective_max` → `allowed = true`

**Exemplos de chamada:**
- `check_plan_limit(org_id, 'max_whatsapp_instances')` → p_quantity=1, verifica se pode criar +1
- `check_plan_limit(org_id, 'monthly_broadcast_credits', 200)` → verifica se pode enviar campanha para 200 destinatários
- `check_plan_limit(org_id, 'included_ai_requests_month')` → p_quantity=1, verifica se pode fazer +1 request IA
- `check_plan_limit(org_id, 'max_automations_month', 1)` → verifica se pode executar +1 automação

### 4.4 RPC `get_org_billing_info(p_org_id)`

Retorna `jsonb`:
```json
{
  "plan": "start",
  "plan_limits": { ... },
  "features": { ... },
  "subscription_status": "trialing",
  "trial_ends_at": "...",
  "grace_ends_at": null,
  "current_period_end": "...",
  "access_state": "full",
  "usage": {
    "broadcast_credits_used": 23,
    "ai_requests_used": 150,
    "automations_used": 1200,
    "proposals_generated": 8,
    "campaigns_created": 2,
    "leads_created": 45
  },
  "effective_limits": {
    "monthly_broadcast_credits": 1050,
    "included_ai_requests_month": 1500,
    "max_automations_month": 5000,
    "max_whatsapp_instances": 2,
    ...
  },
  "credit_balances": {
    "broadcast_credits": 1000,
    "ai_requests": 500,
    "automations": 0
  },
  "active_addons": [
    { "addon_key": "whatsapp_extra", "quantity": 1 }
  ]
}
```

**`access_state` computado (tabela completa de estados):**

| `subscription_status` | Condição extra | `access_state` | Comportamento |
|---|---|---|---|
| `none` | — | `blocked` | Org legacy sem billing. Vê SubscriptionRequiredScreen. |
| `pending_checkout` | — | `blocked` | Org criada, checkout não concluído. Vê BillingSetupWizard. |
| `trialing` | `trial_ends_at > now()` | `full` | Acesso completo durante trial. |
| `trialing` | `trial_ends_at <= now()` | `blocked` | Trial expirado. Cron seta `canceled`. |
| `active` | — | `full` | Pagante ativo. Acesso completo. |
| `past_due` | `grace_ends_at > now()` | `read_only` | Pagamento falhou, dentro do grace. Reads OK, writes bloqueados. |
| `past_due` | `grace_ends_at <= now()` | `blocked` | Grace expirado. Cron seta `unpaid`. |
| `canceled` | — | `blocked` | Assinatura cancelada (voluntário ou trial expirado). |
| `unpaid` | — | `blocked` | Inadimplente pós-grace. |

Nota: `pending_checkout` é estado transitório. Cron `pending-checkout-cleanup` limpa orgs paradas nesse estado há >48h atualizando para `canceled` (soft-delete). O valor `churned` **não** é um `subscription_status` — é gerenciado pela coluna separada `organizations.status` (que já possui `active`/`suspended`/`churned`). Não misturar os dois campos.

---

## 5. Fluxo de Signup + Checkout + Trial

### 5.1 Fluxo passo-a-passo

```
1. Visitante abre /pricing
2. Escolhe plano (Start/Pro/Scale)
3. Clica "Começar trial grátis" no card do plano
4. Redirect para /login?plan=start (ou signup form inline)
5. Usuário cria conta via supabase.auth.signUp()
6. Auth redirect → app detecta que user não tem org
7. NÃO chama bootstrapSelf automaticamente
   Em vez disso, renderiza <BillingSetupWizard plan={selectedPlan} />
8. BillingSetupWizard:
   a. Mostra resumo do plano
   b. Coleta org name (input)
   c. Chama edge function stripe-checkout:
      { plan_key, org_name, success_url: '/welcome', cancel_url: '/pricing' }
9. stripe-checkout edge function:
   a. Cria org via INSERT organizations (plan, subscription_status='pending_checkout')
   b. Cria membership (user → org, role=owner)
   c. Cria Stripe Customer (billing_email = user email)
   d. Cria Stripe Checkout Session:
      - mode: 'subscription'
      - line_items: [stripe_price_id do plano]
      - subscription_data.trial_period_days: 7
      - payment_method_collection: 'always'  ← CARTÃO OBRIGATÓRIO
      - metadata: { org_id, plan_key }
   e. Salva stripe_customer_id, stripe_checkout_session_id na org
   f. Retorna { checkout_url }
10. Frontend redirect → Stripe Checkout (hosted)
11. Usuário insere cartão + confirma
12. Stripe dispara webhook checkout.session.completed:
    a. stripe-webhook lê metadata.org_id e metadata.plan_key
    b. Copia plan_limits e features do catálogo para a org
    c. Set subscription_status = 'trialing'
    d. Set trial_started_at, trial_ends_at = now() + 7 days
    e. Set stripe_subscription_id, current_period_end
    f. Insert billing_events (event_type = 'checkout_completed')
    g. Insert billing_events (event_type = 'trial_started')
13. Stripe redirect → /welcome (success_url)
14. App carrega org via AuthContext → orgId resolvido → access_state = 'full'
15. Renderiza <OnboardingChecklist />
16. Após 7 dias: Stripe cobra cartão automaticamente
    a. Se pagamento OK → invoice.paid webhook → subscription_status = 'active'
    b. Se falha → invoice.payment_failed → subscription_status = 'past_due', grace_ends_at = now() + 3d
```

### 5.2 O que NÃO acontece

- NÃO existe `bootstrapSelf` criando org com trial "solto" sem cartão
- NÃO existe plano free como centro do produto
- NÃO existe trial sem checkout
- User sem org + sem checkout vê apenas `<BillingSetupWizard>`, nunca o app

### 5.3 Cancelamento pós-checkout sem completar

Se o user fechar o Checkout sem pagar:
- Org já foi criada com `subscription_status = 'pending_checkout'`
- `access_state` para `pending_checkout` = `'blocked'`
- Na próxima visita, app detecta `pending_checkout` → renderiza `<BillingSetupWizard>` novamente
- Cron cleanup: orgs com `subscription_status = 'pending_checkout'` há mais de 48h → set `subscription_status = 'canceled'` (a coluna `organizations.status` pode ser setada para `churned` separadamente pelo admin se desejado; o cron não mistura os dois campos)

---

## 6. Mapa de Enforcement por Arquivo

### 6.1 Backend (Edge Functions)

| Enforcement | Arquivo | Ponto exato | Ação |
|---|---|---|---|
| **Access state global** | `supabase/functions/_shared/billing.ts` (NOVO) | Helper `checkAccessState(supabase, orgId)` | Retorna `access_state`. Importado por todas as edge functions mutativas. |
| **WhatsApp instance limit** | `supabase/functions/whatsapp-connect/index.ts` | Antes do bloco `if (action === 'create')` (L165) | `check_plan_limit(org_id, 'max_whatsapp_instances')`. Se !allowed → 403 `PLAN_LIMIT_REACHED`. |
| **AI pipeline gate** | `supabase/functions/whatsapp-webhook/index.ts` | Antes de `supabase.functions.invoke('ai-pipeline-agent')` (L972) | `check_plan_limit(org_id, 'included_ai_requests_month')`. Se !allowed → skip invoke, log `ai_quota_exhausted`. Após invoke OK → `record_usage(org_id, 'ai_request', 1, {leadId, interactionId})`. |
| **Broadcast credits (disparo)** | `supabase/functions/broadcast-send/index.ts` ou hook de envio | Antes de processar destinatários | `check_plan_limit(org_id, 'monthly_broadcast_credits', recipientCount)`. Se !allowed → 403. Após envio → `record_usage(org_id, 'broadcast_credit_consumed', recipientCount, {campaignId})`. |
| **Campaign limit** | `src/hooks/useBroadcasts.ts` createCampaign (L638) + backend redundante | Antes de INSERT broadcast_campaigns | `check_plan_limit(org_id, 'max_campaigns_month')`. |
| **Proposal limit** | `supabase/functions/proposal-composer/index.ts` | Antes de gerar PDF | `check_plan_limit(org_id, 'max_proposals_month')`. Após OK → `record_usage(org_id, 'proposal_generated', 1)`. |
| **Lead creation limit** | `supabase/functions/whatsapp-webhook/index.ts` | Antes de `supabase.rpc('upsert_lead_canonical')` (L834) | `check_plan_limit(org_id, 'max_leads')`. Se !allowed → skip upsert, log `lead_limit_reached`. Após OK → `record_usage(org_id, 'lead_created', 1)`. |
| **Member invite limit** | `supabase/functions/org-admin/index.ts` | Action `invite_member` (L950) | `check_plan_limit(org_id, 'max_members')`. |
| **Automation metering** | `supabase/functions/process-reminders/index.ts` | Após processar cada reminder | `record_usage(org_id, 'automation_execution', 1, {reminderId})`. |
| **Blocked access** | Todas edge functions mutativas | Início do handler | `if (accessState === 'blocked') return 402 SUBSCRIPTION_REQUIRED`. |
| **Read-only access** | Todas edge functions mutativas | Início do handler | `if (accessState === 'read_only') return 402 BILLING_PAST_DUE`. Reads permitidos. |

### 6.2 Frontend (Hooks e Componentes)

| Enforcement | Arquivo | Ponto exato | Ação |
|---|---|---|---|
| **Global access gate** | `src/components/ProtectedRoute.tsx` | Após check de `orgStatus === 'suspended'` (L87) | Se `accessState === 'blocked'` → `<SubscriptionRequiredScreen>`. Se `read_only` → banner + disable mutations. |
| **Billing context** | `src/contexts/AuthContext.tsx` | Após `get_org_status` | Chamar `get_org_billing_info` → expor `subscriptionStatus`, `accessState`, `trialEndsAt` no contexto. |
| **Tab plan gating** | `src/components/solarzap/SolarZapNav.tsx` | `tabPermissions` | Adicionar `planGating`: tracking → Scale only. Tabs bloqueadas mostram lock icon + tooltip "Disponível no plano X". Tab SEMPRE visível, nunca escondida. |
| **WhatsApp create** | `src/hooks/useUserWhatsAppInstances.ts` | `createInstance()` (L246) | Pre-check `check_plan_limit` via RPC. Se !allowed → throw com metadata para UpgradeWall. |
| **Broadcast create** | `src/hooks/useBroadcasts.ts` | `createCampaign()` (L638) | Pre-check créditos de disparo. Se !allowed → throw para UpgradeWall ou PackPurchaseModal. |
| **Proposal create** | Hook/botão de nova proposta | Antes de chamar proposal-composer | Pre-check `max_proposals_month`. |
| **UpgradeWall** | `src/components/billing/UpgradeWall.tsx` (NOVO) | Renderizado quando hard limit atingido | Modal com plano atual, limite, comparação, CTA upgrade/pack. |
| **PackPurchaseModal** | `src/components/billing/PackPurchaseModal.tsx` (NOVO) | Renderizado quando crédito consumível esgotado | Modal com packs disponíveis, CTA comprar pack. |
| **UsageBar** | `src/components/billing/UsageBar.tsx` (NOVO) | Topo de views relevantes | Barra verde/amarelo/vermelho mostrando uso atual. |
| **PlanBadge** | `src/components/billing/PlanBadge.tsx` (NOVO) | Sidebar/header | Badge com plano, trial restante, past_due warning. |
| **BillingBanner** | `src/components/billing/BillingBanner.tsx` (NOVO) | Topo do app | Trial <3d: amarelo. Past due: vermelho. Grace countdown. |
| **Feature soft walls** | Em cada view bloqueada por plano | Dentro da view | A view é visível. Conteúdo mostra explicação da feature + badge "Plano Scale" + CTA upgrade. Nunca esconde a tab. |

---

## 7. Plano por Fases

### P0 — Catálogo e Add-on Catalog

**O que:** Atualizar `_admin_subscription_plans` com preços/limites definitivos. Criar `_admin_addon_catalog`. Adicionar `stripe_price_id` columns. Backfill `plan_limits` vazio de orgs free.

**Entregáveis:**
1. Migration `20260307000000_billing_catalog_v2.sql`:
   - UPDATE `_admin_subscription_plans`: rename `starter→start`, `business→scale`, atualizar `price_cents` (19900/29900/36900), `limits` e `features` conforme seção 2.1
   - Adicionar coluna `stripe_price_id` em `_admin_subscription_plans`
   - CREATE TABLE `_admin_addon_catalog` conforme seção 2.2
   - Seed dos 8 add-ons
   - UPDATE organizations SET `plan_limits` = (limits do plano free do catálogo) WHERE `plan = 'free'` AND `plan_limits = '{}'`

**Critérios de aceite:**
- `SELECT plan_key, price_cents, limits, features FROM _admin_subscription_plans` retorna 4 rows com preços e limites corretos
- `SELECT * FROM _admin_addon_catalog` retorna 8 rows
- `SELECT count(*) FROM organizations WHERE plan = 'free' AND plan_limits = '{}'` retorna 0
- Migration é idempotente (roda 2x sem erro)

**Rollback:**
- `DELETE FROM _admin_addon_catalog; DROP TABLE _admin_addon_catalog;`
- Reverter updates de `_admin_subscription_plans` para valores anteriores (free/starter/pro/business com preços originais)
- Remover coluna `stripe_price_id` de `_admin_subscription_plans`

---

### P1 — Modelo de Dados Billing + Metering

**O que:** Criar tabelas `usage_events`, `usage_counters`, `credit_balances`, `billing_events`, `addon_subscriptions`. Adicionar colunas billing em `organizations`. Criar RPCs `record_usage`, `check_plan_limit`, `get_org_billing_info`.

**Entregáveis:**
1. Migration `20260307100000_billing_data_model.sql`:
   - ALTER organizations: add `subscription_status`, `stripe_subscription_id`, `trial_started_at`, `trial_ends_at`, `grace_ends_at`, `current_period_end`, `onboarding_state`
   - CREATE TABLE `usage_events` (conforme 3.2)
   - CREATE TABLE `usage_counters` (conforme 3.3)
   - CREATE TABLE `credit_balances` (conforme 3.4)
   - CREATE TABLE `billing_events` (conforme 3.5)
   - CREATE TABLE `addon_subscriptions` (conforme 3.6)
   - RLS policies para todas as tabelas
   - Backfill: `subscription_status` de orgs existentes
2. Migration `20260307100001_billing_rpcs.sql`:
   - CREATE FUNCTION `record_usage(p_org_id, p_event_type, p_quantity, p_metadata)` (conforme 4.2)
   - CREATE FUNCTION `check_plan_limit(p_org_id, p_limit_key)` (conforme 4.3)
   - CREATE FUNCTION `get_org_billing_info(p_org_id)` (conforme 4.4)

**Critérios de aceite:**
- `\d usage_events` mostra schema correto com indexes
- `\d usage_counters` com PK composta
- `\d credit_balances` com PK composta
- `SELECT record_usage('org-id', 'ai_request', 1, '{}')` insere em `usage_events` E incrementa `usage_counters`
- `SELECT check_plan_limit('org-id', 'max_leads')` retorna `{allowed, current, projected, effective_max, pack_remaining}`
- `SELECT check_plan_limit('org-id', 'monthly_broadcast_credits', 200)` retorna `allowed=false` quando créditos insuficientes para 200 destinatários
- `SELECT get_org_billing_info('org-id')` retorna JSON completo com access_state
- Org com `plan_limits.max_leads = 300` e 300 leads → `check_plan_limit` retorna `allowed=false`
- Org com `plan_limits.max_leads = -1` → `check_plan_limit` retorna `allowed=true` independente do count
- `credit_balances` com 500 broadcast_credits + 50 do plano → effective max = 550

**Rollback:**
- DROP FUNCTION get_org_billing_info, check_plan_limit, record_usage CASCADE
- DROP TABLE addon_subscriptions, billing_events, credit_balances, usage_counters, usage_events CASCADE
- ALTER organizations DROP COLUMN subscription_status, trial_started_at, trial_ends_at, grace_ends_at, stripe_subscription_id, current_period_end, onboarding_state

---

### P2 — Integração Stripe

**O que:** Edge functions para checkout, webhook e portal. Criar org + Stripe customer + checkout session no signup. Processar webhooks para provisionar/desprovisionar.

**Entregáveis:**
1. `supabase/functions/stripe-checkout/index.ts` (conforme 5.1 step 9)
2. `supabase/functions/stripe-webhook/index.ts` (conforme 5.1 steps 12, 16)
3. `supabase/functions/stripe-portal/index.ts`
4. `supabase/functions/stripe-pack-checkout/index.ts` — one-time checkout para packs
5. `supabase/functions/_shared/stripe.ts` — Stripe client helper, signature verification
6. Secrets no Vault: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
7. `@stripe/stripe-js` no `package.json` frontend
8. Stripe import map em `supabase/functions/_shared/` (Deno)

**Critérios de aceite:**
- Checkout session criada com `trial_period_days: 7` e `payment_method_collection: 'always'`
- Webhook `checkout.session.completed` → org atualizada com `subscription_status='trialing'`, `plan_limits` copiados, `stripe_subscription_id` salvo
- Webhook `customer.subscription.updated` com status `past_due` → org `grace_ends_at = now() + 3d`
- Webhook `customer.subscription.deleted` → org `subscription_status='canceled'`, `plan='free'`
- Webhook `invoice.paid` → `billing_events` row criada, `grace_ends_at = null`
- Webhook `invoice.payment_failed` → `subscription_status='past_due'`, `billing_events` row
- Pack checkout (one-time) → após payment → `credit_balances` incrementado
- Webhook idempotente: mesmo `stripe_event_id` 2x → constraint UNIQUE impede duplicata
- Portal URL retornada corretamente

**Rollback:**
- Remover edge functions `stripe-checkout`, `stripe-webhook`, `stripe-portal`, `stripe-pack-checkout`
- Remover `@stripe/stripe-js` do `package.json`
- Remover secrets do Vault

---

### P3 — Enforcement Backend

**O que:** Adicionar gates de `access_state` e `check_plan_limit` em todas as edge functions mutativas.

**Entregáveis:**
1. `supabase/functions/_shared/billing.ts`:
   - `checkAccessState(supabase, orgId)` → retorna `access_state`
   - `enforcePlanLimit(supabase, orgId, limitKey)` → retorna `{allowed, current, max}` ou throws
   - `recordUsage(supabase, orgId, eventType, quantity, metadata)` → wrapper do RPC
2. Integração em `whatsapp-connect/index.ts` — gate em `action === 'create'`
3. Integração em `whatsapp-webhook/index.ts` — gate antes de `ai-pipeline-agent` invoke + metering
4. Integração em `whatsapp-webhook/index.ts` — gate antes de `upsert_lead_canonical` para lead limit
5. Integração em `org-admin/index.ts` — gate em `invite_member`
6. Integração em `proposal-composer/index.ts` — gate + metering
7. Integração em `process-reminders/index.ts` — metering de automações
8. Access state gate no início de todas as edge functions acima

**Critérios de aceite:**
- Org Start com 1 WhatsApp instance → criar 2a retorna 403 `PLAN_LIMIT_REACHED`
- Org Start com 300 leads → auto-create de lead via webhook retorna skip + log
- Org Start com 50 broadcast_credits usados neste mês + 0 pack balance → enviar broadcast retorna 403
- Org com `subscription_status='canceled'` → qualquer edge function mutativa retorna 402
- Org com `subscription_status='past_due'` e `grace_ends_at > now()` → reads OK, writes 402
- Cada ação metered cria row em `usage_events` E incrementa `usage_counters`
- AI invoke OK → `usage_events` row com `event_type='ai_request'` e metadata com leadId

**Rollback:**
- Reverter alterações em cada edge function (git revert dos arquivos modificados)
- Remover `_shared/billing.ts`

---

### P4 — Enforcement Frontend + UX

**O que:** Hook `useOrgBilling`, componentes de billing (UpgradeWall, PackPurchaseModal, UsageBar, PlanBadge, BillingBanner, SubscriptionRequiredScreen, OnboardingChecklist), pricing page, "Meu Plano", BillingSetupWizard.

**Entregáveis:**
1. `src/hooks/useOrgBilling.ts` — hook TanStack Query chamando `get_org_billing_info`
2. `src/components/billing/UpgradeWall.tsx` — modal para hard limits
3. `src/components/billing/PackPurchaseModal.tsx` — modal para comprar packs
4. `src/components/billing/UsageBar.tsx` — barra de progresso de uso
5. `src/components/billing/PlanBadge.tsx` — badge na sidebar
6. `src/components/billing/BillingBanner.tsx` — banner contextual trial/past_due
7. `src/components/billing/SubscriptionRequiredScreen.tsx` — tela full-page para blocked
8. `src/components/billing/BillingSetupWizard.tsx` — wizard pós-signup com checkout
9. `src/components/billing/OnboardingChecklist.tsx` — checklist revisitável
10. `src/pages/Pricing.tsx` — pricing grid pública
11. `src/pages/MyPlan.tsx` ou seção em ConfiguracoesContaView:
    - Plano atual, trial restante, próxima cobrança
    - Usage bars para cada recurso
    - Packs comprados / saldos restantes
    - CTA upgrade, CTA gerenciar assinatura (portal), CTA comprar pack
12. Integração em `ProtectedRoute.tsx` — accessState gate
13. Integração em `SolarZapNav.tsx` — plan gating com lock icon (tabs sempre visíveis)
14. Integração em `useUserWhatsAppInstances.ts`, `useBroadcasts.ts` — pre-flight checks
15. Rota `/pricing` em `App.tsx`
16. Feature soft walls: views bloqueadas por plano mostram conteúdo explicativo + badge do plano necessário + CTA

**Critérios de aceite:**
- User com trial ativo vê badge "Trial — X dias" na sidebar
- User com past_due vê banner vermelho com link para portal
- User com blocked vê `SubscriptionRequiredScreen` full-page com CTA
- Tentar criar WhatsApp no limite → UpgradeWall aparece com planos
- Tentar enviar broadcast sem créditos → PackPurchaseModal aparece com packs
- `/pricing` mostra 3 cards (Start/Pro/Scale) com preços corretos e CTA
- Meu Plano mostra usage bars, saldos, CTAs
- Tab Tracking mostra lock icon e tooltip "Disponível no Scale" para orgs Start/Pro
- Tab Tracking NUNCA some da nav — sempre visível com soft wall
- OnboardingChecklist aparece em /welcome e é acessível depois via settings

**Rollback:**
- Remover arquivos novos em `src/components/billing/`, `src/pages/Pricing.tsx`, `src/hooks/useOrgBilling.ts`
- Reverter alterações em ProtectedRoute, SolarZapNav, App.tsx, hooks

---

### P5 — Trial com Cartão, Crons, Migração Legacy

**O que:** Fluxo de signup com checkout obrigatório (conforme seção 5). Cron jobs para expiração de trial e grace. Script de migração de orgs legacy.

**Entregáveis:**
1. Modificar `AuthContext.tsx` + `ProtectedRoute.tsx`:
   - Detectar user sem org ou org com `subscription_status = 'pending_checkout'` → renderizar `BillingSetupWizard`
   - Remover (ou condicionar) chamada automática a `bootstrapSelf`
2. Modificar `org-admin/index.ts` `bootstrapSelf`:
   - Só é chamado pelo `stripe-checkout` (não mais pelo AuthContext)
   - Ou: `bootstrapSelf` ainda cria org, mas com `subscription_status = 'pending_checkout'` e plan_limits vazio → user fica bloqueado até completar checkout
3. Cron `trial-expiration-checker`:
   - Roda a cada hora (pg_cron ou Supabase scheduled function)
   - `WHERE subscription_status = 'trialing' AND trial_ends_at < now()`
   - Set `subscription_status = 'canceled'`, notificar via Resend
4. Cron `grace-period-checker`:
   - `WHERE subscription_status = 'past_due' AND grace_ends_at < now()`
   - Set `subscription_status = 'unpaid'`, notificar via Resend
5. Cron `pending-checkout-cleanup`:
   - `WHERE subscription_status = 'pending_checkout' AND created_at < now() - interval '48 hours'`
   - Soft-delete ou marcar `status = 'churned'`
6. Ação `migrate_legacy_orgs` em `admin-api/index.ts`:
   - Para cada org com `plan != 'free'` AND `stripe_customer_id IS NULL`:
     - Set `subscription_status = 'active'`, `grace_ends_at = now() + 30 days` (migração)
     - Enviar email "Configure pagamento em 30 dias"
   - Role: `super_admin`

**Critérios de aceite:**
- Novo signup sem completar checkout → vê apenas BillingSetupWizard, nunca o app
- Novo signup completando checkout → org com `subscription_status='trialing'`, acesso completo
- Trial de 7 dias expira → org `subscription_status='canceled'`, email enviado, user vê SubscriptionRequiredScreen
- Org past_due por >3d → `subscription_status='unpaid'`, email, blocked
- Orgs legacy migradas com grace de 30 dias
- bootstrapSelf NÃO cria trial "solto" (sem cartão)

**Rollback:**
- Reverter AuthContext e ProtectedRoute para flow anterior
- Reverter org-admin bootstrapSelf
- Remover cron jobs
- Reverter admin-api

---

### P6 — Observabilidade e Admin Billing

**O que:** Dashboard admin com billing real, timeline, alertas, controles.

**Entregáveis:**
1. Estender `FinancialPanel.tsx`:
   - MRR real (soma Stripe subscriptions ativas × preço)
   - Trial→Paid conversion rate
   - Churn rate real
   - Revenue por add-on e pack
2. Tab "Billing" no admin org details:
   - Timeline de `billing_events`
   - Link para Stripe Dashboard (via customer_id)
   - Usage counters do mês
   - Credit_balances
   - Ações: conceder trial extra, estender grace, forçar downgrade, grant credits
3. Dashboard de alertas:
   - Orgs `past_due` > 24h
   - Orgs trial expirando em < 48h
   - Orgs com uso > 90% de algum limite
4. Admin action para vincular `stripe_price_id` aos planos

**Critérios de aceite:**
- Admin vê MRR calculado de subscriptions ativas reais
- Admin vê timeline de billing_events por org
- Admin pode conceder trial extra (update trial_ends_at)
- Admin pode grant credits manualmente
- Alertas mostram orgs relevantes

**Rollback:**
- Reverter FinancialPanel.tsx
- Remover componentes admin billing novos

---

## 8. Arquivos Impactados (Mapa Completo)

**Novos:**
- `supabase/migrations/20260307000000_billing_catalog_v2.sql`
- `supabase/migrations/20260307100000_billing_data_model.sql`
- `supabase/migrations/20260307100001_billing_rpcs.sql`
- `supabase/functions/stripe-checkout/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/stripe-portal/index.ts`
- `supabase/functions/stripe-pack-checkout/index.ts`
- `supabase/functions/_shared/billing.ts`
- `supabase/functions/_shared/stripe.ts`
- `src/hooks/useOrgBilling.ts`
- `src/components/billing/UpgradeWall.tsx`
- `src/components/billing/PackPurchaseModal.tsx`
- `src/components/billing/UsageBar.tsx`
- `src/components/billing/PlanBadge.tsx`
- `src/components/billing/BillingBanner.tsx`
- `src/components/billing/SubscriptionRequiredScreen.tsx`
- `src/components/billing/BillingSetupWizard.tsx`
- `src/components/billing/OnboardingChecklist.tsx`
- `src/pages/Pricing.tsx`

**Modificados:**
- `supabase/functions/whatsapp-connect/index.ts` — access gate + instance limit on create (L165)
- `supabase/functions/whatsapp-webhook/index.ts` — access gate + AI quota (L972) + lead limit (L834) + metering
- `supabase/functions/org-admin/index.ts` — bootstrap flow change + member limit on invite (L950)
- `supabase/functions/admin-api/index.ts` — migrate_legacy_orgs + manage_stripe_prices + billing admin actions
- `supabase/functions/proposal-composer/index.ts` — proposal limit + metering
- `supabase/functions/process-reminders/index.ts` — automation metering
- `src/components/ProtectedRoute.tsx` — accessState gate + BillingSetupWizard redirect
- `src/contexts/AuthContext.tsx` — expose billing info + remove auto-bootstrap
- `src/components/solarzap/SolarZapNav.tsx` — plan gating (lock icons, never hide tabs)
- `src/components/solarzap/SolarZapLayout.tsx` — billing banner + usage bars
- `src/components/solarzap/ConfiguracoesContaView.tsx` — "Meu Plano" section
- `src/hooks/useUserWhatsAppInstances.ts` — pre-create limit check (L246)
- `src/hooks/useBroadcasts.ts` — pre-create credit check (L638)
- `src/components/admin/FinancialPanel.tsx` — real billing data
- `src/App.tsx` — add `/pricing` + `/welcome` routes
- `package.json` — add `@stripe/stripe-js`

---

## 9. Decisões Travadas

| Decisão | Escolha | Motivo |
|---|---|---|
| **Preços** | Start R$199 / Pro R$299 / Scale R$369 | Decisão comercial fechada. Não negociável. |
| **Não existe plano free público** | Trial 7d com cartão é a porta de entrada | Evita freeloaders. Revenue desde dia 8. |
| **Disparo = crédito por destinatário** | 50 / 200 / 1.000 inclusos/mês + packs | Cobra pela utilização real, não por "campanha". |
| **Packs pré-pagos (não recorrentes)** | IA 1K/5K/20K, Disparo 1K/5K/25K, Automações 10K | Consumidor compra quando precisa. Saldo carryover. Sem surpresa recorrente. |
| **WhatsApp extra recorrente** | R$59,90/mês cada | Único add-on recorrente. Reflete custo infra. |
| **Tracking avançado somente Scale** | Start e Pro não têm | Diferenciação premium. |
| **Stripe Checkout hosted** | Não Elements | PCI, trial nativo, menor código. |
| **Cartão obrigatório na entrada** | `payment_method_collection: 'always'` | Sem trial solto. |
| **Metering 2 camadas** | `usage_events` + `usage_counters` | Events: audit/recompute. Counters: fast enforcement. |
| **plan_limits inline em organizations** | Cópia do catálogo, atualizada por webhook | Performance: zero JOIN em check_plan_limit. |
| **Grace period 3 dias** | past_due → read_only por 3d → blocked | Minimiza churn por cartão expirado. |
| **Tabs sempre visíveis** | Lock icon + soft wall, nunca esconder | Feature discovery. Motiva upgrade. |
| **OnboardingChecklist revisitável** | Persistido em onboarding_state, acessível em settings | Setup guiado no primeiro acesso + referência futura. |
