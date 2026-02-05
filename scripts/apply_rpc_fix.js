
import pg from 'pg';
const { Client } = pg;

// Credentials from existing scripts
const connectionString = 'postgres://postgres:ArkanLabs@555@supabase.arkanlabs.com.br:6543/postgres';

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

const sql = `
CREATE OR REPLACE FUNCTION public.find_lead_by_phone(p_user_id UUID, p_phone TEXT)
RETURNS TABLE (id BIGINT, nome TEXT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.nome
  FROM leads l
  WHERE l.user_id = p_user_id
    AND (
      l.telefone = p_phone
      OR l.telefone LIKE '%' || p_phone
      OR p_phone LIKE '%' || l.telefone
    )
  LIMIT 1;
END;
$$;
`;

async function run() {
    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Connected! Applying find_lead_by_phone function...');
        await client.query(sql);
        console.log('SUCCESS: Function find_lead_by_phone created/updated.');
    } catch (err) {
        console.error('FAILED to execute SQL:', err.message);
    } finally {
        await client.end();
    }
}

run();
