import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function testIntegrationsTable() {
    console.log('Testing user_integrations table access...');

    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'rodrigosenafernandes@gmail.com',
        password: 'AtsWp@3fB&'
    });

    if (loginError) {
        console.error('Login Error:', loginError);
        return;
    }

    const { data, error } = await supabase
        .from('user_integrations')
        .select('*');

    if (error) {
        console.error('Table Select Error:', error);
    } else {
        console.log('Table Result:', data);
    }
}

testIntegrationsTable();
