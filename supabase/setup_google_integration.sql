-- Create table for storing user integrations (tokens)
create table if not exists public.user_integrations (
  user_id uuid references auth.users not null,
  provider text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  account_email text,
  account_name text,
  account_picture text,
  services jsonb, -- Stores flags like { "calendar": true, "gmail": true }
  connected_at timestamptz default now(),
  primary key (user_id, provider)
);

-- RLS for user_integrations
alter table public.user_integrations enable row level security;
create policy "Users can view own integrations" 
  on public.user_integrations 
  for select 
  using (auth.uid() = user_id);

-- Create table for provider configurations (Client ID/Secret)
create table if not exists public.provider_configs (
  provider text primary key,
  client_id text not null,
  client_secret text not null
);

-- RLS for provider_configs (Service role only typically, or restrictive)
alter table public.provider_configs enable row level security;
-- No public RLS policies needed if accessed via Service Role in Edge Functions

-- Function to get provider config (used by Edge Functions)
create or replace function get_provider_config(p_provider text)
returns table (client_id text, client_secret text)
security definer
as $$
begin
  return query select pc.client_id, pc.client_secret 
  from public.provider_configs pc 
  where pc.provider = p_provider;
end;
$$ language plpgsql;

-- INSERT GOOGLE CREDENTIALS
-- WARNING: This contains sensitive secrets. Delete this file or query after running.
insert into public.provider_configs (provider, client_id, client_secret)
values (
  'google',
  '246386961026-beh1g0r6n3uu2s9jmpo9v59j27gg78jv.apps.googleusercontent.com',
  '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'
)
on conflict (provider) do update
set 
  client_id = excluded.client_id,
  client_secret = excluded.client_secret;
