# Walkthrough M8 - Admin Members (RBAC, invites, bootstrap)

Data: 2026-02-19

## 1) Objetivo
- Entregar painel admin de membros com RBAC owner/admin.
- Convidar/criar membro por email (modo hibrido `create` + `invite`).
- Atualizar role e `can_view_team_leads`.
- Remover membro com trava de ultimo owner.
- Trocar hardcode de equipe no encaminhamento por membros reais.
- Bootstrap automatico de org+membership no primeiro login sem membership.

## 2) Arquivos tocados
- `supabase/functions/org-admin/index.ts`
- `src/lib/orgAdminClient.ts`
- `src/pages/AdminMembersPage.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/solarzap/SolarZapNav.tsx`
- `src/components/solarzap/SolarZapLayout.tsx`
- `src/components/solarzap/ForwardMessageModal.tsx`
- `src/components/solarzap/ChatArea.tsx`
- `src/contexts/AuthContext.tsx`
- `src/App.tsx`
- `tests/e2e/m8-admin-members.spec.ts`

## 3) Evidencias de auditoria e implementacao
- Snapshot inicial:
  - `_deploy_tmp/audit_m8/head_before.txt`
  - `_deploy_tmp/audit_m8/branch_before.txt`
  - `_deploy_tmp/audit_m8/git_status_before.txt`
  - `_deploy_tmp/audit_m8/docs_ls.txt`
- Mapeamento de rotas/guards/hardcode:
  - `_deploy_tmp/audit_m8/rg_routes.txt`
  - `_deploy_tmp/audit_m8/rg_protected_route.txt`
  - `_deploy_tmp/audit_m8/rg_forward_modal.txt`
- Trechos-chave da function:
  - `_deploy_tmp/audit_m8/key_org_admin_fn.txt`

## 4) RBAC e bootstrap (resumo tecnico)
- Function `org-admin` valida JWT manualmente via `auth.getUser`.
- `list_members`, `invite_member`, `update_member`, `remove_member`: apenas owner/admin.
- `bootstrap_self`: permitido sem membership e cria org+membership owner quando necessario.
- `remove_member` e democao de owner bloqueiam remocao do ultimo owner.
- Convite hibrido:
  - `mode=create`: cria usuario com senha temporaria.
  - `mode=invite`: envia invite por email.
- Guard de rota no frontend:
  - `ProtectedRoute requiredRoles={['owner','admin']}` em `/admin/members`.

## 5) Gates M8
- Typecheck:
  - Comando: `cmd /c npx tsc --noEmit`
  - Evidencia: `_deploy_tmp/audit_m8/tsc_m8.txt`
  - Resultado: PASS

- E2E novo M8:
  - Comando: `cmd /c npx playwright test tests/e2e/m8-admin-members.spec.ts --reporter=line`
  - Evidencia final: `_deploy_tmp/audit_m8/pw_m8_admin_members.txt`
  - Resultado: PASS
  - Remediacoes aplicadas:
    - Ciclo 1: deploy inicial da function (`_deploy_tmp/audit_m8/deploy_org_admin_cycle1.txt`)
    - Ciclo 2: deploy com `--no-verify-jwt` e envio explicito de bearer no cliente (`_deploy_tmp/audit_m8/deploy_org_admin_no_verify_jwt_cycle2.txt`)

- Regressao minima:
  - Comando: `cmd /c npx playwright test tests/e2e/m5-frontend-org.spec.ts --reporter=line`
  - Evidencia: `_deploy_tmp/audit_m8/pw_m5_regress.txt`
  - Resultado: PASS

## 6) Observacoes
- M8 nao exigiu migration de schema.
- M9 mantido fora do escopo (sem alteracoes de codigo neste ciclo).
- Deploy final da function sera reaplicado apos commit M8 para prova no gate de release.
