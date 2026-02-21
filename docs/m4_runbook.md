# RUNBOOK M4 — Lead Visibility (Assigned To)

## Resumo do Objetivo
O Milestone M4 introduz o conceito de "Atribuído a" para leads. Isso permite que vendedores vejam apenas seus próprios leads por padrão, enquanto gestores (Owners/Admins) ou usuários com permissão especial (`can_view_team_leads`) possam ver todos os leads da organização.

## 0) Preflight Checklist
Antes de aplicar, verifique se o Milestone M3 foi concluído e se o banco está pronto.

- **Comandos**:
  - `node scripts/m0_run_sql.mjs _deploy_tmp/m4_preflight.sql`

- **Expectativa**:
  - `M3 Status`: `user_belongs_to_org` existe.
  - `NULL check`: `leads.org_id` não deve conter NULLs.
  - `Column check`: `assigned_to_user_id` pode ou não existir (o apply é idempotente).

## 1) DB Changes (Caminho B - SQL Direto)

1. **Garantir Scripts**: Verifique os arquivos em `_deploy_tmp/`.
2. **Aplicar Visibilidade**:
   ```bash
   node scripts/m0_run_sql.mjs _deploy_tmp/m4_apply.sql
   ```
3. **Validar Portões**:
   ```bash
   node scripts/m0_run_sql.mjs _deploy_tmp/m4_gates.sql
   ```

## 2) App & Frontend Changes
As mudanças de código ativam o toggle de visibilidade e o filtro dinâmico.

### A) Hook `useLeads.ts`
**Arquivo**: [src/hooks/domain/useLeads.ts](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/hooks/domain/useLeads.ts)
```diff
 export function useLeads() {
     const { user } = useAuth();
     const queryClient = useQueryClient();
+    const [showTeamLeads, setShowTeamLeads] = useState(false);
+
+    // Detect if user is Admin/Owner or has permission (M4 fallback)
+    // In M5 this will come from AuthContext. For M4, we can fetch once or assume.
+    const [canViewTeam, setCanViewTeam] = useState(false);
```
```diff
     const leadsQuery = useQuery({
         queryKey: ['leads', user?.id, showTeamLeads],
         queryFn: async () => {
             if (!user) return [];
-            const { data, error } = await supabase
-                .from('leads')
-                .select('*')
-                .eq('user_id', user.id)
-                .order('created_at', { ascending: false });
+            let query = supabase.from('leads').select('*');
+            
+            if (!showTeamLeads) {
+                query = query.eq('assigned_to_user_id', user.id);
+            }
+
+            const { data, error } = await query.order('created_at', { ascending: false });
```

### B) Componente `ConversationList.tsx`
**Arquivo**: [src/components/solarzap/ConversationList.tsx](file:///c:/Users/rosen/Downloads/solarzap-conversa-main/src/components/solarzap/ConversationList.tsx)
```diff
+import { Switch } from '@/components/ui/switch';
...
+ {onToggleTeamVisibility && canViewTeam && (
+   <div className="flex items-center gap-2 px-4 py-2 bg-muted/30">
+     <span className="text-xs font-medium text-muted-foreground">Ver leads da equipe</span>
+     <Switch checked={showTeamLeads} onCheckedChange={onToggleTeamVisibility} />
+   </div>
+ )}
```

## 3) Gates de Verificação

### Gate 1: SQL Integrity
- `assigned_to_user_id` preenchido para 100% dos leads (Backfill OK).

### Gate 2: RLS Isolation (Vendedor)
1. Use um JWT de um usuário com `role='user'` e `can_view_team_leads=false`.
2. Execute: `curl ... /rest/v1/leads?select=id,assigned_to_user_id`
3. **PASS**: Todos os registros retornados devem ter `assigned_to_user_id == auth.uid()`.

### Gate 3: RLS Isolation (Gestor)
1. Use um JWT de um usuário com `role='owner'`.
2. Execute a mesma query.
3. **PASS**: Devem ser retornados leads de diversos vendedores da mesma org.

## 4) Smoke Test (Playwright)
**Arquivo**: `tests/e2e/m4-leads-visibility.spec.ts`
```typescript
test('Owner should see all leads and toggle visibility', async ({ page }) => {
    await loginAs(page, 'owner@example.com');
    await page.goto('/conversas');
    await expect(page.locator('text=Ver leads da equipe')).toBeVisible();
    // Validate counts...
});
```

## 5) Rollback / Backout
1. **SQL**: `node scripts/m0_run_sql.mjs _deploy_tmp/m4_rollback.sql`
2. **Git**: Reverter as mudanças nos arquivos `useLeads.ts` e `ConversationList.tsx`.

## 6) Commit Plan
- **Migration**: `supabase/migrations/20260218_m4_lead_visibility.sql`
- **Mensagem**: `M4: Lead visibility (assigned_to_user_id) + RLS team-aware + frontend toggle`
