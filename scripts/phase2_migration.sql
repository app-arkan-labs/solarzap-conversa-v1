
-- 1. Add canonical columns to LEADS
alter table public.leads 
add column if not exists phone_e164 text,
add column if not exists instance_name text,
add column if not exists whatsapp_name text,
add column if not exists name_source text default 'whatsapp';

-- 2. Add canonical columns to INTERACOES
alter table public.interacoes
add column if not exists phone_e164 text,
add column if not exists remote_jid text; 
-- instance_name already exists in interacoes

-- 3. Backfill LEADS (Best Effort Normalization)
update public.leads
set 
  phone_e164 = case 
    when length(regexp_replace(telefone, '[^0-9]', '', 'g')) = 10 then '55' || regexp_replace(telefone, '[^0-9]', '', 'g')
    when length(regexp_replace(telefone, '[^0-9]', '', 'g')) = 11 then '55' || regexp_replace(telefone, '[^0-9]', '', 'g')
    when length(regexp_replace(telefone, '[^0-9]', '', 'g')) >= 12 then regexp_replace(telefone, '[^0-9]', '', 'g')
    else telefone
  end,
  instance_name = 'legacy_migration' -- temporary filler
where phone_e164 is null;

-- 4. Create Unique Index (The "Ghost Buster" Constraint)
-- We use a partial index or handled logic. 
-- Since we have duplicates NOW, we cannot just add a unique constraint immediately without cleaning up.
-- Strategy: The UNIQUE index will be applied AFTER cleanup or we use it for NEW inserts only via function logic.
-- Ideally: CREATE UNIQUE INDEX CONCURRENTLY ... but let's try to just create it and see if it fails (it will).
-- So, for now, we just prepare the columns.

-- 5. RPC to find/create lead safely (Upsert Logic)
create or replace function public.upsert_lead_canonical(
  p_user_id uuid,
  p_instance_name text,
  p_phone_e164 text,
  p_telefone text,
  p_name text,
  p_push_name text,
  p_source text
)
returns table (id bigint, nome text)
language plpgsql
security definer
as $$
declare
  v_lead_id bigint;
  v_nome text;
begin
  -- 1. Search by Canonical Key (User + Instance + PhoneE164)
  select l.id, l.nome into v_lead_id, v_nome
  from public.leads l
  where l.user_id = p_user_id
    and l.instance_name = p_instance_name
    and l.phone_e164 = p_phone_e164
  limit 1;

  -- 2. If not found, define name
  if v_lead_id is null then
     insert into public.leads (user_id, instance_name, phone_e164, telefone, nome, whatsapp_name, name_source)
     values (p_user_id, p_instance_name, p_phone_e164, p_telefone, coalesce(p_name, p_push_name, p_telefone), p_push_name, p_source)
     returning public.leads.id, public.leads.nome into v_lead_id, v_nome;
  else
     -- 3. Update metadata if found
     update public.leads
     set 
       whatsapp_name = coalesce(p_push_name, whatsapp_name),
       updated_at = now()
     where public.leads.id = v_lead_id;
  end if;

  return query select v_lead_id, v_nome;
end;
$$;
