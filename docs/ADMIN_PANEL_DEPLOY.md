# Admin Panel Deploy Notes

## Secrets
- `ALLOWED_ORIGIN` (required) for `admin-api` Edge Function CORS, e.g. `https://app.solarzap.com`.

Set with Supabase CLI:
```bash
supabase secrets set ALLOWED_ORIGIN="https://app.solarzap.com"
```

## Seed first super admin
1. Get the target user UUID from `auth.users`.
2. Run SQL:

```sql
insert into public._admin_system_admins (user_id, role, created_by)
values ('<AUTH_USER_UUID>', 'super_admin', null)
on conflict (user_id)
do update set role = excluded.role;
```

Optional check:

```sql
select user_id, role, is_active, created_at
from public._admin_system_admins
order by created_at desc;
```

## Deploy steps
1. Apply migrations:
```bash
supabase db push
```

2. Deploy Edge Function:
```bash
supabase functions deploy admin-api
```

3. Deploy frontend:
```bash
npm run build
# publish dist/ with your hosting pipeline
```

## Notes
- `supabase/config.toml` sets `verify_jwt = true` for `admin-api`.
- Write actions in `admin-api` require `reason` and write full audit `before/after`.
