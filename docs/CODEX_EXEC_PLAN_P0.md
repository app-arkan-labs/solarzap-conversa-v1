# CODEX EXEC PLAN — P0 (M8 / M9 / M10)

Data: 2026-02-19  
Pré-requisito: M0–M7.2.x merged + gates green (FINAL_REPORT.md GO).

---

## M8 — Admin Mínimo (Membros / Roles / Permissões)

### Escopo
- **DB**: nenhuma migration (tabela `organization_members` já existe com `role`, `can_view_team_leads`).
- **Frontend**: 1 página nova + 1 componente de convite + ajustes em 3 arquivos existentes.
- **Edge**: 1 fn nova (invite-member) OU RPC via service_role.

### Tarefas

1. **Criar `src/pages/AdminMembers.tsx`** [NEW]
   - Listar membros da org: `supabase.from('organization_members').select('*, auth_user:user_id(email)').eq('org_id', orgId)`
   - Tabela com colunas: email, role (dropdown: owner/admin/agent), can_view_team_leads (toggle), ações (remover)
   - Botão "Convidar membro" abre modal com campo email + role
   - Guard: só renderiza se `role === 'owner' || role === 'admin'`

2. **Criar edge fn `supabase/functions/invite-member/index.ts`** [NEW]
   - Input: `{ email, role, org_id }`
   - Lógica: `supabase.auth.admin.createUser({ email, password: randomTemp })` → insert `organization_members` com org_id/role
   - Alternativa simples: `supabase.auth.admin.inviteUserByEmail(email)` + insert membership
   - Auth: verificar que caller é owner/admin da org (JWT claim)

3. **Registrar rota em `src/App.tsx`**
   - `<Route path="/admin/members" element={<ProtectedRoute><AdminMembers /></ProtectedRoute>} />`

4. **Ajustar `src/components/ProtectedRoute.tsx`**
   - Aceitar prop `requiredRole?: string[]`
   - Se definido, checar `useAuth().role` contra a lista; se falha → redirect /

5. **Adicionar link no sidebar `src/components/solarzap/SolarZapLayout.tsx`**
   - Item "Equipe" visível apenas se `role === 'owner' || role === 'admin'`
   - Ícone: `Users` (lucide)

6. **Corrigir `src/components/solarzap/ForwardMessageModal.tsx`**
   - Substituir array hardcoded (linhas 19-25) por query real a `organization_members`
   - Usar `useAuth().orgId` para filtrar

7. **Auto-onboarding no signup** (se não existir)
   - Em `AuthProvider.signUp` ou hook pós-signup: se user não tem membership → criar org + inserir como owner
   - Verificar se M1 migration trigger já faz isso (buscar `auto_create_org` ou similar no SQL)

### Critérios de aceite
- Owner vê lista real de membros da sua org
- Owner altera role de membro → DB reflete imediatamente
- Owner convida email → novo user criado + membership inserida
- Agent não acessa /admin/members (redirect)
- ForwardMessageModal mostra membros reais

### Gates
```bash
cmd /c npx tsc --noEmit
npx playwright test tests/e2e/m5-frontend-org.spec.ts
# Novo E2E:
npx playwright test tests/e2e/m8-admin-members.spec.ts
# SQL audit:
SELECT om.user_id, om.role, om.can_view_team_leads, om.org_id FROM organization_members om;
```

### Risco
- `supabase.auth.admin.*` requer service_role key → deve rodar APENAS em Edge Function, nunca no frontend.
- RLS em `organization_members` permite apenas SELECT para o próprio user (policy M4); UPDATE/DELETE precisa de nova policy para owner/admin.

---

## M9 — Billing Stub (Plano/Status + Travas Básicas)

### Escopo
- **DB**: 1 migration nova (tabela `subscriptions`).
- **Frontend**: 1 página nova + 1 hook.
- **Edge**: nenhuma (leitura direta via RLS).

### Tarefas

1. **Migration `supabase/migrations/YYYYMMDD_m9_subscriptions.sql`** [NEW]
   ```sql
   CREATE TABLE IF NOT EXISTS public.subscriptions (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id uuid NOT NULL REFERENCES public.organizations(id),
     plan text NOT NULL DEFAULT 'trial',       -- trial | pro | enterprise
     status text NOT NULL DEFAULT 'active',     -- active | expired | canceled
     max_leads int NOT NULL DEFAULT 50,
     max_instances int NOT NULL DEFAULT 1,
     starts_at timestamptz NOT NULL DEFAULT now(),
     ends_at timestamptz,
     created_at timestamptz NOT NULL DEFAULT now()
   );
   ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
   CREATE POLICY sub_org_read ON public.subscriptions FOR SELECT
     USING (org_id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()));
   -- Seed: insert trial para cada org existente
   INSERT INTO public.subscriptions (org_id, plan, status, max_leads, max_instances)
   SELECT id, 'trial', 'active', 50, 1 FROM public.organizations
   ON CONFLICT DO NOTHING;
   ```

2. **Criar `src/hooks/usePlanLimits.ts`** [NEW]
   - Query `subscriptions` pela `org_id`
   - Expor: `plan`, `status`, `maxLeads`, `maxInstances`, `isExpired`, `canCreateLead`
   - `canCreateLead`: count leads da org < maxLeads AND status = 'active'

3. **Criar `src/pages/BillingPage.tsx`** [NEW]
   - Card: plano atual, status, data de expiração
   - Barra de uso: leads usados / max_leads
   - Botão "Fazer upgrade" → placeholder (link para WhatsApp do vendedor ou Stripe futuro)
   - Guard: owner/admin only

4. **Registrar rota `/billing` em `App.tsx`**

5. **Guard de criação de lead**
   - Em `useLeads` ou no componente de novo lead: checar `usePlanLimits().canCreateLead`
   - Se false → toast "Limite do plano atingido"

### Critérios de aceite
- Owner vê plano atual + uso
- Org com plan=trial e 50 leads não cria o 51º (toast de erro)
- Tabela `subscriptions` com RLS ativa

### Gates
```bash
cmd /c npx tsc --noEmit
npx playwright test tests/e2e/m5-frontend-org.spec.ts
# SQL:
SELECT s.org_id, s.plan, s.status, s.max_leads FROM subscriptions s;
```

### Risco
- Sem gateway de pagamento real; upgrade é manual/WhatsApp. Risco aceitável para MVP.
- Se trial expirar, owner fica locked out sem path de upgrade → implementar grace period ou allow read-only.

---

## M10 — Deploy VPS + Domínio + SSL

### Escopo
- **Infra**: VPS (Ubuntu), Nginx/Caddy, build estático, DNS, SSL.
- **Frontend**: `.env.production`, build script.
- **Edge**: já deployadas no Supabase (não muda).

### Tarefas

1. **Criar `.env.production`** [NEW]
   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon_key>
   VITE_EVOLUTION_API_URL=https://<evolution-host>
   ```

2. **Build de produção**
   ```bash
   npm run build  # gera dist/
   ```

3. **Provisionar VPS**
   - Ubuntu 22.04+ (mínimo 1 vCPU / 1 GB)
   - Instalar: `nginx` ou `caddy`, `certbot` (se nginx)
   - Copiar `dist/` para `/var/www/solarzap/`

4. **Configurar Nginx**
   ```nginx
   server {
     listen 80;
     server_name solarzap.seudominio.com.br;
     return 301 https://$host$request_uri;
   }
   server {
     listen 443 ssl;
     server_name solarzap.seudominio.com.br;
     ssl_certificate /etc/letsencrypt/live/solarzap.seudominio.com.br/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/solarzap.seudominio.com.br/privkey.pem;
     root /var/www/solarzap;
     index index.html;
     location / {
       try_files $uri $uri/ /index.html;  # SPA fallback
     }
   }
   ```

5. **DNS**: A record `solarzap.seudominio.com.br` → IP da VPS

6. **SSL**: `certbot --nginx -d solarzap.seudominio.com.br`

7. **Supabase config**
   - Adicionar domínio em Supabase Dashboard → Auth → Site URL
   - Adicionar em Redirect URLs

8. **Smoke test pós-deploy**
   ```bash
   curl -sI https://solarzap.seudominio.com.br | head -5
   # Esperado: HTTP/2 200
   ```

### Critérios de aceite
- `https://solarzap.seudominio.com.br` carrega app
- Login funciona (Supabase Auth)
- WhatsApp webhook chega (Evolution → Supabase Edge)

### Gates
```bash
curl -sI https://solarzap.seudominio.com.br  # 200
curl -s https://solarzap.seudominio.com.br | grep -o '<title>.*</title>'
# Login manual: email/senha → dashboard carrega
```

### Risco
- Evolution API precisa de domínio/IP público para webhooks; se estiver em outra VPS, garantir conectividade.
- CORS: Supabase pode bloquear requests do novo domínio → adicionar em Supabase Dashboard.

---

## Ordem de execução recomendada

```
M8 (Admin) → M9 (Billing) → M10 (Deploy)
```

M8 primeiro porque sem admin o owner não consegue operar. M9 segundo para ter travas antes de ir a produção. M10 por último quando tudo funcionar em localhost.

---

## Resumo de arquivos

| Ação | Arquivo |
|------|---------|
| NEW | `src/pages/AdminMembers.tsx` |
| NEW | `supabase/functions/invite-member/index.ts` |
| NEW | `src/pages/BillingPage.tsx` |
| NEW | `src/hooks/usePlanLimits.ts` |
| NEW | `supabase/migrations/YYYYMMDD_m9_subscriptions.sql` |
| NEW | `.env.production` |
| NEW | `tests/e2e/m8-admin-members.spec.ts` |
| MOD | `src/App.tsx` (2 rotas) |
| MOD | `src/components/ProtectedRoute.tsx` (role guard) |
| MOD | `src/components/solarzap/SolarZapLayout.tsx` (sidebar links) |
| MOD | `src/components/solarzap/ForwardMessageModal.tsx` (membros reais) |
| MOD | `supabase/migrations/20260218_m4_lead_visibility.sql` OU nova policy (owner UPDATE em org_members) |
