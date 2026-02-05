import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function testRPC() {
    console.log('Testing RPC get_provider_config...');

    // Login first as the user to simulate real condition
    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'rodrigosenafernandes@gmail.com',
        password: 'AtsWp@3fB&'
    });

    if (loginError) {
        console.error('Login Error:', loginError);
        return;
    }

    const { data, error } = await supabase.rpc('get_provider_config', { p_provider: 'google' });

    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Result:', data);
    }
}

testRPC();
