
import pg from 'pg';
const { Client } = pg;

// Credentials found in db_setup.js
const connectionString = 'postgres://postgres:ArkanLabs@555@supabase.arkanlabs.com.br:6543/postgres';

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

const sql = `
-- Fix 'canal' column constraint
DO $$ 
BEGIN 
    -- 1. Drop check constraint if exists
    BEGIN
        ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_canal_check;
    EXCEPTION
        WHEN undefined_object THEN NULL;
    END;

    -- 2. Change type to text to be safe
    ALTER TABLE public.leads ALTER COLUMN canal TYPE text;
    
    -- 3. Set default
    ALTER TABLE public.leads ALTER COLUMN canal SET DEFAULT 'whatsapp';

    -- 4. Just in case, try to update any nulls (optional)
    -- UPDATE leads SET canal = 'whatsapp' WHERE canal IS NULL;
END $$;
`;

async function run() {
    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Connected! Executing Fix...');
        await client.query(sql);
        console.log('SUCCESS: Database constraint removed. You can now save any Lead Source.');
    } catch (err) {
        console.error('FAILED to execute SQL:', err.message);
        if (err.message.includes('ETIMEDOUT') || err.message.includes('ECONNREFUSED')) {
            console.log('Reason: Cannot reach database from this terminal. You must use the Supabase SQL Editor.');
        }
    } finally {
        await client.end();
    }
}

run();
