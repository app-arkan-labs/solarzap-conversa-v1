# Plano de Ação — Fluxo de Criação de Conta + Checkout Integrado

> **Objetivo**: Quando o usuário clica em um plano na landing page (`solarzap.com.br`), ele deve ser direcionado para `app.solarzap.com.br` numa tela de criação de conta completa (nome, email, senha, CPF, empresa, CNPJ), e após criar a conta & confirmar email, ser encaminhado automaticamente para o checkout Stripe do plano escolhido. Após o checkout, segue para o onboarding existente.

---

## 1. Diagnóstico do Fluxo Atual

### URLs da landing page hoje
```
https://app.solarzap.com.br/billing?target=start&trial=7&checkout=1
https://app.solarzap.com.br/billing?target=pro&trial=7&checkout=1
https://app.solarzap.com.br/billing?target=scale&trial=7&checkout=1
```

### O que acontece hoje
1. Usuário chega em `/billing?target=pro&trial=7&checkout=1`
2. **Se não logado**: `Pricing.tsx` redireciona para `/login?plan=pro&mode=signup&redirect=/billing?target=pro&trial=7&checkout=1`
3. Login.tsx mostra formulário de signup com **apenas email + senha**
4. Após signup → email de confirmação → usuário confirma → faz login
5. Após login → `ProtectedRoute` verifica que não tem org → redireciona para `/pricing`
6. Usuário precisa selecionar plano novamente (perde contexto do plano escolhido na landing)

### Problemas identificados
- **P1**: Signup coleta apenas email + senha — falta nome completo, CPF, nome da empresa, CNPJ (dados padrão de SaaS B2B)
- **P2**: Após confirmar email e logar, o plano selecionado na landing page pode se perder (depende do `sessionStorage` que pode estar em outra aba/sessão)
- **P3**: Não há fluxo direto "criar conta → checkout" — o usuário passa por redirecionamentos confusos
- **P4**: A `organizations.name` é criada com fallback genérico `"Organizacao {email}"` no edge function em vez de usar o nome da empresa informado pelo usuário

---

## 2. Arquitetura Proposta

### 2.1 Novo fluxo vindo da landing page (`solarzap.com.br`)

```
[solarzap.com.br] → Clica "Testar grátis" no plano Pro
    ↓
[app.solarzap.com.br/login?mode=signup&plan=pro&trial=7&checkout=1]
    ↓
Tela de signup expandida:
  - Nome completo *
  - Email *
  - Senha *
  - CPF (opcional — pode ser coletado depois)
  - Nome da empresa *
  - CNPJ (opcional — pode ser coletado depois)
    ↓
Supabase signUp() com user_metadata { display_name, cpf, company_name, cnpj }
    ↓
Toast: "Conta criada! Confirme seu email."
    ↓
Usuário confirma email → Faz login
    ↓
ProtectedRoute: sem org → redirect /pricing
    ↓
/pricing detecta ?checkout=1&target=pro (via sessionStorage)
    → auto-checkout: cria org com nome da empresa do metadata → Stripe Checkout
    ↓
Stripe → sucesso → /onboarding?checkout=success
    ↓
Onboarding 7 steps (dados da empresa já pré-preenchidos do signup)
```

### 2.2 Fluxo vindo do botão "Criar conta" no `/login`

```
[app.solarzap.com.br/login] → Clica "Criar conta"
    ↓
Mesma tela de signup expandida (sem plan pré-selecionado)
    ↓
Supabase signUp() com user_metadata
    ↓
Confirma email → Login
    ↓
ProtectedRoute: sem org → redirect /pricing
    ↓
/pricing: sem auto-checkout → usuário escolhe plano manualmente
    → Stripe Checkout
    ↓
/onboarding (dados da empresa já pré-preenchidos)
```

---

## 3. Tarefas Detalhadas

### FASE 1 — Formulário de Signup Expandido

#### 1.1 Expandir o formulário de signup em `Login.tsx`

**Arquivo**: `src/pages/Login.tsx`

**Campos a adicionar no modo `signup`:**

| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| Nome completo | `text` | ✅ | min 3 caracteres |
| Email | `email` | ✅ | (já existe) |
| Senha | `password` | ✅ | min 8 caracteres (já existe) |
| CPF | `text` | ❌ | Formato XXX.XXX.XXX-XX + validação de dígitos verificadores (se preenchido) |
| Nome da empresa | `text` | ✅ | min 2 caracteres |
| CNPJ | `text` | ❌ | Formato XX.XXX.XXX/XXXX-XX + validação de dígitos verificadores (se preenchido) |

**Decisão sobre CPF/CNPJ obrigatórios**: Recomendo que sejam **opcionais** nesta etapa para não aumentar atrito de conversão. Podem ser coletados no onboarding ou em momento posterior. O importante é que Nome completo e Nome da empresa sejam obrigatórios.

**Implementação:**

```tsx
// Novos states no componente Login
const [fullName, setFullName] = useState('');
const [companyName, setCompanyName] = useState('');
const [cpf, setCpf] = useState('');
const [cnpj, setCnpj] = useState('');
```

**Alterar `handleSignUp`:**

```tsx
const handleSignUp = async (e: React.FormEvent) => {
  e.preventDefault();
  if (fullName.trim().length < 3) { /* toast erro */ return; }
  if (companyName.trim().length < 2) { /* toast erro */ return; }
  if (cpf && !isValidCpf(cpf)) { /* toast erro */ return; }
  if (cnpj && !isValidCnpj(cnpj)) { /* toast erro */ return; }
  // ...signup existente...
  
  // Passar dados extras via signUp options → user_metadata
  const error = await signUp(normalizedEmail, password, {
    display_name: fullName.trim(),
    company_name: companyName.trim(),
    cpf: cpf ? cleanCpf(cpf) : undefined,
    cnpj: cnpj ? cleanCnpj(cnpj) : undefined,
  });
  // ...resto do fluxo...
};
```

#### 1.2 Atualizar `AuthContext.signUp()` para aceitar metadata

**Arquivo**: `src/contexts/AuthContext.tsx`

Alterar a assinatura de `signUp` para aceitar um objeto de metadata opcional:

```tsx
const signUp = async (
  email: string,
  password: string,
  metadata?: { display_name?: string; company_name?: string; cpf?: string; cnpj?: string }
) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/onboarding`,
      data: {
        display_name: metadata?.display_name || '',
        company_name: metadata?.company_name || '',
        cpf: metadata?.cpf || '',
        cnpj: metadata?.cnpj || '',
      },
    },
  });
  // ...
};
```

> **Nota**: O Supabase Auth armazena `options.data` em `auth.users.raw_user_meta_data`. Esses dados ficam disponíveis em `user.user_metadata` no frontend e no JWT claims do edge function.

#### 1.3 Criar utilitário de validação/formatação CPF/CNPJ

**Arquivo novo**: `src/utils/documentValidation.ts`

```tsx
export function formatCpf(value: string): string { /* máscara XXX.XXX.XXX-XX */ }
export function formatCnpj(value: string): string { /* máscara XX.XXX.XXX/XXXX-XX */ }
export function cleanCpf(value: string): string { /* remove pontos e traço */ }
export function cleanCnpj(value: string): string { /* remove pontos, barra e traço */ }
export function isValidCpf(value: string): boolean { /* algoritmo dígitos verificadores */ }
export function isValidCnpj(value: string): boolean { /* algoritmo dígitos verificadores */ }
```

---

### FASE 2 — Persistência do Plano Selecionado

#### 2.1 Melhorar a persistência do plano escolhido na landing

**Problema**: Hoje o plano é guardado em `sessionStorage` — funciona se o usuário continua na mesma aba, mas se ele abre o email de confirmação em outra aba/browser, o `sessionStorage` se perde.

**Solução**: Usar **duas estratégias combinadas**:

1. **`sessionStorage`** (já existe) — funciona se mesma aba
2. **`localStorage`** com chave `checkout_plan_intent` — funciona se mesma máquina/browser
3. **Query param `?plan=X`** no `emailRedirectTo` do signup — funciona sempre

**Arquivo**: `src/contexts/AuthContext.tsx`

Alterar o `emailRedirectTo` no signUp para incluir `?plan=X`:

```tsx
const planHint = metadata?.company_name ? sessionStorage.getItem('checkout_plan_hint') : null;
const redirectUrl = new URL(`${window.location.origin}/onboarding`);
if (planHint) redirectUrl.searchParams.set('plan', planHint);

options: {
  emailRedirectTo: redirectUrl.toString(),
}
```

**Arquivo**: `src/pages/Login.tsx`

Ao salvar os hints, gravar também em `localStorage`:
```tsx
if (planHint) {
  sessionStorage.setItem(PLAN_STORAGE_KEY, planHint);
  localStorage.setItem('checkout_plan_intent', JSON.stringify({
    plan: planHint,
    trial: trialDaysFromUrl,
    autoCheckout: checkoutFromUrl === '1',
    ts: Date.now(),
  }));
}
```

**Arquivo**: `src/pages/Pricing.tsx`

Ao verificar auto-checkout, ler também de `localStorage`:
```tsx
// Fallback: tentar localStorage se sessionStorage não tem o plan
const storedIntent = localStorage.getItem('checkout_plan_intent');
if (storedIntent) {
  const parsed = JSON.parse(storedIntent);
  // Validar que não está expirado (ex: < 24h)
  if (Date.now() - parsed.ts < 86_400_000) {
    // usar parsed.plan, parsed.trial, parsed.autoCheckout
  }
  localStorage.removeItem('checkout_plan_intent');
}
```

#### 2.2 Ajustar URLs da landing page

**Na landing `solarzap.com.br`**, alterar os links dos planos para apontar diretamente para o signup com os parâmetros corretos:

```
https://app.solarzap.com.br/login?mode=signup&plan=start&trial=7&checkout=1
https://app.solarzap.com.br/login?mode=signup&plan=pro&trial=7&checkout=1
https://app.solarzap.com.br/login?mode=signup&plan=scale&trial=7&checkout=1
```

> **Mudança**: em vez de `/billing?target=X&...`, apontar para `/login?mode=signup&plan=X&trial=7&checkout=1`. Isso garante que o usuário veja first a tela de cadastro.

**Novo parâmetro `checkout=1`** na URL do login: indica que após criar conta + logar, deve ir direto para checkout (não para `/billing` genérico).

---

### FASE 3 — Fluxo Pós-Login Automático para Checkout

#### 3.1 Ajustar `ProtectedRoute` para respeitar intent de checkout

**Arquivo**: `src/components/ProtectedRoute.tsx`

Hoje, quando o usuário não tem org, o `ProtectedRoute` redireciona para `/pricing`. Precisamos que ele redirecione para `/pricing` **com os parâmetros de checkout preservados**:

```tsx
// Na decisão de redirect quando não tem org:
const planIntent = sessionStorage.getItem(PLAN_STORAGE_KEY)
  || JSON.parse(localStorage.getItem('checkout_plan_intent') || '{}')?.plan;

if (!orgId) {
  const redirectUrl = planIntent
    ? `/pricing?target=${planIntent}&trial=7&checkout=1`
    : '/pricing';
  return <Navigate to={redirectUrl} replace />;
}
```

Isso garante que o `/pricing` receba os parâmetros de auto-checkout e inicie o Stripe Checkout automaticamente (comportamento que já existe no `Pricing.tsx` via `autoCheckoutRequested`).

#### 3.2 Propagar nome da empresa para criação da org no edge function

**Arquivo**: `supabase/functions/stripe-checkout/index.ts`

O edge function já aceita `org_name` no payload, mas o frontend não envia. E quando não envia, usa fallback `"Organizacao {email}"`.

**Arquivo**: `src/hooks/useOrgBilling.ts`

Alterar `createPlanCheckoutSession` para ler o `company_name` do user metadata e passar como `org_name`:

```tsx
export async function createPlanCheckoutSession({
  planKey, orgId, orgName, trialDays, successUrl, cancelUrl
}: { ... }) {
  // Se não tem orgName explícito, tentar pegar do user metadata
  const { data: { user } } = await supabase.auth.getUser();
  const resolvedOrgName = orgName || user?.user_metadata?.company_name || undefined;

  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { plan_key: planKey, org_id: orgId, org_name: resolvedOrgName, trial_days: trialDays, success_url: successUrl, cancel_url: cancelUrl },
  });
  // ...
}
```

---

### FASE 4 — Pré-preenchimento do Onboarding

#### 4.1 Usar metadata do signup para pré-preencher steps do onboarding

**Arquivo**: `src/pages/Onboarding.tsx`

No step "profile" (nome), o campo `fullName` já é pré-preenchido de `user.user_metadata.display_name`. ✅ Isso já funciona.

No step "company" (empresa), pré-preencher `companyDraft.company_name` a partir de `user.user_metadata.company_name`:

```tsx
useEffect(() => {
  if (!user || companyLoaded) return;
  // Após carregar company_profile do DB...
  // Se o campo company_name estiver vazio, pré-preencher do metadata
  if (!companyDraft.company_name && user.user_metadata?.company_name) {
    setCompanyDraft(prev => ({
      ...prev,
      company_name: user.user_metadata.company_name,
    }));
  }
}, [user, companyLoaded, companyDraft.company_name]);
```

#### 4.2 (Opcional) Adicionar CPF/CNPJ no onboarding company step

Se for desejável coletar CPF/CNPJ do owner durante o onboarding (para quem pulou na criação de conta), adicionar esses campos no step "company" ou criar um step "dados fiscais" entre company e branding.

**Recomendação**: Não adicionar step extra — incluir CPF e CNPJ opcionalmente no step "company" existente. Pré-preencher do metadata se já fornecidos no signup.

---

### FASE 5 — Migração de Banco de Dados

#### 5.1 Adicionar colunas `owner_cpf`, `owner_cnpj` na tabela `organizations`

```sql
-- Migration: add_owner_document_fields_to_organizations.sql
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS owner_cpf TEXT,
  ADD COLUMN IF NOT EXISTS owner_cnpj TEXT;

COMMENT ON COLUMN public.organizations.owner_cpf IS 'CPF do proprietário da organização';
COMMENT ON COLUMN public.organizations.owner_cnpj IS 'CNPJ da empresa';
```

> **Alternativa**: Guardar CPF/CNPJ apenas no `user_metadata` do Supabase Auth e no step company do `company_profile`. Depende se você quer acessar esses dados pelo admin dashboard diretamente na tabela organizations ou não.

**Recomendação**: Guardar o CNPJ no `company_profile` (que já é por org) e o CPF no `user_metadata` (que é por usuário). Não precisa de migration se optar por não duplicar nas organizations. Porém, para facilitar consultas admin e NF-e futura, adicionar ao `company_profile`:

```sql
ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS owner_cpf TEXT;
```

#### 5.2 Propagar dados do metadata para company_profile na criação da org

**Arquivo**: `supabase/functions/stripe-checkout/index.ts`

Após criar a org com sucesso, inserir/atualizar `company_profile` com os dados do metadata:

```ts
// Após criar org e membership...
const userMetadata = user.user_metadata || {};
if (userMetadata.company_name || userMetadata.cnpj) {
  await serviceClient.from('company_profile').upsert({
    org_id: orgId,
    company_name: userMetadata.company_name || orgName,
    cnpj: userMetadata.cnpj || null,
    owner_cpf: userMetadata.cpf || null,
  }, { onConflict: 'org_id' });
}
```

---

### FASE 6 — Ajustes de UX

#### 6.1 Indicador visual do plano selecionado no signup

Quando o usuário vem da landing page com `?plan=pro`, mostrar um badge/banner no topo do formulário de signup:

```
┌─────────────────────────────────┐
│ ⚡ Plano Pro selecionado        │
│ 7 dias grátis • Após: R$ X/mês │
└─────────────────────────────────┘
│ Nome completo                   │
│ Email                           │
│ Senha                           │
│ Nome da empresa                 │
│ CPF (opcional)                  │
│ CNPJ (opcional)                 │
│                                 │
│     [ Criar Conta e Continuar ] │
└─────────────────────────────────┘
```

**Arquivo**: `src/pages/Login.tsx`

Ler `plan` e `trial` dos searchParams e renderizar um card de contexto acima do formulário.

#### 6.2 Texto do botão contextual

- Com plano: **"Criar conta e continuar"** (indica que tem próximo passo)
- Sem plano: **"Criar conta"** (texto atual)

#### 6.3 Loading state durante auto-checkout

Quando o usuário faz login e é redirecionado para `/pricing` com auto-checkout, mostrar um loading claro:

```
"Direcionando para o checkout do plano Pro..."
```

Isso já existe parcialmente — o `busyPlan` state no Pricing mostra loading no botão. Mas como o auto-checkout dispara sozinho, seria bom ter um overlay ou indicador mais visível.

---

## 4. Resumo dos Arquivos a Alterar

| # | Arquivo | Alteração |
|---|---------|-----------|
| 1 | `src/pages/Login.tsx` | Expandir formulário signup com nome, empresa, CPF, CNPJ. Banner de plano selecionado. |
| 2 | `src/contexts/AuthContext.tsx` | `signUp()` aceitar metadata e incluir `plan` no `emailRedirectTo`. |
| 3 | `src/utils/documentValidation.ts` | **Novo** — funções de validação/máscara CPF e CNPJ. |
| 4 | `src/components/ProtectedRoute.tsx` | Preservar parâmetros de checkout no redirect `/pricing`. |
| 5 | `src/hooks/useOrgBilling.ts` | Passar `org_name` do metadata no checkout session. |
| 6 | `src/pages/Pricing.tsx` | Fallback `localStorage` para intent de checkout. |
| 7 | `src/pages/Onboarding.tsx` | Pré-preencher company_name do metadata. |
| 8 | `supabase/functions/stripe-checkout/index.ts` | Criar `company_profile` com dados do metadata na criação da org. |
| 9 | `supabase/migrations/YYYYMMDD_add_fiscal_fields_company_profile.sql` | **Novo** — adicionar `cnpj` e `owner_cpf` ao `company_profile`. |
| 10 | Landing page (`solarzap.com.br`) | Alterar URLs dos planos para `/login?mode=signup&plan=X&trial=7&checkout=1`. |

---

## 5. Sequência de Implementação Recomendada

```
FASE 1 (Formulário) ─────────────────────── Prioridade: ALTA
  1.3 Criar documentValidation.ts
  1.2 Atualizar AuthContext.signUp() com metadata
  1.1 Expandir formulário de signup

FASE 2 (Persistência do plano) ──────────── Prioridade: ALTA
  2.1 localStorage + sessionStorage dual storage
  2.2 Alterar URLs na landing page (solarzap.com.br)

FASE 3 (Fluxo pós-login → checkout) ────── Prioridade: ALTA
  3.1 ProtectedRoute preservar params de checkout
  3.2 useOrgBilling: propagar org_name do metadata

FASE 4 (Onboarding pré-preenchido) ─────── Prioridade: MÉDIA
  4.1 Pré-preencher company_name no onboarding
  4.2 Campos CPF/CNPJ no step company (opcional)

FASE 5 (Database) ──────────────────────── Prioridade: MÉDIA
  5.1 Migration: cnpj + owner_cpf no company_profile
  5.2 Edge function: gravar company_profile na criação da org

FASE 6 (Polish UX) ─────────────────────── Prioridade: BAIXA
  6.1 Badge do plano selecionado no signup
  6.2 Texto contextual do botão
  6.3 Loading overlay no auto-checkout
```

---

## 6. Fluxo Completo Final (após implementação)

### Cenário A — Vindo da landing page (solarzap.com.br)

```
1. Usuário em solarzap.com.br clica "Testar grátis" no plano Pro
2. Redirecionado para:
   app.solarzap.com.br/login?mode=signup&plan=pro&trial=7&checkout=1
3. Vê formulário de signup com:
   - Banner "⚡ Plano Pro selecionado — 7 dias grátis"
   - Campos: Nome completo, Email, Senha, Nome da empresa, CPF*, CNPJ*
4. Preenche e clica "Criar conta e continuar"
5. signUp() salva metadata (display_name, company_name, cpf, cnpj)
6. plan=pro + trial=7 + checkout=1 gravados em sessionStorage + localStorage
7. Toast: "Conta criada! Confirme seu email."
8. Usuário abre email, clica no link de confirmação
9. Redirecionado para /onboarding?plan=pro (emailRedirectTo inclui plan)
10. ProtectedRoute: sem org → redirect /pricing?target=pro&trial=7&checkout=1
11. Pricing.tsx: auto-checkout dispara
    → createPlanCheckoutSession({ planKey: 'pro', orgName: 'Empresa do Usuário', trial: 7 })
    → Edge function cria org com nome correto + company_profile + Stripe Checkout
12. Usuário completa pagamento na Stripe
13. Stripe redireciona para /onboarding?checkout=success
14. Onboarding: nome já preenchido, empresa já preenchida
15. ProtectedRoute mantém em /onboarding até is_complete = true
16. After onboarding → / (dashboard) + guided tour
```

### Cenário B — Clicando "Criar conta" no /login (sem plano)

```
1. Usuário em app.solarzap.com.br/login clica "Criar conta"
2. Vê formulário de signup (sem banner de plano)
   - Campos: Nome completo, Email, Senha, Nome da empresa, CPF*, CNPJ*
3. Preenche e clica "Criar conta"
4. signUp() salva metadata
5. Confirma email → login
6. ProtectedRoute: sem org → redirect /pricing (sem auto-checkout)
7. Usuário escolhe plano manualmente → Stripe Checkout
8. Checkout OK → /onboarding?checkout=success
9. Onboarding com dados pré-preenchidos
10. Dashboard
```

---

## 7. Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| sessionStorage perdido ao abrir email em outra aba | localStorage como fallback + plan no emailRedirectTo |
| localStorage expirado ou limpo | TTL de 24h + fallback para escolha manual em /pricing |
| CPF/CNPJ inválido travando signup | Validação apenas quando preenchido (campos opcionais) |
| User metadata grande demais | Supabase suporta até ~16KB em raw_user_meta_data — suficiente |
| Company_profile já existente no upsert | Usar `onConflict: 'org_id'` no upsert |
| Formulário longo demais reduzindo conversão | CPF/CNPJ opcionais. Apenas 4 campos obrigatórios (nome, email, senha, empresa) |

---

## 8. Testes Requeridos

1. **E2E — Landing → Signup → Checkout → Onboarding**: fluxo completo com plano pré-selecionado
2. **E2E — Login → Signup → Billing → Checkout**: fluxo sem plano pré-selecionado
3. **Unit — documentValidation.ts**: CPFs e CNPJs válidos/inválidos, formatação, limpeza
4. **Regressão — Login existente**: login/senha sem signup deve continuar funcionando
5. **Regressão — Onboarding**: steps existentes não devem quebrar com metadata extras
6. **Cross-tab**: confirmar email em aba diferente e verificar que o plano é mantido via localStorage
7. **Admin host**: signup deve continuar desabilitado em hosts admin

---

*Criado em: 2026-03-28*
*Última atualização: 2026-03-28*
