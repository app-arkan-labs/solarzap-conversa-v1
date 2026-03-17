# Plano Definitivo — Onboarding Guiado (v2)

> **Data:** 2026-03-16  
> **Status:** Aprovação pendente  
> **Escopo:** Fluxo completo desde o signup até o uso do app

---

## 1. Diagnóstico do Problema Atual

### 1.1 O que acontece hoje (BUG)

Fluxo observado pelo cliente ao criar conta:

```
Signup (email + senha)
  → Email de confirmação enviado
  → Usuário clica no email
  → Supabase redireciona para "/" (window.location.origin)
  → AuthContext.onAuthStateChange dispara
  → bootstrap_self() cria org com subscription_status = "pending_checkout"
  → ProtectedRoute avalia:
      ├─ Linha 157: subscription_status === "pending_checkout"?  SIM
      │   → return <BillingSetupWizard />  ❌ BLOCKED AQUI
      │
      └─ Linha 169: Onboarding check → NUNCA ALCANÇADO
```

**Resultado:** O usuário cai direto na tela de seleção de plano, sem passar pelo onboarding.

### 1.2 Causa raiz

No `ProtectedRoute.tsx`, o guard de billing executa **ANTES** do guard de onboarding:

```tsx
// Linha 157-161: BILLING CHECK (executa primeiro)
if (!billingQuery.isLoading && subscriptionStatus === 'pending_checkout'
    && !unlimitedBypass && !isBillingRoute) {
  return <BillingSetupWizard />;   // ← Bloqueia aqui
}

// Linha 169-174: ONBOARDING CHECK (nunca alcançado)
if (hasBillingAccess && !isOnboardingRoute && !onboardingQuery.isLoading) {
  if (onboardingQuery.data && onboardingQuery.data.is_complete !== true) {
    return <Navigate to="/onboarding" replace />;
  }
}
```

O bootstrap (`org-admin/index.ts` L339-443) define `subscription_status = 'pending_checkout'` por padrão (`ORG_BOOTSTRAP_AUTO_TRIAL` é `false` em prod). Isso faz o ProtectedRoute mostrar o `BillingSetupWizard` antes de qualquer onboarding.

### 1.3 O que já temos implementado e funcional

| Componente | Status | Observação |
|---|---|---|
| `onboarding_progress` table no Supabase | ✅ Deploy OK | 16 colunas, RLS, trigger, 4 policies |
| `useOnboardingProgress` hook | ✅ Código OK | CRUD completo, auto-promoção legacy |
| `OnboardingWizardShell` | ✅ Código OK | Layout com stepper, back/next/skip |
| `Onboarding.tsx` (7 etapas owner) | ✅ Código OK | profile, company, branding, whatsapp, ai, automation, notifications |
| `GuidedTour` overlay + `tourSteps.ts` | ✅ Código OK | Tour pós-onboarding por tab |
| `BillingSetupWizard` | ✅ Código OK | Checkout → Stripe |
| Rota `/onboarding` + ProtectedRoute | ✅ Rota existe | Guard de billing impede acesso |

**Conclusão:** Todo o código do onboarding existe e compila sem erros. O problema é SÓ a ordem dos guards no `ProtectedRoute.tsx` e a falta de integração billing↔onboarding.

---

## 2. Fluxo-alvo (como deve funcionar)

```
SIGNUP
  │
  ▼
EMAIL CONFIRMATION
  │ Supabase redireciona para "/"
  ▼
BOOTSTRAP
  │ org-admin cria org com subscription_status = "trialing" (auto trial 7 dias)
  │ onboarding_progress criado com is_complete = false
  ▼
PROTECTEDROUTE
  │ Detecta is_complete === false
  │ → Redireciona para /onboarding ANTES de qualquer billing check
  ▼
ONBOARDING WIZARD (7 etapas para owner)
  │
  │ Etapa 1: Perfil (nome completo)
  │ Etapa 2: Dados da Empresa
  │ Etapa 3: Branding (logo/cores) — pulável
  │ Etapa 4: WhatsApp (conectar instância) — pulável
  │ Etapa 5: IA (configurar assistente)
  │ Etapa 6: Automação (configurar funil)
  │ Etapa 7: Notificações (canais)
  │
  │ → markComplete() → is_complete = true
  ▼
APP PRINCIPAL
  │
  │ Guided Tour automático por tab (Conversas, Pipelines, etc.)
  │ Banner discreto de trial expirar (7 dias)
  │
  ▼  (após trial ou quando quiser)
BILLING / CHECKOUT
```

### 2.1 Decisão de design: Trial automático em vez de checkout prévio

**Proposta:** Alterar `ORG_BOOTSTRAP_AUTO_TRIAL` para `true` no Supabase, fazendo com que novos users entrem automaticamente num trial de 7 dias sem precisar informar cartão. Isso:

- Remove a barreira do `BillingSetupWizard` antes do onboarding
- O user experimenta o app com todas as features ativas
- Ao fim do trial (ou antes), um banner/prompt pede checkout

**Alternativa (se cartão é obrigatório antes do uso):** Integrar a seleção de plano como Etapa 0 do wizard, antes do "profile". Nesse caso o wizard teria 8 etapas.

---

## 3. Mudanças Necessárias

### 3.1 Opção A — Trial Automático (RECOMENDADA — menor risco)

| # | Arquivo | Mudança | Complexidade |
|---|---|---|---|
| A1 | `supabase/functions/org-admin` env | Setar `ORG_BOOTSTRAP_AUTO_TRIAL=true` | Config |
| A2 | `src/components/ProtectedRoute.tsx` | **Inverter a ordem:** onboarding check ANTES do billing check | Baixa |
| A3 | `src/components/ProtectedRoute.tsx` | Permitir `/onboarding` para `pending_checkout` e `trialing` sem bloquear | Baixa |
| A4 | `src/pages/Onboarding.tsx` | Nenhuma mudança necessária — já funcional | — |
| A5 | Banner de trial | Criar `TrialBanner` simples no layout principal mostrando dias restantes | Média |

**Total: ~3 mudanças de código + 1 config.**

### 3.2 Opção B — Billing como Etapa 0 do Wizard (se cartão obrigatório)

| # | Arquivo | Mudança | Complexidade |
|---|---|---|---|
| B1 | `src/pages/Onboarding.tsx` | Adicionar etapa "plan" antes de "profile" com seletor de plano | Média |
| B2 | `src/components/ProtectedRoute.tsx` | Permitir `/onboarding` para `pending_checkout` (não bloquear) | Baixa |
| B3 | `src/pages/Onboarding.tsx` | Na etapa "plan", criar checkout Stripe e aguardar callback | Alta |
| B4 | `src/pages/Onboarding.tsx` | Tratar `?checkout=success` para avançar do passo "plan" | Média |
| B5 | `src/components/billing/BillingSetupWizard.tsx` | Remover ou redirecionar para `/onboarding` (não mostrar standalone) | Baixa |

**Total: ~5 mudanças de código, mais complexo.**

---

## 4. Plano de Execução — Opção A (Recomendada)

### Fase 1: Desbloquear onboarding (prioridade absoluta)

#### Tarefa 1.1 — Inverter guards no ProtectedRoute.tsx

**Antes (bugado):**
```tsx
// Billing check FIRST → blocks onboarding
if (subscriptionStatus === 'pending_checkout' && ...) {
  return <BillingSetupWizard />;
}
// Onboarding check SECOND → never reached
if (hasBillingAccess && !isOnboardingRoute && ...) {
  if (onboardingQuery.data?.is_complete !== true) {
    return <Navigate to="/onboarding" replace />;
  }
}
```

**Depois (corrigido):**
```tsx
// 1. Onboarding check FIRST (para qualquer status de billing)
const isOnboardingRoute = location.pathname === '/onboarding';
if (!isOnboardingRoute && !onboardingQuery.isLoading) {
  if (onboardingQuery.data && onboardingQuery.data.is_complete !== true) {
    return <Navigate to="/onboarding" replace />;
  }
}

// 2. Billing check SECOND (só para users com onboarding completo)
if (!billingQuery.isLoading && subscriptionStatus === 'pending_checkout'
    && !unlimitedBypass && !isBillingRoute && !isOnboardingRoute) {
  return <BillingSetupWizard />;
}
```

**Lógica:** Se `is_complete = false` → vai para onboarding primeiro, independente do status de billing. Após `markComplete()`, na próxima renderização o billing check entrará normalmente (se trial, usa o app; se `pending_checkout`, mostra checkout).

#### Tarefa 1.2 — Habilitar ORG_BOOTSTRAP_AUTO_TRIAL

Setar a variável de ambiente `ORG_BOOTSTRAP_AUTO_TRIAL=true` na edge function `org-admin` do Supabase.

**Efeitos:**
- Novo signup → `subscription_status = 'trialing'` (em vez de `pending_checkout`)
- Trial de 7 dias automático com acesso total
- Após trial → billing banner ou block
- User passa pelo onboarding sem barreira de checkout

#### Tarefa 1.3 — Garantir que `/onboarding` não seja bloqueado por billing

No `ProtectedRoute`, a rota `/onboarding` deve estar isenta de qualquer billing block. O wizard precisa funcionar mesmo se o user estiver em `pending_checkout` (caso B) ou `trialing`.

```tsx
const isOnboardingRoute = location.pathname === '/onboarding';
// ... billing check deve incluir `&& !isOnboardingRoute`
```

Isso já existe parcialmente no código atual, mas precisa ser movido para ANTES do billing return.

### Fase 2: Refinamentos (pós-onboarding funcional)

#### Tarefa 2.1 — Trial Banner no layout principal

Criar componente `TrialExpirationBanner` que:
- Aparece no topo do SolarZapLayout quando `subscription_status === 'trialing'`
- Mostra "Seu trial expira em X dias. [Contratar plano]"
- Link para `/pricing`
- Oculta com X (sessão) ou auto-oculta se status mudar

#### Tarefa 2.2 — Bloquear acesso pós-trial se não pago

Quando trial expira e user não completou checkout:
- org-admin ou cron muda status para `expired` ou `pending_checkout`
- `ProtectedRoute` detecta e exibe `BillingSetupWizard`
- Neste ponto, o user JÁ passou pelo onboarding (`is_complete = true`), então não há conflito

#### Tarefa 2.3 — Guided Tour pós-onboarding

Já implementado (`GuidedTour.tsx`, `tourSteps.ts`, `useGuidedTour.ts`). Funciona automaticamente quando user acessa cada tab pela primeira vez. Nenhuma mudança necessária.

### Fase 3: Polish e edge cases

#### Tarefa 3.1 — Tratar reentrada no wizard

Se o user fecha o browser no meio do onboarding e volta, o `current_step` no DB indica onde ele parou. O wizard já lê isso e restaura a posição correta. ✅

#### Tarefa 3.2 — Onboarding para "member" (não-owner)

Membros convidados passam apenas pela etapa "profile" (já implementado com `MEMBER_STEPS`). ✅

#### Tarefa 3.3 — Legacy orgs (orgs que já existiam antes do onboarding)

O hook `useOnboardingProgress` já detecta orgs com dados legados (leads/company_profile) e auto-promove `is_complete = true`. ✅

#### Tarefa 3.4 — Email de confirmação redirect

Atualmente redireciona para `/` (origin). Alternativa: redirecionar para `/onboarding` diretamente para UX mais fluida.

```tsx
// Em AuthContext.tsx signUp
emailRedirectTo: `${window.location.origin}/onboarding`
```

Não obrigatório pois o ProtectedRoute já redireciona, mas elimina um redirect intermediário.

---

## 5. Requisitos de Deploy

| Deploy | O que | Como |
|---|---|---|
| Edge Function env var | `ORG_BOOTSTRAP_AUTO_TRIAL=true` | Dashboard Supabase → Functions → org-admin → Secrets |
| Frontend | Mudanças no `ProtectedRoute.tsx` | Build + deploy Vite |
| DB | Nenhuma mudança — tabela já OK | — |
| Edge Functions código | Nenhuma mudança no org-admin | — |

---

## 6. Testes de Validação

### Cenário 1: Novo signup completo
1. Criar conta com email novo
2. Confirmar email
3. Deve cair no wizard `/onboarding` (não no billing)
4. Completar todas as 7 etapas
5. Ao finalizar, cai no app principal com tour automático
6. Trial ativo por 7 dias

### Cenário 2: User existente (com dados legados)
1. Login normal
2. `is_complete` auto-promovido para `true` (legacy detection)
3. Vai direto para o app sem onboarding

### Cenário 3: Member convidado
1. Aceita convite por email
2. Passa apenas pela etapa "profile"
3. `is_complete` marcado
4. Acessa app normalmente

### Cenário 4: Fechar browser no meio do onboarding
1. Iniciar onboarding, chegar na etapa 3
2. Fechar browser
3. Voltar → retoma do step 3 (persistido no DB)

### Cenário 5: Trial expira
1. Após 7 dias sem checkout
2. App mostra `BillingSetupWizard`
3. User faz checkout → volta ao app

---

## 7. Resumo Executivo

| Item | Estado Atual | Ação Necessária |
|---|---|---|
| Tabela `onboarding_progress` | ✅ Deployed | Nenhuma |
| Hook `useOnboardingProgress` | ✅ Funcional | Nenhuma |
| Wizard 7 etapas (Onboarding.tsx) | ✅ Funcional | Nenhuma |
| OnboardingWizardShell | ✅ Funcional | Nenhuma |
| Tour guiado póss-onboarding | ✅ Funcional | Nenhuma |
| **ProtectedRoute guard order** | **❌ BUG: billing antes de onboarding** | **INVERTER ORDEM** |
| **ORG_BOOTSTRAP_AUTO_TRIAL** | **❌ false em prod** | **Setar true** |
| **Rota /onboarding desbloqueada** | **❌ blocked by billing** | **Isentar de billing check** |
| Trial Banner | ❌ Não existe | Criar simples |
| Email redirect URL | ⚠️ Vai para `/`, redireciona | Opcional: mudar para `/onboarding` |

**Mudanças de código: 1 arquivo principal (`ProtectedRoute.tsx`) + 1 componente novo (`TrialBanner`).**  
**Mudanças de config: 1 env var no Supabase.**  
**Todo o resto já está implementado e funcional.**
