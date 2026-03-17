# Plano: Criação de Organização e Conta de Usuário pelo Painel Admin

> **Status:** Aguardando aprovação para execução

---

## Problema

O admin não consegue criar organizações nem contas de usuário diretamente pelo painel.
Caso real: `leonardosmonline@gmail.com` criou conta mas nunca completou onboarding — ficou sem organização, sem como acessar o sistema, e o admin não conseguiu resolver pelo painel.

---

## Solução

Adicionar duas ações ao painel admin:

1. **Criar Organização para Usuário Existente** — usuário já existe no `auth.users` mas não tem org (caso leonardosmonline).
2. **Criar Usuário + Organização do Zero** — admin informa email/senha, sistema cria conta + org de uma vez.

---

## Escopo de Alterações

### 1. Backend — `admin-api/index.ts`

#### Nova action: `create_org_with_user`

- **Permissão:** `super_admin`, `requireMfa: true`
- **Payload:**

```typescript
{
  action: 'create_org_with_user',
  email: string,           // Email do usuário
  password?: string,       // Opcional — se omitido, gera senha temporária
  org_name?: string,       // Opcional — default: "Organização de {email}"
  plan?: string,           // Opcional — 'free' | 'start' | 'pro' | 'scale' | 'unlimited'
  start_trial?: boolean,   // Opcional — default: false — inicia trial de 7 dias
}
```

- **Fluxo:**

```
1. Normalizar email (trim, lowercase)
2. Buscar usuário existente: auth.users WHERE email = ?
   ├── Se encontrou → usar user.id existente
   │   ├── Verificar se já tem org (owner_id = user.id)
   │   │   └── Se já tem → ERRO "Usuário já possui organização"
   │   └── Sem org → seguir adiante
   └── Se não encontrou → criar via adminClient.auth.admin.createUser()
       ├── email, password (ou gerada), email_confirm: true
       └── Guardar tempPassword para retornar ao admin
3. INSERT organizations (name, owner_id)
4. UPSERT organization_members (org_id, user_id, role='owner', can_view_team_leads=true)
5. UPDATE organizations SET subscription_status, trial, onboarding_state
   ├── Se start_trial=true → 'trialing', trial 7 dias
   └── Se start_trial=false → 'pending_checkout'
6. Se plan informado → UPDATE organizations SET plan = ?, plan_limits = (default do plano)
7. INSERT org_audit_log (ação admin)
8. Retornar { ok, org_id, user_id, user_created, temp_password? }
```

- **Segurança:**
  - Requer super_admin + MFA (mesmo nível de delete_org)
  - Audit log obrigatório
  - Senha temporária retornada APENAS na response (nunca salva em log)
  - Validação de email format

#### Nova action: `list_orphan_users`

- **Permissão:** `support`, `requireMfa: true`
- **Propósito:** Listar usuários no `auth.users` que NÃO possuem organização (como leonardosmonline)
- **Retorno:** `{ id, email, created_at }[]` — paginado, max 50

### 2. Frontend — Novo componente `CreateOrgDialog.tsx`

Diálogo (Dialog/Sheet) acionado por botão "Criar Organização" no topo da lista OrgsList.

#### Campos do formulário:

| Campo | Tipo | Obrigatório | Default |
|-------|------|-------------|---------|
| Email do usuário | Input text | ✅ | — |
| Senha (se usuário novo) | Input password | ❌ | Auto-gerada |
| Nome da organização | Input text | ❌ | "Organização de {email}" |
| Plano | Select | ❌ | Nenhum (pending_checkout) |
| Iniciar trial? | Checkbox | ❌ | false |

#### Comportamento:

1. Admin digita o email → ao sair do campo (onBlur), sistema busca se o usuário já existe:
   - **Existe sem org:** Mostra badge verde "Usuário encontrado — será vinculado à nova org"
   - **Existe com org:** Mostra badge vermelha "Usuário já possui organização" + bloqueia submit
   - **Não existe:** Mostra badge amarela "Novo usuário será criado" + habilita campo de senha
2. Ao submeter → chama `create_org_with_user`
3. Sucesso → toast com org_id + se senha temporária, mostrar em alert copiável
4. Invalidar query `list_orgs` para refresh da lista

#### Localização no código:

- `src/components/admin/CreateOrgDialog.tsx` — componente novo
- `src/components/admin/OrgsList.tsx` — adicionar botão "Criar Organização" + import

### 3. Frontend — Aba "Usuários Órfãos" (Opcional/Bônus)

- Pequena tabela ou seção dentro do painel admin mostrando os usuários sem org
- Botão "Criar Org" em cada linha → abre CreateOrgDialog pré-preenchido com o email
- Usa action `list_orphan_users`

### 4. Hooks — `useAdminApi.ts`

- Adicionar `'create_org_with_user'` e `'list_orphan_users'` ao tipo `AdminApiAction`
- Hook `useAdminCreateOrg()` — mutation wrapper para `create_org_with_user`
- Hook `useAdminOrphanUsers()` — query wrapper para `list_orphan_users`

### 5. Nenhuma migração SQL necessária

Todas as tabelas já existem: `organizations`, `organization_members`, `org_audit_log`.
O trigger `tr_tracking_seed_org_settings` já cria as configs de tracking automaticamente ao inserir org.

---

## Diagrama de Fluxo

```
Admin clica "Criar Organização"
        │
        ▼
  ┌─────────────┐
  │ Email input  │──onBlur──▶ Busca auth.users
  └─────────────┘           │
        │            ┌──────┴──────┐
        │            │             │
        │      Existe sem org  Existe com org
        │      (badge verde)   (badge vermelha → BLOQUEIA)
        │            │
        │      Não existe
        │      (badge amarela → mostra campo senha)
        │
        ▼
  Preenche campos opcionais (nome, plano, trial)
        │
        ▼
  Submit → POST admin-api { action: 'create_org_with_user', ... }
        │
        ▼
  ┌─────────────────────────────────┐
  │ Backend:                         │
  │ 1. Busca/cria user              │
  │ 2. INSERT organizations          │
  │ 3. UPSERT organization_members   │
  │ 4. Configura billing/trial       │
  │ 5. Audit log                     │
  │ 6. Retorna resultado             │
  └─────────────────────────────────┘
        │
        ▼
  Toast sucesso + senha temporária (se criado)
  Lista de orgs atualizada
```

---

## Arquivos que serão criados/modificados

| Arquivo | Ação |
|---------|------|
| `supabase/functions/admin-api/index.ts` | Modificar — adicionar `handleCreateOrgWithUser`, `handleListOrphanUsers`, entries no dispatch |
| `src/hooks/useAdminApi.ts` | Modificar — novos types + hooks |
| `src/components/admin/CreateOrgDialog.tsx` | **Criar** — formulário de criação |
| `src/components/admin/OrgsList.tsx` | Modificar — adicionar botão + import |

---

## Estimativa de complexidade

- Backend: ~120 linhas (handler + dispatch + validações)
- Frontend: ~200 linhas (CreateOrgDialog) + ~15 linhas (OrgsList botão) + ~30 linhas (hooks)
- Nenhuma migration SQL
- Deploy: edge function + build frontend + Docker

---

## Aguardando aprovação para executar.
