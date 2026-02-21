# RUNBOOK M1 — Organizations Foundation

## 0) Preflight Checklist
- **Estado do Repositório**: Identificado como **SUJO** (muitas mudanças locais e 11 migrations pendentes em `supabase/migrations`).
- **Decisão**: Executar via **Caminho B** (SQL direto via `supabase db query` ou Management API) para evitar conflitos de migrations não relacionadas.
- **Comandos de Verificação**:
  - `git status` (confirmar que nada mudou desde o planejamento)
  - `ls supabase/migrations`
- **Resultado Esperado**: Lista de migrations pendentes deve ser ignorada para a aplicação deste M1.

## 1) DB Changes (SQL)
Execute o seguinte SQL para criar a base multiempresa:

```sql
-- 1. Tabela de Organizações
CREATE TABLE IF NOT EXISTS public.organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    owner_id uuid REFERENCES auth.users(id),
    created_at timestamptz DEFAULT now()
);

-- 2. Tabela de Membros da Organização
CREATE TABLE IF NOT EXISTS public.organization_members (
    org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'user', 'consultant')),
    can_view_team_leads boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (org_id, user_id)
);

-- 3. Índices de Performance
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(org_id);

-- 4. RLS Básico (Desabilitado ou permissivo para este Milestone)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Políticas temporárias para permitir leitura/escrita administrativa (service_role)
DROP POLICY IF EXISTS "service_role_all" ON public.organizations;
CREATE POLICY "service_role_all" ON public.organizations FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_all" ON public.organization_members;
CREATE POLICY "service_role_all" ON public.organization_members FOR ALL USING (auth.role() = 'service_role');
```

## 2) Backfill Strategy
Criar uma organização para cada usuário existente e defini-los como donos.

```sql
-- 1. Criar organizações para usuários que ainda não possuem
INSERT INTO public.organizations (name, owner_id)
SELECT 
    'Organização de ' || (COALESCE(email, id::text)), 
    id
FROM auth.users
WHERE id NOT IN (SELECT owner_id FROM public.organizations)
ON CONFLICT DO NOTHING;

-- 2. Inserir memberships como 'owner'
INSERT INTO public.organization_members (org_id, user_id, role, can_view_team_leads)
SELECT 
    o.id, 
    o.owner_id, 
    'owner', 
    true
FROM public.organizations o
WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members m 
    WHERE m.org_id = o.id AND m.user_id = o.owner_id
)
ON CONFLICT DO NOTHING;
```

## 3) App/Frontend Minimal Changes
- **Nenhuma mudança de UI necessária** para o M1.
- **Verificação**: Confirmar que o login continua funcionando normalmente (o app deve ignorar as novas tabelas por enquanto).

## 4) Gates (SQL + smoke)
Execute estas queries para validar o sucesso:

- **Gate 1: Tabelas Criadas?**
  - `SELECT table_name FROM information_schema.tables WHERE table_name IN ('organizations', 'organization_members');`
  - **PASS**: Retorna 2 linhas.

- **Gate 2: Backfill Completo?**
  - `SELECT (SELECT count(*) FROM auth.users) = (SELECT count(*) FROM public.organizations) as backfill_ok;`
  - **PASS**: Retorna `true`.

- **Gate 3: Memberships Criadas?**
  - `SELECT count(*) FROM public.organization_members WHERE role = 'owner';`
  - **PASS**: Deve ser igual à contagem de usuários.

- **Gate 4: Smoke Test App Load**
  - Abrir o app e logar.
  - **PASS**: App funcional sem erros fatais.

## 5) Rollback/Backout
Em caso de falha catastrófica:
```sql
DROP TABLE IF EXISTS public.organization_members;
DROP TABLE IF EXISTS public.organizations;
```
*Atenção: Use apenas se os dados criados no M1 não forem mais necessários.*

## 6) Commit Plan
- **Migration**: Criar um arquivo `supabase/migrations/20260218_m1_organizations_foundation.sql` com o SQL exato da seção 1 e 2.
- **Mensagem**: `M1: organizations foundation + members + backfill`
- **Arquivos**:
  - `supabase/migrations/20260218_m1_organizations_foundation.sql`
  - Atualizar `walkthrough.md`.
