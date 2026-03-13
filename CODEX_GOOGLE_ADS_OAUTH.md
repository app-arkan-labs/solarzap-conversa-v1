# CODEX: Google Ads OAuth Integration — Plano de Ação Detalhado

> **ESCOPO**: Este documento contém TODAS as tarefas de CÓDIGO para a integração OAuth do Google Ads no SolarZap.
> O setup do Google Cloud Console (criação de projeto, OAuth consent screen, credenciais) será feito SEPARADAMENTE via automação de navegador.
> Ao final deste plano, o CLIENT_ID e CLIENT_SECRET já estarão no Supabase Vault como env vars das Edge Functions.

---

## CONTEXTO DO PROJETO

- **Stack**: Vite + React 18 + Shadcn/Radix + Tailwind + Supabase (Edge Functions em Deno)
- **Repo root**: `c:\Users\rosen\Downloads\solarzap-conversa-main`
- **Supabase ref**: `ucwmcmdwbvrwotuzlmxh`
- **Supabase URL**: `https://ucwmcmdwbvrwotuzlmxh.supabase.co`
- **Router**: `react-router-dom` v6, `BrowserRouter` in `src/App.tsx`
- **UI library**: Shadcn (Card, Button, Input, Label, Switch, Select, Badge, Tabs) — UTILIZAR esses componentes, NÃO criar primitivos custom
- **Testes**: Vitest + jsdom, `npm run test:unit`, files em `tests/unit/*.test.ts`
- **Vault**: Supabase Vault já em uso (`vault.secrets` / `vault.decrypted_secrets`)

### Variáveis Resolvidas (NÃO são segredos - podem ser usadas no código)

```
MCC_ID=4305214446
DEVELOPER_TOKEN=RYYVRx3N_ERk6nWxhf5T7Q  (nível: conta de teste)
CALLBACK_URL=https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/google-ads-callback
PROD_DOMAINS=solarzap.com.br, app.solarzap.com.br, crm.solarzap.com.br, solarzap.arkanlabs.com.br
DEV_DOMAIN=http://localhost:5173
COMPANY_EMAIL=aplicativos@arkanlabs.com.br
```

---

## ARQUIVOS-CHAVE EXISTENTES (LEIA ANTES DE CODIFICAR)

| Arquivo | O que contém | Relevância |
|---|---|---|
| `supabase/functions/tracking-credentials/index.ts` | Edge Function que faz upsert de credenciais + teste de conexão por plataforma. Já tem actions `upsert_platform_credentials` e `test_platform_connection`. | **ESTENDER** com novas actions |
| `supabase/functions/conversion-dispatcher/index.ts` | Dispatcher que consome `ad_platform_credentials` + Vault para enviar conversões. | **MODIFICAR** para suportar credenciais globais |
| `supabase/functions/_shared/conversionDispatcher.ts` | Helpers puros (resolveGoogleClickId, buildDeliveryUpdatePatch, etc.) | Não mexer |
| `supabase/functions/google-oauth/index.ts` | OAuth para Calendar/Gmail (NÃO é Google Ads). Escopo diferente. | **NÃO MEXER** — referência de padrão apenas |
| `supabase/functions/google-callback/index.ts` | Callback do Calendar/Gmail OAuth. | **NÃO MEXER** |
| `src/components/solarzap/TrackingView.tsx` | Tela de Tracking com cards de plataforma. Google Ads card tem inputs manuais (linhas ~915-945). | **MODIFICAR** o card do Google Ads |
| `src/App.tsx` | Router principal. | **MODIFICAR** para adicionar rotas públicas |
| `tests/unit/conversionDispatcher.test.ts` | Testes existentes do dispatcher. | **NÃO REMOVER** — apenas adicionar novos testes |

---

## TAREFA 1: Páginas Públicas (Privacy & Terms)

### 1.1 Criar `src/pages/PrivacyPolicy.tsx`

Página completa de Política de Privacidade em PT-BR para o SolarZap. Contexto:
- SolarZap é um CRM para empresas de energia solar
- Integra WhatsApp (via Evolution API), Google Calendar, Google Ads, Meta Ads, GA4
- Armazena dados de leads (nome, telefone, email, endereço)
- Usa Supabase (hosting no Brasil region quando disponível)
- Empresa: Arkan Labs (aplicativos@arkanlabs.com.br)
- Domínio: solarzap.com.br

A página deve:
- Ser standalone (não precisa de auth)
- Ter visual limpo e profissional usando Tailwind
- Incluir seções: Coleta de dados, Uso dos dados, Compartilhamento, Segurança, Cookies, Direitos do usuário (LGPD), Contato, Vigência
- Logo SolarZap no topo (usar emoji ☀️ + texto "SolarZap" como fallback)
- Link para voltar ao app (`/`)

### 1.2 Criar `src/pages/TermsOfService.tsx`

Mesma estética. Seções: Aceitação, Definições, Serviços, Responsabilidades do usuário, Propriedade intelectual, Limitação de responsabilidade, Rescisão, Foro (Brasil), Contato.

### 1.3 Modificar `src/App.tsx`

Adicionar rotas ACIMA do catch-all `*`:
```tsx
<Route path="/privacidade" element={<PrivacyPolicy />} />
<Route path="/termos" element={<TermsOfService />} />
```

Import os componentes com lazy loading ou import direto.

---

## TAREFA 2: DB Migration

### 2.1 Criar `supabase/migrations/20260305000000_google_ads_oauth_fields.sql`

```sql
-- Adiciona campos para OAuth do Google Ads
ALTER TABLE ad_platform_credentials
  ADD COLUMN IF NOT EXISTS google_ads_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS google_ads_account_email text;
```

---

## TAREFA 3: Edge Function — Google Ads OAuth Connect

### 3.1 Criar `supabase/functions/google-ads-oauth/index.ts`

**Comportamento**: Recebe request autenticado (JWT), gera URL OAuth do Google para escopo `adwords` e retorna `{ authUrl }`.

**Padrão a seguir**: Mesmo padrão de `supabase/functions/google-oauth/index.ts`, mas com escopo e state diferentes.

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// ENV vars necessárias:
// ALLOWED_ORIGIN (ou ALLOW_WILDCARD_CORS)
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// GOOGLE_ADS_CLIENT_ID (setado via `supabase secrets set`)
```

**Lógica**:
1. CORS preflight
2. Aceitar POST (body: `{ org_id }`) ou GET (query: `?orgId=...`)
3. Validar JWT do usuário (mesmo padrão de google-oauth)
4. Validar que usuário é membro da org (usar `organization_members`)
5. Ler `GOOGLE_ADS_CLIENT_ID` do env
6. Gerar state: `btoa(JSON.stringify({ user_id, org_id, redirect_url: origin, nonce: crypto.randomUUID() }))`
7. Montar `authUrl`:
   - `https://accounts.google.com/o/oauth2/v2/auth`
   - `client_id=<CLIENT_ID>`
   - `redirect_uri=https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/google-ads-callback`
   - `response_type=code`
   - `scope=https://www.googleapis.com/auth/adwords`
   - `access_type=offline`
   - `prompt=consent`
   - `state=<state>`
8. Retornar `{ authUrl }`

---

## TAREFA 4: Edge Function — Google Ads OAuth Callback

### 4.1 Criar `supabase/functions/google-ads-callback/index.ts`

**Comportamento**: Recebe callback do Google (GET com `?code=...&state=...`), troca code por tokens, armazena refresh_token no Vault, atualiza DB, redireciona de volta ao app.

**Padrão a seguir**: Mesmo padrão de `supabase/functions/google-callback/index.ts`.

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ENV vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET
```

**Lógica**:
1. Parsear `code`, `state`, `error` da URL
2. Se `error`: redirecionar com `?google_ads_status=error&message=...`
3. Decodificar state: `JSON.parse(atob(state))` → `{ user_id, org_id, redirect_url }`
4. Ler `GOOGLE_ADS_CLIENT_ID` e `GOOGLE_ADS_CLIENT_SECRET` do env
5. Trocar code por tokens:
   ```
   POST https://oauth2.googleapis.com/token
   Content-Type: application/x-www-form-urlencoded
   
   client_id=...&client_secret=...&code=...&grant_type=authorization_code
   &redirect_uri=https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/google-ads-callback
   ```
6. Extrair `access_token`, `refresh_token` da resposta
7. Se `refresh_token` ausente: redirecionar com erro (explicar que precisa `prompt=consent`)
8. **Armazenar refresh_token no Vault**:
   ```typescript
   const { data: vaultRow } = await supabase
     .schema('vault')
     .from('secrets')
     .insert({
       name: `google_ads_refresh_token_${org_id}_${Date.now()}`,
       secret: refresh_token,
       description: 'Google Ads OAuth refresh token',
     })
     .select('id')
     .single();
   ```
9. **Buscar info do usuário** (opcional mas útil para mostrar email conectado):
   - Usar o `access_token` para chamar `https://www.googleapis.com/oauth2/v2/userinfo`
   - Ou simplesmente usar `https://googleads.googleapis.com/v18/customers:listAccessibleCustomers` com o developer_token para validar que funciona
10. **Upsert em `ad_platform_credentials`**:
    ```typescript
    await supabase.from('ad_platform_credentials').upsert({
      org_id,
      platform: 'google_ads',
      google_refresh_token_vault_id: vaultRow.id,
      google_ads_connected_at: new Date().toISOString(),
      google_ads_account_email: userInfo?.email || null,
      // Credenciais globais — não sobrescrever se já existirem:
      // google_client_id, google_client_secret_vault_id, google_developer_token_vault_id
      // são gerenciados via env ou upsert separado
    }, { onConflict: 'org_id,platform' });
    ```
11. **Limpar vault secrets antigos** (opcional): se já existia um `google_refresh_token_vault_id` anterior, considerar deletar o antigo.
12. Redirecionar: `302` para `${redirect_url}/?google_ads_status=success`

**SEGURANÇA**: 
- NUNCA logar o refresh_token
- NUNCA retornar o refresh_token na response
- Usar service_role_key para acessar o Vault

---

## TAREFA 5: Estender `tracking-credentials` com Novas Actions

### 5.1 Modificar `supabase/functions/tracking-credentials/index.ts`

Adicionar as seguintes actions ao handler existente (no `Deno.serve` — após os `if (action === ...)` existentes):

#### Action: `list_accessible_customers`

```typescript
if (action === 'list_accessible_customers') {
  // 1. Buscar credenciais do org
  const creds = await admin.from('ad_platform_credentials')
    .select('google_refresh_token_vault_id')
    .eq('org_id', orgId).eq('platform', 'google_ads').maybeSingle();
  
  if (!creds?.data?.google_refresh_token_vault_id) {
    return jsonResponse(400, { success: false, error: 'not_connected' });
  }
  
  // 2. Buscar refresh_token do Vault
  const refreshToken = await fetchVaultSecret(admin, creds.data.google_refresh_token_vault_id);
  if (!refreshToken) {
    return jsonResponse(400, { success: false, error: 'missing_refresh_token' });
  }
  
  // 3. Buscar client_id/secret/developer_token globais
  const clientId = Deno.env.get('GOOGLE_ADS_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
  const developerToken = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
  if (!clientId || !clientSecret || !developerToken) {
    return jsonResponse(500, { success: false, error: 'missing_global_google_config' });
  }
  
  // 4. Refresh access token
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokenData = await tokenResp.json();
  if (!tokenData.access_token) {
    return jsonResponse(400, { success: false, error: 'oauth_token_refresh_failed' });
  }
  
  // 5. Chamar ListAccessibleCustomers
  const resp = await fetch('https://googleads.googleapis.com/v18/customers:listAccessibleCustomers', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'developer-token': developerToken,
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    return jsonResponse(400, { success: false, error: 'google_api_error', details: data });
  }
  
  return jsonResponse(200, { success: true, data });
}
```

#### Action: `account_hierarchy`

```typescript
if (action === 'account_hierarchy') {
  const loginCustomerId = cleanString(body.login_customer_id);
  if (!loginCustomerId) {
    return jsonResponse(400, { success: false, error: 'missing_login_customer_id' });
  }
  
  // [mesma lógica de obter access_token acima]
  
  // Query GAQL para listar contas filhas do MCC
  const query = `SELECT customer_client.client_customer, customer_client.level, customer_client.manager, customer_client.descriptive_name, customer_client.id, customer_client.status FROM customer_client WHERE customer_client.status = 'ENABLED'`;
  
  const resp = await fetch(
    `https://googleads.googleapis.com/v18/customers/${loginCustomerId.replace(/\D/g, '')}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'login-customer-id': loginCustomerId.replace(/\D/g, ''),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );
  const data = await resp.json();
  
  // Transformar em lista flat: [{ customerId, descriptiveName, isManager, level }]
  const customers = (data.results || []).map((r: any) => ({
    customerId: r.customerClient?.id || '',
    descriptiveName: r.customerClient?.descriptiveName || '',
    isManager: r.customerClient?.manager === true,
    level: r.customerClient?.level || 0,
    status: r.customerClient?.status || '',
  }));
  
  return jsonResponse(200, { success: true, data: { customers } });
}
```

#### Action: `list_conversion_actions`

```typescript
if (action === 'list_conversion_actions') {
  const customerId = cleanString(body.customer_id);
  const loginCustomerId = cleanString(body.login_customer_id);
  if (!customerId) {
    return jsonResponse(400, { success: false, error: 'missing_customer_id' });
  }
  
  // [obter accessToken]
  
  const query = `SELECT conversion_action.id, conversion_action.name, conversion_action.status, conversion_action.type, conversion_action.category FROM conversion_action WHERE conversion_action.status = 'ENABLED'`;
  
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) {
    headers['login-customer-id'] = loginCustomerId.replace(/\D/g, '');
  }
  
  const resp = await fetch(
    `https://googleads.googleapis.com/v18/customers/${customerId.replace(/\D/g, '')}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }) }
  );
  const data = await resp.json();
  
  const actions = (data.results || []).map((r: any) => ({
    id: r.conversionAction?.id || '',
    name: r.conversionAction?.name || '',
    status: r.conversionAction?.status || '',
    type: r.conversionAction?.type || '',
    category: r.conversionAction?.category || '',
  }));
  
  return jsonResponse(200, { success: true, data: { conversionActions: actions } });
}
```

#### Action: `save_ads_selection`

```typescript
if (action === 'save_ads_selection') {
  const loginCustomerId = cleanString(body.login_customer_id);
  const customerId = cleanString(body.customer_id);
  const conversionActionId = cleanString(body.conversion_action_id);
  
  if (!customerId || !conversionActionId) {
    return jsonResponse(400, { success: false, error: 'missing_customer_or_conversion_action' });
  }
  
  const { error } = await admin.from('ad_platform_credentials').upsert({
    org_id: orgId,
    platform: 'google_ads',
    google_mcc_id: loginCustomerId,
    google_customer_id: customerId,
    google_conversion_action_id: conversionActionId,
  }, { onConflict: 'org_id,platform' });
  
  if (error) {
    return jsonResponse(500, { success: false, error: 'save_failed', details: error.message });
  }
  
  return jsonResponse(200, { success: true });
}
```

#### Action: `disconnect_google_ads`

```typescript
if (action === 'disconnect_google_ads') {
  // 1. Buscar vault IDs atuais
  const { data: creds } = await admin.from('ad_platform_credentials')
    .select('google_refresh_token_vault_id')
    .eq('org_id', orgId).eq('platform', 'google_ads').maybeSingle();
  
  // 2. Limpar no DB
  await admin.from('ad_platform_credentials').update({
    google_refresh_token_vault_id: null,
    google_ads_connected_at: null,
    google_ads_account_email: null,
    google_mcc_id: null,
    google_customer_id: null,
    google_conversion_action_id: null,
    enabled: false,
  }).eq('org_id', orgId).eq('platform', 'google_ads');
  
  // 3. Atualizar settings
  await admin.from('org_tracking_settings').upsert(
    { org_id: orgId, google_ads_enabled: false },
    { onConflict: 'org_id' }
  );
  
  // 4. Tentar revogar token (best effort)
  if (creds?.google_refresh_token_vault_id) {
    const token = await fetchVaultSecret(admin, creds.google_refresh_token_vault_id);
    if (token) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {});
    }
    // Deletar do vault
    await admin.schema('vault').from('secrets').delete().eq('id', creds.google_refresh_token_vault_id).catch(() => {});
  }
  
  return jsonResponse(200, { success: true });
}
```

---

## TAREFA 6: Modificar `conversion-dispatcher/index.ts` (Credenciais Globais)

### 6.1 Na função `dispatchGoogleAds`, adicionar fallback para credenciais globais

Localizar as linhas (~335-340) onde busca credenciais:
```typescript
const clientId = cleanString(params.credentials.google_client_id);
const clientSecret = await fetchVaultSecret(params.credentials.google_client_secret_vault_id, params.vaultCache);
const refreshToken = await fetchVaultSecret(params.credentials.google_refresh_token_vault_id, params.vaultCache);
const developerToken = await fetchVaultSecret(params.credentials.google_developer_token_vault_id, params.vaultCache);
```

Substituir por:
```typescript
const clientId = cleanString(params.credentials.google_client_id) 
  || Deno.env.get('GOOGLE_ADS_CLIENT_ID') || null;
const clientSecret = await fetchVaultSecret(params.credentials.google_client_secret_vault_id, params.vaultCache) 
  || Deno.env.get('GOOGLE_ADS_CLIENT_SECRET') || null;
const refreshToken = await fetchVaultSecret(params.credentials.google_refresh_token_vault_id, params.vaultCache);
const developerToken = await fetchVaultSecret(params.credentials.google_developer_token_vault_id, params.vaultCache) 
  || Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') || null;
```

**Nota**: `refreshToken` NÃO tem fallback global — sempre per-org.

### 6.2 Mesma mudança em `testPlatformConnection` do `tracking-credentials`

Na função `testPlatformConnection` (linhas ~284-291), adicionar os mesmos fallbacks para `clientId`, `clientSecret`, `developerToken`.

---

## TAREFA 7: Modificar UI — `TrackingView.tsx`

### 7.1 Adicionar novos estados

No começo da função `TrackingView()`, após os estados existentes (~linha 256):

```typescript
const [googleAdsConnected, setGoogleAdsConnected] = useState(false);
const [googleAdsEmail, setGoogleAdsEmail] = useState<string | null>(null);
const [googleAdsConnecting, setGoogleAdsConnecting] = useState(false);
const [googleAdsDisconnecting, setGoogleAdsDisconnecting] = useState(false);

// Dropdowns
const [mccList, setMccList] = useState<{ customerId: string; descriptiveName: string; isManager: boolean }[]>([]);
const [customerList, setCustomerList] = useState<{ customerId: string; descriptiveName: string; isManager: boolean }[]>([]);
const [conversionActions, setConversionActions] = useState<{ id: string; name: string }[]>([]);
const [loadingMcc, setLoadingMcc] = useState(false);
const [loadingCustomers, setLoadingCustomers] = useState(false);
const [loadingConversions, setLoadingConversions] = useState(false);
const [savingSelection, setSavingSelection] = useState(false);
```

### 7.2 Adicionar funções

```typescript
const connectGoogleAds = useCallback(async () => {
  if (!orgId) return;
  setGoogleAdsConnecting(true);
  try {
    const { data, error } = await supabase.functions.invoke('google-ads-oauth', {
      body: { org_id: orgId },
    });
    if (error || !data?.authUrl) throw new Error(error?.message || 'failed_to_get_auth_url');
    // Abrir em nova janela ou redirecionar
    window.location.href = data.authUrl;
  } catch (err) {
    console.error(err);
    toast.error('Falha ao iniciar conexão com Google Ads.');
    setGoogleAdsConnecting(false);
  }
}, [orgId]);

const disconnectGoogleAds = useCallback(async () => {
  if (!orgId) return;
  setGoogleAdsDisconnecting(true);
  try {
    const { data, error } = await supabase.functions.invoke('tracking-credentials', {
      body: { action: 'disconnect_google_ads', org_id: orgId },
    });
    if (error || !data?.success) throw new Error(error?.message || data?.error);
    setGoogleAdsConnected(false);
    setGoogleAdsEmail(null);
    setForms(c => ({ ...c, google_ads: { ...DEFAULT_FORMS.google_ads } }));
    toast.success('Google Ads desconectado.');
    void loadPanel(true);
  } catch (err) {
    console.error(err);
    toast.error('Falha ao desconectar Google Ads.');
  } finally {
    setGoogleAdsDisconnecting(false);
  }
}, [orgId, loadPanel]);

const loadAccessibleCustomers = useCallback(async () => {
  if (!orgId) return;
  setLoadingMcc(true);
  try {
    const { data, error } = await supabase.functions.invoke('tracking-credentials', {
      body: { action: 'list_accessible_customers', org_id: orgId },
    });
    if (error || !data?.success) throw new Error(error?.message || data?.error);
    // data.data.resourceNames = ["customers/1234567890", ...]
    const names = (data.data?.resourceNames || []).map((rn: string) => {
      const id = rn.replace('customers/', '');
      return { customerId: id, descriptiveName: id, isManager: true };
    });
    setMccList(names);
  } catch (err) {
    console.error(err);
    toast.error('Falha ao listar contas acessíveis.');
  } finally {
    setLoadingMcc(false);
  }
}, [orgId]);

const loadAccountHierarchy = useCallback(async (loginCustomerId: string) => {
  if (!orgId) return;
  setLoadingCustomers(true);
  try {
    const { data, error } = await supabase.functions.invoke('tracking-credentials', {
      body: { action: 'account_hierarchy', org_id: orgId, login_customer_id: loginCustomerId },
    });
    if (error || !data?.success) throw new Error(error?.message || data?.error);
    setCustomerList(data.data?.customers || []);
  } catch (err) {
    console.error(err);
    toast.error('Falha ao listar contas de anúncios.');
  } finally {
    setLoadingCustomers(false);
  }
}, [orgId]);

const loadConversionActions = useCallback(async (customerId: string, loginCustomerId?: string) => {
  if (!orgId) return;
  setLoadingConversions(true);
  try {
    const { data, error } = await supabase.functions.invoke('tracking-credentials', {
      body: { action: 'list_conversion_actions', org_id: orgId, customer_id: customerId, login_customer_id: loginCustomerId },
    });
    if (error || !data?.success) throw new Error(error?.message || data?.error);
    setConversionActions(data.data?.conversionActions || []);
  } catch (err) {
    console.error(err);
    toast.error('Falha ao listar ações de conversão.');
  } finally {
    setLoadingConversions(false);
  }
}, [orgId]);

const saveAdsSelection = useCallback(async () => {
  if (!orgId) return;
  setSavingSelection(true);
  try {
    const { data, error } = await supabase.functions.invoke('tracking-credentials', {
      body: {
        action: 'save_ads_selection',
        org_id: orgId,
        login_customer_id: forms.google_ads.google_mcc_id,
        customer_id: forms.google_ads.google_customer_id,
        conversion_action_id: forms.google_ads.google_conversion_action_id,
      },
    });
    if (error || !data?.success) throw new Error(error?.message || data?.error);
    toast.success('Seleção salva com sucesso.');
    void loadPanel(true);
  } catch (err) {
    console.error(err);
    toast.error('Falha ao salvar seleção.');
  } finally {
    setSavingSelection(false);
  }
}, [orgId, forms.google_ads, loadPanel]);
```

### 7.3 Atualizar `loadPanel` callback

Na função `loadPanel` (~linha 370-404), após processar as credenciais do google_ads, adicionar:

```typescript
if (row.platform === 'google_ads') {
  // ... existente ...
  // Adicionar:
  if (row.google_ads_connected_at) {
    setGoogleAdsConnected(true);
    setGoogleAdsEmail(row.google_ads_account_email || null);
  }
}
```

Também precisa incluir `google_ads_connected_at, google_ads_account_email` no select da query de `ad_platform_credentials` (~linha 341).

### 7.4 Detectar retorno do OAuth callback

Na `loadPanel` ou em um `useEffect` separado, checar URL params:

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const googleStatus = params.get('google_ads_status');
  if (googleStatus === 'success') {
    toast.success('Google Ads conectado com sucesso!');
    // Limpar URL params
    window.history.replaceState({}, '', window.location.pathname);
    void loadPanel(true);
  } else if (googleStatus === 'error') {
    const msg = params.get('message') || 'Falha na conexão';
    toast.error(`Erro ao conectar Google Ads: ${msg}`);
    window.history.replaceState({}, '', window.location.pathname);
  }
}, []);
```

### 7.5 Substituir o card do Google Ads (linhas ~915-945)

Substituir TODO o conteúdo do `<CardContent>` do card Google Ads por:

**Quando NÃO conectado** (`!googleAdsConnected`):
```tsx
<CardContent className="space-y-4">
  <div className="flex flex-col items-center gap-3 py-6">
    <p className="text-sm text-muted-foreground text-center">
      Conecte sua conta Google Ads para enviar conversões offline automaticamente.
    </p>
    <Button className="gap-2" onClick={() => void connectGoogleAds()} disabled={googleAdsConnecting}>
      {googleAdsConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Conectar Google Ads
    </Button>
  </div>
  
  {/* Legacy fallback - se existir configuração manual antiga */}
  {forms.google_ads.google_customer_id && !googleAdsConnected && (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Configuração manual (legado)
      </summary>
      <div className="mt-3 space-y-3">
        {/* Manter os inputs manuais antigos aqui (MCC, Customer ID, Conversion Action, Client ID, secrets) */}
        {/* Mesma estrutura das linhas 935-941 originais */}
      </div>
    </details>
  )}
</CardContent>
```

**Quando CONECTADO** (`googleAdsConnected`):
```tsx
<CardContent className="space-y-4">
  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2">
    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
    <span className="text-sm font-medium text-emerald-700">
      Conectado{googleAdsEmail ? ` (${googleAdsEmail})` : ''}
    </span>
  </div>
  
  {/* MCC Dropdown */}
  <div className="space-y-2">
    <Label>Conta MCC (Manager)</Label>
    <div className="flex gap-2">
      <Select
        value={forms.google_ads.google_mcc_id}
        onValueChange={(v) => {
          setForms(c => ({ ...c, google_ads: { ...c.google_ads, google_mcc_id: v, google_customer_id: '', google_conversion_action_id: '' } }));
          void loadAccountHierarchy(v);
        }}
      >
        <SelectTrigger><SelectValue placeholder="Selecione a MCC" /></SelectTrigger>
        <SelectContent>
          {mccList.map(m => (
            <SelectItem key={m.customerId} value={m.customerId}>{m.descriptiveName || m.customerId}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" onClick={() => void loadAccessibleCustomers()} disabled={loadingMcc}>
        <RefreshCw className={cn("h-4 w-4", loadingMcc && "animate-spin")} />
      </Button>
    </div>
  </div>
  
  {/* Customer ID Dropdown */}
  <div className="space-y-2">
    <Label>Conta de Anúncios</Label>
    <Select
      value={forms.google_ads.google_customer_id}
      onValueChange={(v) => {
        setForms(c => ({ ...c, google_ads: { ...c.google_ads, google_customer_id: v, google_conversion_action_id: '' } }));
        void loadConversionActions(v, forms.google_ads.google_mcc_id);
      }}
      disabled={!forms.google_ads.google_mcc_id || loadingCustomers}
    >
      <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
      <SelectContent>
        {customerList.filter(c => !c.isManager).map(c => (
          <SelectItem key={c.customerId} value={c.customerId}>{c.descriptiveName} ({c.customerId})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  
  {/* Conversion Action Dropdown */}
  <div className="space-y-2">
    <Label>Ação de Conversão</Label>
    <Select
      value={forms.google_ads.google_conversion_action_id}
      onValueChange={(v) => setForms(c => ({ ...c, google_ads: { ...c.google_ads, google_conversion_action_id: v } }))}
      disabled={!forms.google_ads.google_customer_id || loadingConversions}
    >
      <SelectTrigger><SelectValue placeholder="Selecione a conversão" /></SelectTrigger>
      <SelectContent>
        {conversionActions.map(a => (
          <SelectItem key={a.id} value={a.id}>{a.name} ({a.id})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
  
  {/* Botões */}
  <div className="flex flex-wrap gap-2">
    <Button className="gap-2" onClick={() => void saveAdsSelection()} disabled={savingSelection || !forms.google_ads.google_customer_id || !forms.google_ads.google_conversion_action_id}>
      {savingSelection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar seleção
    </Button>
    <Button variant="outline" className="gap-2" onClick={() => void testPlatform('google_ads')} disabled={testingPlatform === 'google_ads'}>
      {testingPlatform === 'google_ads' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Testar conexão
    </Button>
    <Button variant="ghost" className="gap-2 text-destructive" onClick={() => void disconnectGoogleAds()} disabled={googleAdsDisconnecting}>
      {googleAdsDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Desconectar
    </Button>
  </div>
</CardContent>
```

### 7.6 Import Select components

Adicionar no topo do `TrackingView.tsx`:
```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

### 7.7 Atualizar `PlatformFormState`

Remover do tipo (mas manter compatibilidade):
- `google_client_secret` — mover para legacy, não precisa mais no form state principal
- `google_refresh_token` — idem
- `google_developer_token` — idem

Na prática: manter os campos no tipo para não quebrar compilação, mas parar de renderizá-los na UI principal (só no fallback legacy).

### 7.8 Update `platformConnected` memo

Atualizar para considerar `googleAdsConnected`:
```typescript
google_ads:
  googleAdsConnected &&
  forms.google_ads.google_customer_id.trim().length > 0 &&
  forms.google_ads.google_conversion_action_id.trim().length > 0,
```

### 7.9 Gate de segurança no Switch "Ativar Google Ads"

No `onCheckedChange` do Switch (~linhas 928-931), adicionar validação:
```typescript
onCheckedChange={(value) => {
  if (value && !googleAdsConnected) {
    toast.error('Conecte o Google Ads antes de ativar.');
    return;
  }
  if (value && (!forms.google_ads.google_customer_id || !forms.google_ads.google_conversion_action_id)) {
    toast.error('Selecione a conta e ação de conversão antes de ativar.');
    return;
  }
  setForms(c => ({ ...c, google_ads: { ...c.google_ads, enabled: value } }));
  setSettings(c => ({ ...c, google_ads_enabled: value }));
}}
```

---

## TAREFA 8: Testes Unitários

### 8.1 Criar `tests/unit/googleAdsOAuthState.test.ts`

```typescript
import { describe, expect, it } from 'vitest';

describe('Google Ads OAuth state encoding', () => {
  it('encodes and decodes state correctly', () => {
    const stateData = { user_id: 'u1', org_id: 'o1', redirect_url: 'http://localhost:5173', nonce: 'abc123' };
    const encoded = btoa(JSON.stringify(stateData));
    const decoded = JSON.parse(atob(encoded));
    expect(decoded).toEqual(stateData);
  });

  it('rejects malformed state', () => {
    expect(() => JSON.parse(atob('not-base64!!!'))).toThrow();
  });

  it('rejects state missing required fields', () => {
    const partial = btoa(JSON.stringify({ user_id: 'u1' }));
    const decoded = JSON.parse(atob(partial));
    expect(decoded.org_id).toBeUndefined();
  });
});
```

### 8.2 Criar `tests/unit/googleAdsApiHelpers.test.ts`

```typescript
import { describe, expect, it } from 'vitest';

describe('Google Ads API response parsing', () => {
  it('parses accessible customers response', () => {
    const response = { resourceNames: ['customers/1234567890', 'customers/9876543210'] };
    const customers = response.resourceNames.map(rn => rn.replace('customers/', ''));
    expect(customers).toEqual(['1234567890', '9876543210']);
  });

  it('handles empty response', () => {
    const response = { resourceNames: [] };
    expect(response.resourceNames).toHaveLength(0);
  });

  it('parses conversion actions', () => {
    const results = [
      { conversionAction: { id: '123', name: 'Purchase', status: 'ENABLED', type: 'UPLOAD_CLICKS' } },
      { conversionAction: { id: '456', name: 'Lead', status: 'ENABLED', type: 'UPLOAD_CLICKS' } },
    ];
    const actions = results.map(r => ({ id: r.conversionAction.id, name: r.conversionAction.name }));
    expect(actions).toHaveLength(2);
    expect(actions[0].name).toBe('Purchase');
  });
});
```

---

## TAREFA 9: Documentação

### 9.1 Criar `docs/GOOGLE_ADS_OAUTH_MIGRATION.md`

Conteúdo:
- Inventário de arquivos criados/modificados
- Explicação do fluxo OAuth
- Como funciona o fallback legado
- Plano de corte (remover legado após 90 dias)
- Diagrama: User → Button → google-ads-oauth → Google → google-ads-callback → Vault → DB

### 9.2 Criar `docs/GOOGLE_ADS_OAUTH_SETUP_REPORT.md`

Conteúdo (template — preencher após GCP setup):
- GCP Project ID e nome
- OAuth Client ID (sem secret)
- URIs configuradas
- Como operar em dev vs prod
- Como pedir verificação OAuth (quando sair de Testing)
- Como validar Developer Token (link para form + estratégia)
- Limitações com token de teste

---

## VERIFICAÇÃO FINAL

Após todas as tarefas, rodar:
```bash
npm run test:unit
```

**TODOS os testes existentes devem passar** (regressão zero).

Novos testes também devem passar:
- `tests/unit/googleAdsOAuthState.test.ts`
- `tests/unit/googleAdsApiHelpers.test.ts`

Verificar também:
```bash
npx tsc --noEmit
```

---

## RESUMO DE ARQUIVOS

| Ação | Arquivo |
|---|---|
| **CRIAR** | `src/pages/PrivacyPolicy.tsx` |
| **CRIAR** | `src/pages/TermsOfService.tsx` |
| **CRIAR** | `supabase/migrations/20260305000000_google_ads_oauth_fields.sql` |
| **CRIAR** | `supabase/functions/google-ads-oauth/index.ts` |
| **CRIAR** | `supabase/functions/google-ads-callback/index.ts` |
| **CRIAR** | `tests/unit/googleAdsOAuthState.test.ts` |
| **CRIAR** | `tests/unit/googleAdsApiHelpers.test.ts` |
| **CRIAR** | `docs/GOOGLE_ADS_OAUTH_MIGRATION.md` |
| **CRIAR** | `docs/GOOGLE_ADS_OAUTH_SETUP_REPORT.md` |
| **MODIFICAR** | `src/App.tsx` (adicionar rotas /privacidade, /termos) |
| **MODIFICAR** | `src/components/solarzap/TrackingView.tsx` (Google Ads card → OAuth flow) |
| **MODIFICAR** | `supabase/functions/tracking-credentials/index.ts` (5 novas actions) |
| **MODIFICAR** | `supabase/functions/conversion-dispatcher/index.ts` (fallback credenciais globais) |
| **NÃO TOCAR** | `supabase/functions/_shared/conversionDispatcher.ts` |
| **NÃO TOCAR** | `supabase/functions/google-oauth/index.ts` |
| **NÃO TOCAR** | `supabase/functions/google-callback/index.ts` |
| **NÃO TOCAR** | Qualquer teste existente em `tests/unit/` |
