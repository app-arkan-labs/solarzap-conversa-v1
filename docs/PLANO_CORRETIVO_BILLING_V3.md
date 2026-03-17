# PLANO CORRETIVO — Fluxo de Billing & Checkout

**Data:** 2026-03-17  
**Status:** EXECUÇÃO IMEDIATA  
**Severidade:** P0 (bypass de billing + UX quebrada)

---

## 1. Diagnóstico Completo

### 1.1 BillingSetupWizard aparece em 3 pontos do ProtectedRoute

O componente `BillingSetupWizard` (página berço, sem design) é renderizado em **três** caminhos distintos no `ProtectedRoute.tsx`:

| Linha | Condição | Problema |
|-------|----------|----------|
| ~109 | `orgResolutionStatus === 'selection_required'` + ≤1 org | Mostra wizard em vez de redirecionar ao Pricing |
| ~113 | `!orgId` e resolução não deu erro | Mostra wizard em vez de redirecionar ao Pricing |
| ~153 | `subscription_status === 'pending_checkout'` | Mostra wizard em vez de redirecionar ao Pricing |

**Resultado:** Após confirmar e-mail, o usuário cai no `BillingSetupWizard` (formulário simplista com select de planos e campo "nome da organização") em vez da página premium de Pricing.

### 1.2 Plano aparece como "ativo" antes do checkout ser concluído (GRAVE)

**Causa raiz:** Em `stripe-checkout/index.ts`, ao criar a sessão de checkout, o código faz:

```sql
UPDATE organizations SET plan = planKey, subscription_status = 'pending_checkout' ...
```

O campo `plan` é setado **ANTES** do usuário completar o checkout. Se o usuário abandona o Stripe Checkout e volta ao app:
- `Pricing.tsx` lê `billing.plan_key` → encontra o plano
- Mostra "Plano atual" no card do plano selecionado
- Mostra "Fazer upgrade" / "Fazer downgrade" nos outros
- **Billing bypass**: Ilusion de que já possui o plano

Na `Pricing.tsx`:
```typescript
const currentPlan = String(billing?.plan_key || '').trim() || null;
const isCurrent = key === currentPlan; // true mesmo sem checkout concluído!
```

### 1.3 Campo "nome da organização" desaparece ao clicar

**Causa raiz:** O campo só renderiza quando `!orgId`:
```tsx
{!orgId && ( <Input id="org-name" ... /> )}
```
O bootstrap (org-admin) resolve `orgId` de forma assíncrona. Quando a resolução completa durante a interação do usuário, o React re-renderiza e o campo some.

**Status:** Problema se torna irrelevante com a remoção do BillingSetupWizard.

### 1.4 BillingSetupWizard e Pricing fazem a mesma coisa (redundância)

Ambos chamam `createPlanCheckoutSession()` e redirecionam para o Stripe Checkout. A diferença é:
- **BillingSetupWizard:** formulário minimalista, sem persuasão, sem trial info
- **Pricing:** página premium com cards comparativos, badges "7 dias grátis", tabela de features, garantias de cancelamento

### 1.5 Cancelamento de plano

`MeuPlanoView.tsx` **já possui** um fluxo de cancelamento completo:
- Botão "Cancelar plano" → seleção de motivo → confirmação → redirect ao Stripe Portal
- **Porém:** só é visível quando `hasActiveSubscription = active | trialing | past_due`
- Se o status é `pending_checkout`, o botão não aparece
- Com `ORG_BOOTSTRAP_AUTO_TRIAL=true`, bootstrap seta `trialing` → o botão deveria aparecer ✓

---

## 2. Ações Corretivas

### AÇÃO A — Eliminar BillingSetupWizard do ProtectedRoute

**Arquivo:** `src/components/ProtectedRoute.tsx`

Substituir todas as 3 ocorrências de `<BillingSetupWizard />` por `<Navigate to="/pricing" replace />`.

Isso garante que:
- Usuários sem org → veem a página premium de Pricing
- Usuários com `pending_checkout` → veem a página premium de Pricing
- Nenhum usuário jamais vê o BillingSetupWizard

### AÇÃO B — Corrigir bypass de billing (currentPlan falso)

**Arquivo (frontend):** `src/pages/Pricing.tsx`

Se `subscription_status === 'pending_checkout'`, tratar `currentPlan` como `null`:

```typescript
const rawPlan = String(billing?.plan_key || '').trim() || null;
const subscriptionStatus = String(billing?.subscription_status || '');
// Plano só é "ativo" se subscription foi de fato confirmada
const currentPlan = subscriptionStatus === 'pending_checkout' ? null : rawPlan;
```

**Arquivo (backend):** `supabase/functions/stripe-checkout/index.ts`

Não setar `plan: planKey` durante a criação do checkout. Guardar como `pending_plan_key`:

```typescript
// ANTES (errado):
.update({ plan: planKey, subscription_status: 'pending_checkout' ... })

// DEPOIS (correto):
.update({ subscription_status: 'pending_checkout' ... })
// plan será setado pelo webhook checkout.session.completed
```

**Arquivo (backend):** `supabase/functions/stripe-webhook/index.ts`

Já está correto — seta `plan: planKey` no `checkout.session.completed`. ✓

### AÇÃO C — MeuPlanoView: garantir visibilidade de cancelamento

**Arquivo:** `src/components/solarzap/MeuPlanoView.tsx`

Já funciona com `trialing` (que é o status que o bootstrap seta com `AUTO_TRIAL=true`). O botão de cancelar aparece.

Pendente: se `subscription_status === 'pending_checkout'` (sem trial), o usuário não vê cancelar. Como `AUTO_TRIAL=true` está ativo, isso não deve ocorrer para novos usuários.

**Verificação:** Se `billing.subscription_status` for `pending_checkout`, tratar como `none` no MeuPlanoView para não exibir dados incorretos.

### AÇÃO D — Pricing: ajustar herói e copy para novos signups

A página Pricing já possui:
- ✅ "7 dias grátis em qualquer plano" badge
- ✅ "Teste qualquer plano grátis por 7 dias — até o Scale!" banner
- ✅ "Sem compromisso · Cancele a qualquer momento" no botão
- ✅ "R$ 0,00 por 7 dias" badge
- ✅ "Testar grátis por 7 dias" como CTA

Considerar adicionar:
- "Dados do cartão são necessários apenas para garantir a continuidade após o trial"
- "Você pode cancelar a qualquer momento sem multa ou taxa"

---

## 3. Ordem de Execução

| # | Ação | Arquivo | Risco |
|---|------|---------|-------|
| 1 | Substituir BillingSetupWizard → Navigate(/pricing) | ProtectedRoute.tsx | Baixo |
| 2 | Tratar pending_checkout como sem plano | Pricing.tsx | Baixo |  
| 3 | Não setar plan no stripe-checkout | stripe-checkout/index.ts | Médio (deploy edge function) |
| 4 | Validar cancelamento visível em trial | MeuPlanoView.tsx | Nenhum (já funciona) |
| 5 | Adicionar copy de reassurance no Pricing | Pricing.tsx | Baixo |

---

## 4. Fluxo Esperado Pós-Correção

```
Email confirmação → /onboarding
  ↓
Onboarding wizard (7 steps)
  ↓ is_complete = true
App principal
  ↓ (ProtectedRoute verifica billing)
  ↓ subscription_status = 'trialing' (via bootstrap auto-trial)
  ↓ plan = null/free → billing guard NÃO bloqueia (trialing ≠ pending_checkout)
App funciona normalmente durante 7 dias de trial
  ↓
Usuário acessa /pricing ou /billing → Página premium
  ↓
Escolhe plano → Stripe Checkout
  ↓
Webhook confirma → plan setado, subscription_status = trialing → active
```

---

## 5. Verificação

- [ ] Novo signup → confirma email → cai no /onboarding (não no BillingSetupWizard)
- [ ] Após onboarding → app funciona (trialing)
- [ ] /pricing mostra todos os planos como "Testar grátis" (não mostra nenhum como "Plano atual")
- [ ] Click em plano → Stripe Checkout → cancela → volta ao /pricing → planos NÃO mostram "Plano atual"
- [ ] Click em plano → Stripe Checkout → conclui → webhook seta trialing/active → plano agora SIM mostra como atual
- [ ] MeuPlanoView em trial → mostra "Cancelar plano" ✓
- [ ] MeuPlanoView em trial → mostra contagem regressiva do trial ✓
