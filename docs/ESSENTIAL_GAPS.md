# ESSENTIAL GAPS — SolarZap "pronto p/ cliente"

Data: 2026-02-19

---

## 1) O que está OK (já pronto)

- ✅ **Multi-tenant DB**: `organizations` + `organization_members` (M1), `org_id NOT NULL` em todas tabelas core (M2/M7), zero nulls confirmados.
- ✅ **RLS org-scoped**: policies com `user_belongs_to_org(org_id)` ativas em todas tabelas auditadas (M3).
- ✅ **AuthContext RBAC backend**: expõe `orgId`, `role`, `canViewTeamLeads` (src/contexts/AuthContext.tsx:5-21, 53-84).
- ✅ **Edge Functions org-aware**: `evolution-webhook`, `ai-pipeline-agent`, `whatsapp-connect` deployados e org-scoped (M6/M7.2).
- ✅ **E2E gates green**: tsc, m2, m4, m5, m7, m7.2 (repeat×3) todos PASS (FINAL_REPORT.md §5).
- ✅ **Storage/Realtime org-scoped**: subscriptions com `filter: org_id=eq.${orgId}` confirmados.

---

## 2) GAPS P0 — bloqueia cliente

| # | O que falta | Onde entra no código | DB impact | Teste/gate |
|---|---|---|---|---|
| P0-1 | **Painel Admin (Members)** — UI para owner listar/adicionar/remover membros, definir role e `can_view_team_leads` | `src/pages/AdminMembers.tsx` [NEW] + rota em `App.tsx` + link no sidebar `SolarZapLayout.tsx` | Não (tabela `organization_members` já existe) | E2E: owner lista membros, altera role → DB reflete |
| P0-2 | **Convite / criação de membro** — Fluxo para convidar novo usuário à org (invite-by-email ou criação direta) | Edge fn `invite-member` [NEW] ou RPC; frontend form em AdminMembers | Possível tabela `invites` OU insert direto em `organization_members` + `auth.users` via service_role | E2E: convite criado, aceite, membro aparece |
| P0-3 | **Guard de rota por role** — Proteger rotas admin (só owner/admin acessam) | `src/components/ProtectedRoute.tsx` (existente, precisa check `role`) | Não | Teste: user com role `agent` não acessa /admin |
| P0-4 | **ForwardMessageModal usa membros reais** — Atualmente hardcoded com dados fake (`ForwardMessageModal.tsx:21-24`) | `src/components/solarzap/ForwardMessageModal.tsx` — trocar array estático por query a `organization_members` | Não | Verificação visual: lista real da org |
| P0-5 | **Login/onboarding owner** — Primeiro acesso cria org + membro owner automaticamente (hoje seed manual via migration) | Lógica em `AuthProvider.signUp` ou edge fn pós-signup | Sim: insert em `organizations` + `organization_members` | SQL: novo signup → row em ambas tabelas |
| P0-6 | **Deploy VPS + domínio + SSL** — App ainda roda em localhost/lovable preview | Nginx/Caddy config, build estático, DNS | Não (infra) | curl https://dominio retorna 200 |
| P0-7 | **Variáveis de ambiente produção** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, Evolution API URL em `.env.production` | `.env.production` [NEW] + build script | Não | Build não falha; app conecta ao Supabase correto |

---

## 3) GAPS P1 — importante, mas não bloqueia MVP

| # | O que falta | Onde entra no código | DB impact | Teste/gate |
|---|---|---|---|---|
| P1-1 | **Billing/subscription stub** — Tela "Meu Plano" com status (free/pro), limites, sem gateway real ainda | `src/pages/BillingPage.tsx` [NEW] + tabela `subscriptions` [NEW] | Sim: create table `subscriptions (id, org_id, plan, status, starts_at, ends_at)` | SQL: org tem row em subscriptions |
| P1-2 | **Travas por plano** — Read-only se plano expirado/free (limite de leads, instâncias) | Hook `usePlanLimits` [NEW] + guards nos componentes | Sim: coluna `plan` em subscriptions lida no frontend | Teste: org com plan=free não cria lead acima do limite |
| P1-3 | **Página de Configurações gerais** — Dados da org (nome, logo, timezone) editáveis pelo owner | `src/pages/OrgSettings.tsx` [NEW] | Possível: colunas extras em `organizations` | Verificação visual |
| P1-4 | **Audit log simplificado** — Registro de ações admin (alterar role, remover membro) | Tabela `audit_logs` [NEW] + insert nos endpoints admin | Sim | SQL: ação admin → row em audit_logs |
| P1-5 | **Notificação de convite** — Email/WhatsApp avisando o convidado | Edge fn ou integração Supabase Auth email templates | Não (Supabase gerencia) | E2E: convite gera email |
| P1-6 | **Dashboard métricas owner** — Resumo de leads/conversões/agentes por período | `src/components/solarzap/OwnerDashboard.tsx` [NEW] | Não (queries em tabelas existentes) | Verificação visual |
| P1-7 | **Multi-instância WhatsApp gerenciamento** — UI para owner conectar/desconectar instâncias (hoje feito ad-hoc) | Melhorar `WhatsAppInstances` view existente | Não | Teste: owner conecta nova instância pela UI |
| P1-8 | **Backup/export dados** — Owner exportar leads/conversas | Edge fn + botão na UI | Não | Download CSV funcional |

---

## Comandos de confirmação (se algo ficou "NÃO CONFIRMADO")

```bash
# Confirmar zero páginas admin
rg -rn "admin|settings|members" src/pages/ --type tsx
# Confirmar tabelas billing
node scripts/m0_run_sql.mjs -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%subscri%' OR table_name LIKE '%billing%' OR table_name LIKE '%plan%';"
```
