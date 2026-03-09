# Billing Blueprint v2 — Gap Analysis & Plano de Ação

> Gerado em 2026-03-08 por auditoria completa do codebase vs Blueprint Definitivo v2.

---

## SUMÁRIO EXECUTIVO

| Fase | Completude | Severidade dos Gaps |
|------|-----------|---------------------|
| **P0 — Catálogo + Add-on Catalog** | 95% | Baixa |
| **P1 — Modelo de Dados + RPCs** | 90% | **CRÍTICA** (RPC call signature quebrada) |
| **P2 — Integração Stripe** | 50% | **CRÍTICA** (trial ausente, idempotência ausente) |
| **P3 — Enforcement Backend** | 40% | **CRÍTICA** (limit keys erradas, 2 gates ausentes, record_usage quebrado) |
| **P4 — Enforcement Frontend + UX** | 15% | Alta (0 de 8 componentes billing, sem banner/wall/badge) |
| **P5 — Trial c/ Cartão, Crons, Legacy** | 20% | **CRÍTICA** (bootstrapSelf não condicionado, fluxo trial não funciona) |
| **P6 — Observabilidade + Admin Billing** | 30% | Média |

---

## 1. P0 — CATÁLOGO + ADD-ON CATALOG

### O que está OK ✅

- `_admin_subscription_plans` existe com 4 planos (free/start/pro/scale)
- Limites e features JSONB corretos para todos os planos
- Preços corretos: free=0, start=19900, pro=29900, scale=36900
- `stripe_price_id` column adicionada
- `_admin_addon_catalog` existe com os 8 add-ons corretos
- Preços dos add-ons corretos
- Rename starter→start e business→scale feito
- Backfill de `plan_limits` vazio para orgs free feito

### Gaps

| # | Gap | Severidade | Detalhes |
|---|-----|-----------|---------|
| P0.1 | `stripe_price_id` vazio em todos os planos | Bloqueante para P2 | Column existe mas nunca foi preenchida com IDs reais do Stripe |
| P0.2 | `stripe_price_id` vazio em todos os add-ons | Bloqueante para P2 | Mesma situação |

### Ações

| # | Ação | Tipo |
|---|------|------|
| P0-A1 | Criar produtos/prices no Stripe Dashboard (ou via API) para os 3 planos pagos + 8 add-ons | Manual/Script |
| P0-A2 | UPDATE `_admin_subscription_plans` SET `stripe_price_id` para cada plano | SQL |
| P0-A3 | UPDATE `_admin_addon_catalog` SET `stripe_price_id` para cada add-on | SQL |

---

## 2. P1 — MODELO DE DADOS + METERING

### O que está OK ✅

- Todas as 5 tabelas criadas: `usage_events`, `usage_counters`, `credit_balances`, `billing_events`, `addon_subscriptions`
- Schemas conferem com blueprint
- RLS policies corretas
- 7 colunas billing adicionadas em `organizations` (subscription_status, stripe_subscription_id, trial_started_at, trial_ends_at, grace_ends_at, current_period_end, onboarding_state)
- CHECK constraint correto com os 7 estados
- Backfill de subscription_status feito
- RPCs `record_usage`, `check_plan_limit`, `get_org_billing_info` criados
- Helpers auxiliares (billing_current_cycle, billing_compute_access_state, etc.) criados
- `check_plan_limit` diferencia limites absolutos vs ciclo
- `check_plan_limit` suporta `-1` como ilimitado
- `check_plan_limit` soma credit_balances + recurring add-ons no effective_max
- `get_org_billing_info` retorna JSON completo com access_state, usage, effective_limits, credit_balances, active_addons
- Tabelas extras (stripe_customers, org_billing_timeline, billing_alerts) criadas na migração P2-P6 incremental
- Funções sync_org_access_state e migrate_legacy_org_to_trial criadas

### Gaps

| # | Gap | Severidade | Detalhes |
|---|-----|-----------|---------|
| P1.1 | RPC `record_usage` aceita 4 params (p_org_id, p_event_type, p_quantity, p_metadata) mas `_shared/billing.ts` passa 7 params incluindo p_user_id, p_lead_id, p_source que **NÃO EXISTEM** no RPC | **🔴 CRÍTICA** | **Todas as chamadas record_usage falham silenciosamente.** Nenhum metering está funcionando em produção. |
| P1.2 | Nenhuma verificação de membership no RPC `record_usage` para chamadas authenticated | Baixa | Blueprint menciona "with org membership check" mas o RPC é SECURITY DEFINER sem check. Aceitável se só chamado por service_role. |

### Ações

| # | Ação | Tipo |
|---|------|------|
| P1-A1 | **URGENTE:** Atualizar o RPC `record_usage` para aceitar os params extras (p_user_id, p_lead_id, p_source) e gravá-los no metadata/colunas — **OU** — atualizar `_shared/billing.ts` para remover os params extras e incluir user_id/lead_id/source dentro do p_metadata jsonb | Migration SQL + Código |
| P1-A2 | Testar que após fix, `record_usage` efetivamente insere em `usage_events` e atualiza `usage_counters` | Validação |

---

## 3. P2 — INTEGRAÇÃO STRIPE

### O que está OK ✅

- `stripe-checkout/index.ts` existe. Cria Stripe Customer se não existir, cria checkout session, retorna checkout_url
- `stripe-webhook/index.ts` existe. Processa checkout.session.completed, customer.subscription.updated, invoice.payment_failed, invoice.payment_succeeded
- `stripe-portal/index.ts` existe e funciona
- `stripe-pack-checkout/index.ts` existe. Cria checkout one-time para packs
- `_shared/stripe.ts` existe (getStripeClient, getStripeWebhookSecret, resolveAppUrl)
- `_shared/billing.ts` existe (checkLimit, recordUsage, appendBillingTimeline)

### Gaps

| # | Gap | Severidade | Detalhes |
|---|-----|-----------|---------|
| P2.1 | `stripe-checkout` **NÃO cria org nem membership** | **🔴 CRÍTICA** | Blueprint diz: checkout deve criar org com subscription_status='pending_checkout' + membership role=owner. Implementação atual exige org pré-existente. |
| P2.2 | `stripe-checkout` **NÃO define trial_period_days: 7** | **🔴 CRÍTICA** | Checkout session criada sem trial. Stripe cobrará imediatamente no dia 0 em vez de após 7 dias. |
| P2.3 | `stripe-checkout` **NÃO define payment_method_collection: 'always'** | **🔴 CRÍTICA** | Cartão pode não ser obrigatório na entrada dependendo das configs do Stripe. |
| P2.4 | `stripe-webhook` no evento `checkout.session.completed`: seta `subscription_status='active'` em vez de `'trialing'` | **🔴 CRÍTICA** | Trial de 7 dias não funciona — org vira "active" imediatamente ao invés de "trialing". |
| P2.5 | `stripe-webhook` **NÃO seta trial_started_at e trial_ends_at** no checkout.session.completed | **🔴 CRÍTICA** | Campos de trial nunca são preenchidos. |
| P2.6 | `stripe-webhook` **SEM IDEMPOTÊNCIA** — não verifica stripe_event_id UNIQUE antes de processar | **🔴 CRÍTICA** | Webhook retry do Stripe pode duplicar créditos de packs, mudar status incorretamente. |
| P2.7 | `stripe-webhook` no pack purchase: grava com `expires_at = +12 meses` | Baixa | Blueprint diz "saldo persiste entre ciclos, não expira". Não é um blocker funcional mas diverge da spec. |
| P2.8 | `stripe-checkout` NÃO copia plan_limits e features do catálogo para a org | Alta | Blueprint: ao completar checkout, copiar limites/features para organizations. |
| P2.9 | `@stripe/stripe-js` ausente do `package.json` | Média | Não necessário se todo checkout é via hosted page + redirect, mas blueprint pede. |

### Ações

| # | Ação | Tipo | Prioridade |
|---|------|------|-----------|
| P2-A1 | Reescrever `stripe-checkout/index.ts`: aceitar `org_name`, criar org + membership, set `subscription_status='pending_checkout'`, adicionar `subscription_data: { trial_period_days: 7 }` e `payment_method_collection: 'always'` na session | Código | P0 |
| P2-A2 | Corrigir `stripe-webhook` evento `checkout.session.completed`: setar `subscription_status='trialing'`, `trial_started_at=now()`, `trial_ends_at=now()+7d`, copiar plan_limits e features do catálogo | Código | P0 |
| P2-A3 | Adicionar idempotência no `stripe-webhook`: verificar `billing_events.stripe_event_id` UNIQUE antes de processar, retornar 200 se já processado | Código | P0 |
| P2-A4 | Remover `expires_at` do pack purchase ou setar como null | Código | P2 |
| P2-A5 | Avaliar se `@stripe/stripe-js` é necessário ou se hosted checkout basta | Decisão | P3 |

---

## 4. P3 — ENFORCEMENT BACKEND

### O que está OK (parcialmente) ✅

- `whatsapp-connect`: tem checkLimit antes de create + recordUsage após (✅ funcional se limit key corrigida)
- `proposal-composer`: tem checkLimit antes de gerar PDF + recordUsage após (✅ funcional se limit key corrigida)
- `process-reminders`: tem checkLimit antes de enviar + recordUsage após (✅ funcional se limit key corrigida)

### Gaps

| # | Gap | Severidade | Detalhes |
|---|-----|-----------|---------|
| P3.1 | **Limit keys usadas não correspondem ao catálogo** | **🔴 CRÍTICA** | Código usa: `whatsapp_instances`, `proposals_monthly`, `messages_monthly`. Blueprint/catálogo usa: `max_whatsapp_instances`, `max_proposals_month`. `messages_monthly` NÃO EXISTE no catálogo. `check_plan_limit` provavelmente retorna `allowed=true` por default quando key não reconhecida. **Zero enforcement funciona.** |
| P3.2 | **Event types usados não correspondem ao blueprint** | **🔴 CRÍTICA** | Código: `whatsapp_instances`, `proposals_monthly`, `messages_monthly`. Blueprint: `broadcast_credit_consumed`, `ai_request`, `automation_execution`, `proposal_generated`, `lead_created`, `whatsapp_message_sent`. Mesmo que record_usage fosse chamado com sucesso, counters ficariam em keys erradas e check_plan_limit não os encontraria. |
| P3.3 | **`whatsapp-webhook` sem gate em lead creation** | **🔴 CRÍTICA** | `resolveLeadCanonicalId` (linha ~626) cria leads sem checkLimit('max_leads'). Org Start com 300 leads ultrapassaria silenciosamente. |
| P3.4 | **`whatsapp-webhook` sem gate em AI pipeline** | **🔴 CRÍTICA** | `ai-pipeline-agent` (linha ~1013) invocado fire-and-forget sem checkLimit('included_ai_requests_month'). Sem metering de ai_request. |
| P3.5 | **`org-admin` sem gate em invite_member** | Alta | Não verifica `max_members` antes de convidar membro. |
| P3.6 | **`whatsapp-webhook` sem metering de lead_created** | Alta | Nenhum recordUsage('lead_created') após resolução de lead. |
| P3.7 | **Broadcast send sem gate de créditos** | Alta | Blueprint exige checkLimit('monthly_broadcast_credits', recipientCount) antes de enviar broadcast. Não implementado no backend. |
| P3.8 | **Access state gate ausente na maioria das edge functions** | Alta | Blueprint exige check de accessState (blocked → 402, read_only → 402 para writes) no início de TODAS as edge functions mutativas. Só whatsapp-connect verifica. |
| P3.9 | **recordUsage quebrado (ver P1.1)** | **🔴 CRÍTICA** | Mesmo onde exists, não funciona por mismatch de params. |

### Ações

| # | Ação | Tipo | Prioridade |
|---|------|------|-----------|
| P3-A1 | Corrigir TODAS as limit keys para corresponder ao catálogo: `whatsapp_instances`→`max_whatsapp_instances`, `proposals_monthly`→`max_proposals_month`, `messages_monthly`→ remover ou mapear | Código (5 arquivos) | P0 |
| P3-A2 | Corrigir TODOS os event types para corresponder ao blueprint: `whatsapp_instances`→ N/A (absoluto, não precisa de event), `proposals_monthly`→`proposal_generated`, `messages_monthly`→`whatsapp_message_sent` | Código (5 arquivos) | P0 |
| P3-A3 | Corrigir `_shared/billing.ts` recordUsage() — alinhar params com o RPC (ver P1-A1) | Código | P0 |
| P3-A4 | Adicionar gate em `whatsapp-webhook` antes de resolveLeadCanonicalId: `checkLimit(org_id, 'max_leads')`. Se !allowed → skip upsert, logar `lead_limit_reached` | Código | P0 |
| P3-A5 | Adicionar gate em `whatsapp-webhook` antes de ai-pipeline-agent invoke: `checkLimit(org_id, 'included_ai_requests_month')`. Se !allowed → skip, logar `ai_quota_exhausted`. Após invoke OK → `recordUsage('ai_request')` | Código | P0 |
| P3-A6 | Adicionar gate em `org-admin` na action `invite_member`: `checkLimit(org_id, 'max_members')`. Se !allowed → 403 | Código | P1 |
| P3-A7 | Implementar gate de broadcast credits no backend (broadcast-send ou hook equivalente): `checkLimit(org_id, 'monthly_broadcast_credits', recipientCount)` | Código | P1 |
| P3-A8 | Adicionar access state gate (`checkAccessState`) no início de TODAS as edge functions mutativas: whatsapp-connect, whatsapp-webhook, org-admin, proposal-composer, process-reminders | Código (5 arquivos) | P1 |

---

## 5. P4 — ENFORCEMENT FRONTEND + UX

### O que está OK ✅

- `useOrgBilling.ts` existe com useOrgBillingInfo(), createPlanCheckoutSession(), createPackCheckoutSession(), createBillingPortalSession()
- `ProtectedRoute.tsx` verifica accessState e redireciona para /pricing quando blocked
- `SolarZapNav.tsx` aceita lockedTabs e mostra indicador visual de lock em tabs
- `useUserWhatsAppInstances.ts` tem pre-check via check_plan_limit (linha 260)
- `useBroadcasts.ts` tem pre-check via check_plan_limit (linha 648)
- `Pricing.tsx` existe, carrega planos do DB, tem seção de packs
- Rota `/pricing` configurada no App.tsx

### Gaps

| # | Gap | Severidade | Detalhes |
|---|-----|-----------|---------|
| P4.1 | **Diretório `src/components/billing/` NÃO EXISTE** | Alta | 0 de 8 componentes billing criados |
| P4.2 | `UpgradeWall.tsx` não existe | Alta | Modal para quando hard limit atingido — plano atual, comparação, CTA upgrade |
| P4.3 | `PackPurchaseModal.tsx` não existe | Alta | Modal para comprar packs quando crédito esgotado |
| P4.4 | `UsageBar.tsx` não existe | Média | Barra de progresso de uso (verde/amarelo/vermelho) |
| P4.5 | `PlanBadge.tsx` não existe | Média | Badge na sidebar com plano, trial restante, past_due warning |
| P4.6 | `BillingBanner.tsx` não existe | Alta | Banner no topo: trial <3d amarelo, past_due vermelho, grace countdown |
| P4.7 | `SubscriptionRequiredScreen.tsx` não existe | Alta | Tela full-page para blocked (atualmente redireciona para /pricing) |
| P4.8 | `BillingSetupWizard.tsx` não existe | **🔴 CRÍTICA** | Wizard pós-signup com org name + checkout. Sem ele, fluxo de signup→billing não funciona. |
| P4.9 | `OnboardingChecklist.tsx` não existe | Média | Checklist revisitável pós-primeiro acesso |
| P4.10 | `MyPlan.tsx` ou seção "Meu Plano" em ConfiguracoesContaView não existe | Alta | Plano atual, usage bars, saldos, CTAs upgrade/portal/pack |
| P4.11 | Rota `/welcome` não existe | Média | Success URL após checkout |
| P4.12 | `AuthContext.tsx` NÃO expõe billing state | Alta | Deveria expor subscriptionStatus, accessState, trialEndsAt |
| P4.13 | `Pricing.tsx` mostra 4 planos incluindo "free" | Baixa | Blueprint: "Não existe plano free público". Pricing deveria mostrar só 3 pagos. |
| P4.14 | `Pricing.tsx` sem tabela de comparação de features | Média | Blueprint pede feature comparison grid |
| P4.15 | `useBroadcasts.ts` usa limit key errada: `broadcasts_monthly` | **🔴 CRÍTICA** | Deveria ser `monthly_broadcast_credits` ou `max_campaigns_month` |
| P4.16 | `useUserWhatsAppInstances.ts` usa limit key errada: `whatsapp_instances` | **🔴 CRÍTICA** | Deveria ser `max_whatsapp_instances` |
| P4.17 | ProtectedRoute NÃO trata `read_only` (banner + disable mutations) | Alta | Só trata `blocked`; `read_only` passa como se fosse `full` |
| P4.18 | ProtectedRoute NÃO trata `pending_checkout` → BillingSetupWizard | **🔴 CRÍTICA** | Sem isso, user que criou conta mas não fez checkout vê app normal |
| P4.19 | SolarZapNav tooltip genérico "(bloqueado pelo plano)" | Baixa | Deveria dizer "Disponível no plano X" com nome do plano |
| P4.20 | Feature soft walls em views bloqueadas por plano não implementadas | Alta | A view deveria mostrar conteúdo explicativo + badge do plano + CTA. Atualmente nenhuma view tem soft wall. |
| P4.21 | `SolarZapLayout.tsx` sem billing banner e usage bars | Média | Blueprint pede banner e usage bars dentro do layout |

### Ações

| # | Ação | Tipo | Prioridade |
|---|------|------|-----------|
| P4-A1 | Criar diretório `src/components/billing/` | Código | P0 |
| P4-A2 | Criar `BillingSetupWizard.tsx` — wizard com org name input + chamada stripe-checkout + redirect | Código | P0 |
| P4-A3 | Criar `SubscriptionRequiredScreen.tsx` — tela blocked com CTA | Código | P0 |
| P4-A4 | Criar `BillingBanner.tsx` — banner trial/past_due | Código | P1 |
| P4-A5 | Criar `UpgradeWall.tsx` — modal para hard limit atingido | Código | P1 |
| P4-A6 | Criar `PackPurchaseModal.tsx` — modal para comprar packs | Código | P1 |
| P4-A7 | Criar `UsageBar.tsx` — barra de progresso | Código | P2 |
| P4-A8 | Criar `PlanBadge.tsx` — badge na sidebar | Código | P2 |
| P4-A9 | Criar `OnboardingChecklist.tsx` | Código | P2 |
| P4-A10 | Criar seção "Meu Plano" em ConfiguracoesContaView (ou rota separada) | Código | P1 |
| P4-A11 | Corrigir limit keys nos hooks frontend (P4.15, P4.16) | Código | P0 |
| P4-A12 | ProtectedRoute: tratar `read_only` com banner + disable mutations | Código | P1 |
| P4-A13 | ProtectedRoute: tratar `pending_checkout` → BillingSetupWizard | Código | P0 |
| P4-A14 | AuthContext: expor billing fields (subscriptionStatus, accessState, trialEndsAt) | Código | P1 |
| P4-A15 | Pricing.tsx: filtrar plano "free", mostrar só 3 pagos, adicionar feature comparison | Código | P1 |
| P4-A16 | Adicionar rota `/welcome` em App.tsx | Código | P2 |
| P4-A17 | Implementar feature soft walls nas views bloqueadas por plano | Código | P2 |
| P4-A18 | Integrar BillingBanner e UsageBar no SolarZapLayout | Código | P2 |

---

## 6. P5 — TRIAL COM CARTÃO, CRONS, LEGACY

### O que está OK ✅

- Função `sync_org_access_state()` existe no DB para expirar trials e grace periods
- Função `migrate_legacy_org_to_trial()` existe para onboarding de orgs legacy

### Gaps

| # | Gap | Severidade | Detalhes |
|---|-----|-----------|---------|
| P5.1 | **`bootstrapSelf` ainda chamado automaticamente** | **🔴 CRÍTICA** | AuthContext l.492-552 chama bootstrapSelf ao detectar membership ausente. Blueprint: remover ou condicionar. Sem essa mudança, novos users ganham org funcional sem checkout. |
| P5.2 | `sync_org_access_state()` existe mas **nenhum cron a invoca** | **🔴 CRÍTICA** | Trials expirados nunca são movidos para `canceled`. Grace periods expirados nunca viram `unpaid`. |
| P5.3 | Cron `pending-checkout-cleanup` não implementado | Alta | Orgs paradas em `pending_checkout` >48h nunca são limpas. |
| P5.4 | Notificações por email (trial expirando, past_due, etc.) não implementadas | Média | Blueprint pede envio via Resend em cada transição. |
| P5.5 | **Fluxo de signup não redirecionada para BillingSetupWizard** | **🔴 CRÍTICA** | Depende de P4-A2 (BillingSetupWizard) e P4-A13 (ProtectedRoute) |
| P5.6 | `migrate_legacy_orgs` action em admin-api não implementada | Média | Ação admin para migrar orgs legacys. Função SQL existe mas endpoint admin ausente. |

### Ações

| # | Ação | Tipo | Prioridade |
|---|------|------|-----------|
| P5-A1 | Condicionar `bootstrapSelf` em AuthContext: se user sem org, redirecionar para BillingSetupWizard em vez de criar org automaticamente | Código | P0 |
| P5-A2 | Criar cron job que invoca `sync_org_access_state()` a cada hora (pg_cron SQL ou Supabase scheduled function) | SQL/Config | P0 |
| P5-A3 | Criar cron `pending-checkout-cleanup` (SQL): orgs pending_checkout >48h → canceled | SQL | P1 |
| P5-A4 | Implementar notificações email via Resend para trial expiring, past_due, blocked | Código | P2 |
| P5-A5 | Adicionar action `migrate_legacy_orgs` em admin-api | Código | P2 |

---

## 7. P6 — OBSERVABILIDADE + ADMIN BILLING

### O que está OK ✅

- `FinancialPanel.tsx` existe com KPIs, distribuição por plano, revenue
- Admin API tem `get_billing_info` e `billing_admin_action`
- Tabela `billing_alerts` existe
- Tabela `org_billing_timeline` existe

### Gaps

| # | Gap | Severidade | Detalhes |
|---|-----|-----------|---------|
| P6.1 | FinancialPanel usa plan keys antigos (free/starter/pro/business) nos PLAN_COLORS | Baixa | Deveria ser free/start/pro/scale |
| P6.2 | Tab "Billing" no admin org details não implementada | Média | Timeline, Stripe link, usage, credits, ações |
| P6.3 | Dashboard de alertas não implementado | Média | Orgs past_due, trial expirando, uso >90% |
| P6.4 | Admin action para vincular stripe_price_id via UI inexistente | Baixa | Pode ser feito por SQL por enquanto |
| P6.5 | Admin actions (conceder trial extra, grant credits) via UI inexistentes | Média | Funções SQL existem mas UI não |

### Ações

| # | Ação | Tipo | Prioridade |
|---|------|------|-----------|
| P6-A1 | Atualizar PLAN_COLORS/PLAN_LABELS no FinancialPanel para keys corretas | Código | P1 |
| P6-A2 | Criar tab "Billing" no OrgDetails com timeline + stats + ações | Código | P2 |
| P6-A3 | Criar dashboard de alertas billing | Código | P3 |
| P6-A4 | Criar UI admin para grant credits / extend trial | Código | P3 |

---

## PLANO DE AÇÃO — ORDEM DE EXECUÇÃO

### 🔴 Sprint 1: Corrigir o que está QUEBRADO (sem nada novo funcionar até resolver)

**Meta: fazer o que já foi codado realmente funcionar.**

| # | Ação | Fase | Arquivos |
|---|------|------|---------|
| 1 | **Fix RPC `record_usage` ou `_shared/billing.ts`**: alinhar assinatura de params. Opção recomendada: alterar `_shared/billing.ts` para enviar user_id/lead_id/source via p_metadata jsonb em vez de params separados. | P1 | `supabase/functions/_shared/billing.ts` |
| 2 | **Fix limit keys em TODAS as edge functions**: `whatsapp_instances`→`max_whatsapp_instances`, `proposals_monthly`→`max_proposals_month`, remover/substituir `messages_monthly` | P3 | `supabase/functions/whatsapp-connect/index.ts`, `proposal-composer/index.ts`, `process-reminders/index.ts`, `whatsapp-webhook/index.ts` |
| 3 | **Fix event types em TODAS as edge functions**: `proposals_monthly`→`proposal_generated`, `messages_monthly`→`whatsapp_message_sent` para webhook, `automation_execution` para reminders | P3 | Mesmos arquivos acima |
| 4 | **Fix limit keys nos hooks frontend**: `whatsapp_instances`→`max_whatsapp_instances` em useUserWhatsAppInstances.ts, `broadcasts_monthly`→`monthly_broadcast_credits` em useBroadcasts.ts | P4 | `src/hooks/useUserWhatsAppInstances.ts`, `src/hooks/useBroadcasts.ts` |
| 5 | **Adicionar idempotência no stripe-webhook**: check `billing_events.stripe_event_id` UNIQUE antes de processar. Se já existe → return 200. | P2 | `supabase/functions/stripe-webhook/index.ts` |

### 🟠 Sprint 2: Corrigir o fluxo de checkout + trial

**Meta: signup → checkout → trial funcionar end-to-end.**

| # | Ação | Fase | Arquivos |
|---|------|------|---------|
| 6 | **Reescrever stripe-checkout**: aceitar org_name, criar org + membership, subscription_status='pending_checkout', trial_period_days:7, payment_method_collection:'always' | P2 | `supabase/functions/stripe-checkout/index.ts` |
| 7 | **Fix stripe-webhook checkout.session.completed**: setar 'trialing' (não 'active'), preencher trial_started_at/trial_ends_at, copiar plan_limits/features do catálogo | P2 | `supabase/functions/stripe-webhook/index.ts` |
| 8 | **Criar `BillingSetupWizard.tsx`**: wizard com org name + plan summary + chamada stripe-checkout | P4 | `src/components/billing/BillingSetupWizard.tsx` |
| 9 | **Criar `SubscriptionRequiredScreen.tsx`**: tela full-page para blocked | P4 | `src/components/billing/SubscriptionRequiredScreen.tsx` |
| 10 | **ProtectedRoute: tratar pending_checkout → BillingSetupWizard, blocked → SubscriptionRequiredScreen** | P4/P5 | `src/components/ProtectedRoute.tsx` |
| 11 | **Condicionar bootstrapSelf**: não criar org automaticamente sem checkout | P5 | `src/contexts/AuthContext.tsx` |
| 12 | **Criar cron sync_org_access_state**: pg_cron a cada hora | P5 | Migration SQL |
| 13 | **Preencher stripe_price_id nos planos e add-ons** | P0 | Migration SQL ou admin action |

### 🟡 Sprint 3: Gates de enforcement faltantes

**Meta: todos os limites enforced no backend.**

| # | Ação | Fase | Arquivos |
|---|------|------|---------|
| 14 | **Gate em whatsapp-webhook lead creation**: checkLimit('max_leads') antes de resolveLeadCanonicalId | P3 | `supabase/functions/whatsapp-webhook/index.ts` |
| 15 | **Gate em whatsapp-webhook AI pipeline**: checkLimit('included_ai_requests_month') antes de invoke ai-pipeline-agent + recordUsage('ai_request') após | P3 | `supabase/functions/whatsapp-webhook/index.ts` |
| 16 | **Gate em org-admin invite_member**: checkLimit('max_members') | P3 | `supabase/functions/org-admin/index.ts` |
| 17 | **Gate de broadcast credits no backend**: checkLimit('monthly_broadcast_credits', recipientCount) | P3 | `supabase/functions/broadcast-send/index.ts` ou hook |
| 18 | **Access state gate em TODAS as edge functions mutativas**: checkAccessState no início | P3 | 5 edge functions |

### 🟢 Sprint 4: UX billing completa

**Meta: experiência do usuário de billing completa.**

| # | Ação | Fase | Arquivos |
|---|------|------|---------|
| 19 | Criar `BillingBanner.tsx` | P4 | `src/components/billing/BillingBanner.tsx` |
| 20 | Criar `UpgradeWall.tsx` | P4 | `src/components/billing/UpgradeWall.tsx` |
| 21 | Criar `PackPurchaseModal.tsx` | P4 | `src/components/billing/PackPurchaseModal.tsx` |
| 22 | Criar `UsageBar.tsx` | P4 | `src/components/billing/UsageBar.tsx` |
| 23 | Criar `PlanBadge.tsx` | P4 | `src/components/billing/PlanBadge.tsx` |
| 24 | Criar `OnboardingChecklist.tsx` | P4 | `src/components/billing/OnboardingChecklist.tsx` |
| 25 | Criar seção "Meu Plano" em ConfiguracoesContaView | P4 | `src/components/solarzap/ConfiguracoesContaView.tsx` ou novo |
| 26 | ProtectedRoute: read_only → banner + disable mutations | P4 | `src/components/ProtectedRoute.tsx` |
| 27 | AuthContext: expor billing fields | P4 | `src/contexts/AuthContext.tsx` |
| 28 | Pricing.tsx: filtrar free, feature comparison, melhorar packs | P4 | `src/pages/Pricing.tsx` |
| 29 | Feature soft walls em views bloqueadas (Tracking, Google Integration) | P4 | Views correspondentes |
| 30 | SolarZapNav: tooltip com nome do plano | P4 | `src/components/solarzap/SolarZapNav.tsx` |
| 31 | Integrar BillingBanner + UsageBar no SolarZapLayout | P4 | `src/components/solarzap/SolarZapLayout.tsx` |
| 32 | Rota `/welcome` + página Welcome | P4 | `src/App.tsx`, novo componente |

### 🔵 Sprint 5: Observabilidade + Crons + Polish

| # | Ação | Fase | Arquivos |
|---|------|------|---------|
| 33 | Cron pending-checkout-cleanup | P5 | Migration SQL |
| 34 | Notificações email (trial/past_due/blocked) via Resend | P5 | Edge function nova |
| 35 | Admin: action migrate_legacy_orgs | P5 | `supabase/functions/admin-api/index.ts` |
| 36 | FinancialPanel: fix plan keys (starter→start, business→scale) | P6 | `src/components/admin/FinancialPanel.tsx` |
| 37 | Admin: tab Billing no org details | P6 | Componente admin novo |
| 38 | Admin: dashboard de alertas | P6 | Componente admin novo |
| 39 | Admin: UI grant credits / extend trial | P6 | Componente admin novo |

---

## RESUMO DE BUGS CRÍTICOS (AFETAM PRODUÇÃO AGORA)

| # | Bug | Impacto |
|---|-----|---------|
| 🔴 1 | `recordUsage()` passa params inexistentes ao RPC → **zero metering funciona** | usage_events e usage_counters vazios. Nenhum uso é registrado. |
| 🔴 2 | Limit keys erradas em todos os checkLimit calls → **zero enforcement funciona** | check_plan_limit não encontra os limites no catálogo. Provavelmente retorna allowed=true para tudo. |
| 🔴 3 | stripe-webhook sem idempotência → **packs podem ser creditados em dobro** em retry | Risco financeiro. |
| 🔴 4 | stripe-checkout sem trial_period_days → **Stripe cobra no dia 0** | User paga imediatamente em vez de ter 7d trial. |
| 🔴 5 | bootstrapSelf cria org sem exigir checkout → **bypass de billing** | Qualquer user novo ganha org funcional sem pagar. |

---

## CONTAGEM DE ITENS

| Status | Count |
|--------|-------|
| Bugs críticos em produção | 5 |
| Ações Sprint 1 (fixes urgentes) | 5 |
| Ações Sprint 2 (checkout + trial) | 8 |
| Ações Sprint 3 (enforcement) | 5 |
| Ações Sprint 4 (UX) | 14 |
| Ações Sprint 5 (observabilidade) | 7 |
| **Total de ações** | **39** |
