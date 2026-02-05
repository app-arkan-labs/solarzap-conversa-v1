import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgres://postgres:ArkanLabs@555@supabase.arkanlabs.com.br:6543/postgres';

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for some remote connections
});

const sql = `
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
  services jsonb,
  connected_at timestamptz default now(),
  primary key (user_id, provider)
);

alter table public.user_integrations enable row level security;
-- Drop policies to avoid error on retry
drop policy if exists "Users can view own integrations" on public.user_integrations;
create policy "Users can view own integrations" on public.user_integrations for select using (auth.uid() = user_id);

create table if not exists public.provider_configs (
  provider text primary key,
  client_id text not null,
  client_secret text not null
);

alter table public.provider_configs enable row level security;

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
`;

async function run() {
    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Connected! Running SQL...');
        await client.query(sql);
        console.log('SQL Executed Successfully!');
    } catch (err) {
        console.error('Error executing SQL:', err);
    } finally {
        await client.end();
    }
}

run();
