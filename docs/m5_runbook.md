# RUNBOOK M5 — Frontend Org-Aware

## Resumo do Objetivo
O Milestone M5 torna o frontend consciente do modelo multi-tenant. O sistema passará a resolver a organização e as permissões do usuário no momento do login, injetando o `org_id` em todas as operações de escrita (Leads, Mensagens, Propostas, etc.) e isolando dados locais (`localStorage`) por tenant.

## 0) Preflight Checklist
Antes de aplicar, valide se o Milestone M3 (RLS) está ativo e se o usuário possui membership.

- **Comando SQL**:
  ```sql
  SELECT count(*) FROM public.organization_members WHERE user_id = auth.uid();
  ```
- **Expectativa**: O retorno deve ser >= 1. Se for 0, o usuário não verá dados após o deploy.

## 1) Arquitetura Frontend Org-Aware

### A) AuthContext (O Cérebro)
**Arquivo**: `src/contexts/AuthContext.tsx`
- Após resolver o `user` do Supabase, o contexto deve buscar em `organization_members` o `org_id`, `role` e `can_view_team_leads`.
- Expor essas flags para todo o app.

### B) Persistência Isolada (localStorage)
**Arquivo**: `src/contexts/AutomationContext.tsx` (e outros)
- Alterar chaves de `localStorage` para incluir o prefixo da org: `solarzap_settings_${orgId}`.
- Isso previne que um usuário mude de org e continue vendo configurações da org anterior localmente.

### C) Operações de Escrita (Mutation Scope)
**Arquivos**: `useLeads.ts`, `useChat.ts`, `useUserWhatsAppInstances.ts`, etc.
- Todas as `mutations` de `INSERT` e `UPDATE` devem incluir explicitamente `org_id: currentOrgId`.
- Isso garante compatibilidade com o RLS estrito do M3.

### D) Realtime (Subscription Scope)
**Arquivos**: Todos que usam `supabase.channel`.
- Adicionar filtro `org_id=eq.${orgId}`.

## 2) Passos de Implementação (Caminho B)

## 2) Passos de Implementação (Caminho B)

### Passo 1: AuthContext — Resolução de Org
**Arquivo**: [src/contexts/AuthContext.tsx](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/contexts/AuthContext.tsx)
```diff
 interface AuthContextType {
   user: User | null;
+  orgId: string | null;
+  role: string | null;
+  canViewTeamLeads: boolean;
   session: Session | null;
```
```diff
+  const [orgData, setOrgData] = useState<{ id: string, role: string, canViewTeamLeads: boolean } | null>(null);
+
+  const fetchOrgMembership = async (userId: string) => {
+    const { data } = await supabase.from('organization_members')
+      .select('org_id, role, can_view_team_leads')
+      .eq('user_id', userId)
+      .single();
+    if (data) setOrgData({ id: data.org_id, role: data.role, canViewTeamLeads: data.can_view_team_leads });
+  };
```

### Passo 2: LocalStorage Scoped
**Arquivo**: [src/contexts/AutomationContext.tsx](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/contexts/AutomationContext.tsx)
```diff
+ const { orgId } = useAuth();
- const STORAGE_KEY = 'solarzap_automation_settings';
+ const STORAGE_KEY = orgId ? `solarzap_automation_settings_${orgId}` : 'solarzap_automation_settings';
```

### Passo 3: Injeção de `org_id` em Hooks (Escrita)
**Exemplo `useChat.ts`**: [src/hooks/domain/useChat.ts](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/domain/useChat.ts)
```diff
+ const { orgId } = useAuth();
...
  .from('interacoes')
  .insert({
      lead_id: Number(conversationId),
      user_id: user.id,
+     org_id: orgId, // M5: Explicit Injection
      mensagem: content,
```

### Passo 4: Filtros de Subscription Realtime
**Exemplo `useChat.ts`**:
```diff
  .channel(channelName)
  .on('postgres_changes', {
      event: 'INSERT',
      table: 'interacoes',
-     filter: `user_id=eq.${user.id}`,
+     filter: `org_id=eq.${orgId}`,
  }, (payload) => { ... })
```

## 3) Gates de Verificação

### Gate 1: Login Context
1. Logar no app.
2. No Console, verificar se `useAuth().orgId` está preenchido.

### Gate 2: Data Leak Proof (DB)
1. Criar um novo lead pela UI.
2. Verificar no banco (`leads`) se o `org_id` foi preenchido corretamente.

### Gate 3: Playwright Smoke Test
**Arquivo**: `tests/e2e/m5-frontend-org.spec.ts`
```typescript
test('should inject org_id into new leads', async ({ page }) => {
  await login(page, state.userEmail, state.password);
  await createLead(page, 'M5-Lead-Test');
  const { data } = await admin.from('leads').select('org_id').eq('nome', 'M5-Lead-Test').single();
  expect(data.org_id).toBe(state.orgId);
});
```

## 4) Rollback / Backout
- **Estratégia**: `git revert` dos arquivos alterados no Step 2. O M4 já garante que o banco aceita writes sem `org_id` (via trigger), mas o M5 remove a dependência de triggers de app-level.

## 5) Commit Plan
- **Mensagem**: `M5: Frontend org-aware integration (AuthContext, Hooks, LocalStorage)`
