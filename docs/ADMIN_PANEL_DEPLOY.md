# Admin + Org CORS Deploy Notes

## Secrets (CORS policy)
Para funções chamadas diretamente do browser (incluindo `org-admin`), use allowlist explícita:

- `ALLOWED_ORIGINS` (novo, recomendado): CSV de origens permitidas.
- `ALLOWED_ORIGIN` (legado): fallback backward-compatible.
- `ALLOW_LOCALHOST_CORS` (opcional): `true` para liberar `http://localhost:*` e `http://127.0.0.1:*` em dev.

Exemplo (produção + localhost dev):
```bash
supabase secrets set \
  ALLOWED_ORIGINS="https://solarzap.arkanlabs.com.br,https://app.solarzap.com.br" \
  ALLOW_LOCALHOST_CORS="true"
```

Se você ainda usa `ALLOWED_ORIGIN`, mantenha temporariamente para compat:
```bash
supabase secrets set ALLOWED_ORIGIN="https://solarzap.arkanlabs.com.br"
```

## Matriz de origem por ambiente
- Produção principal: `https://solarzap.arkanlabs.com.br`
- Produção secundária (se ativo): `https://app.solarzap.com.br`
- Staging: definir domínio dedicado no `ALLOWED_ORIGINS`
- Local (somente dev): `ALLOW_LOCALHOST_CORS=true`

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

2. Deploy Edge Functions:
```bash
supabase functions deploy org-admin
supabase functions deploy admin-api
```

3. Deploy frontend:
```bash
npm run build
# publish dist/ with your hosting pipeline
```

## CORS validation checklist (pre-release)
1. Rodar smoke técnico:
```powershell
.\scripts\smoke-cors.ps1 -SupabaseUrl "https://<project>.supabase.co"
```
2. Confirmar para cada origem permitida:
- `OPTIONS` retorna `200`.
- `Access-Control-Allow-Origin` igual à origem testada.
- `Vary: Origin` presente.
3. Testar origem não permitida:
- resposta `403` com `origin_not_allowed`.
4. Teste funcional:
- abrir página de equipe e validar que `list_members` carrega sem `invoke_error`.

## Notes
- `supabase/config.toml` sets `verify_jwt = true` for `admin-api`.
- Write actions in `admin-api` require `reason` and write full audit `before/after`.
