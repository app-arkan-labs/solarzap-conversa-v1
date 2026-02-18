# M4 Walkthrough - Lead Visibility (assigned_to_user_id)

Date: 2026-02-18  
Path: B (`node scripts/m0_run_sql.mjs ...`)  
`supabase db push`: not used

## 0) Preflight

Command:

```bash
git status --short
node scripts/m0_run_sql.mjs _deploy_tmp/m4_preflight.sql
```

Result:

- Repo was dirty (many unrelated files already modified/untracked).
- Preflight HTTP 201.
- `user_belongs_to_org(uuid)` exists.
- `leads.org_id` null count = 0.
- `assigned_to_user_id` did not exist before apply.

## 1) Apply

Command:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m4_apply.sql
```

Result (HTTP 201):

- `apply_ok=true`
- `assigned_to_null_count=0`
- `leads_policy_count=5`

Applied changes:

- Added `public.leads.assigned_to_user_id uuid references auth.users(id)`.
- Index `idx_leads_assigned_to`.
- Backfill `assigned_to_user_id = user_id` where null.
- Backed up lead policies in `public._rls_policy_backup_m4`.
- Replaced lead policies with:
  - `leads_visibility` (team-aware visibility)
  - `leads_insert`
  - `leads_update`
  - `leads_delete`
  - `leads_svc`
- Patched `public.upsert_lead_canonical(...)`:
  - INSERT now writes `assigned_to_user_id = p_user_id`
  - UPDATE now sets `assigned_to_user_id = COALESCE(assigned_to_user_id, p_user_id)`

## 2) SQL Gates

Command:

```bash
node scripts/m0_run_sql.mjs _deploy_tmp/m4_gates.sql
```

Final result (HTTP 201):

- `gate_pass=true`
- `assigned_to_null_count=0`
- index exists
- expected policies exist
- `upsert_lead_canonical` contains `assigned_to_user_id`

## 3) Auto-Remediation Log

### Cycle A (mechanical)

- First gate execution failed with `assigned_to_user_id does not exist`.
- Cause: preflight/apply/gates were launched in parallel; gate raced before apply finished.
- Fix: reran gates sequentially after apply.

### Cycle B (mechanical)

- JWT visibility proof failed initially:
  - salesperson saw 2 (correct)
  - owner saw only 2 (expected 4)
- Cause: `organization_members` had RLS enabled and lacked authenticated SELECT policy; the `EXISTS` inside `leads_visibility` couldn't read membership row for owner/admin.
- Fix in apply SQL:
  - created `m4_org_members_self_select` on `public.organization_members`
    (`USING (user_id = auth.uid())`)
- Reapplied SQL and reran gates/JWT proof successfully.

### UI smoke remediation

- Playwright owner toggle test initially failed (still 2 after toggle).
- Cause: `useChat` instantiated its own `useLeads`, so toggle state from layout did not affect conversation source.
- Fix:
  - `useChat(contacts)` now receives contacts from `SolarZapLayout` instead of calling `useLeads` internally.

## 4) JWT Visibility Proof (real JWT, no SET ROLE)

Command:

```bash
node _deploy_tmp/m4_jwt_gates.mjs
```

Result:

- `m4_visibility_pass=true`
- `owner_visible_count=4`
- `sales_visible_count=2`
- `owner_distinct_assigned_to=2`
- `sales_overlap_violations=0`

## 5) Frontend Changes

Implemented minimal app changes for M4:

- `src/hooks/domain/useLeads.ts`
  - create/import lead writes `assigned_to_user_id=user.id`
  - lightweight permission probe from `organization_members`
  - `showTeamLeads` / `canViewTeam` state
  - client-side `Meus` filter fallback by `assignedToUserId`
- `src/components/solarzap/ConversationList.tsx`
  - Toggle `Meus ↔ Empresa` (only when `canViewTeam=true`)
  - `data-testid="toggle-team-leads"`
  - `data-testid="conversation-row"`
- `src/components/solarzap/SolarZapLayout.tsx`
  - passes toggle state/handler into `ConversationList`
  - passes `contacts` into `useChat(...)`
- `src/hooks/domain/useChat.ts`
  - removed internal `useLeads()` call; now accepts contacts from layout
- `src/types/solarzap.ts`, `src/lib/supabase.ts`
  - typed `assigned_to_user_id` / `assignedToUserId`

## 6) Typecheck + E2E

Commands:

```bash
npx tsc --noEmit
npx playwright test tests/e2e/m4-leads-visibility.spec.ts
```

Results:

- `tsc`: pass
- Playwright: 2 passed

## 7) Migration Mirror

Created:

- `supabase/migrations/20260218_m4_lead_visibility.sql`

Mirror of applied SQL (`_deploy_tmp/m4_apply.sql`), idempotent.

## 8) Commit Scope

Only M4 files were staged/committed.  
`_deploy_tmp` artifacts were not committed.
