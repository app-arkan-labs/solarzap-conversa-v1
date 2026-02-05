import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const SUPABASE_URL = envConfig.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envConfig.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testIntegration() {
    console.log('1. Logging in...');
    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email: 'rodrigosenafernandes@gmail.com',
        password: 'AtsWp@3fB&'
    });

    if (loginError) {
        console.error('Login failed:', loginError.message);
        process.exit(1);
    }

    console.log('Login successful. Token acquired.');

    console.log('2. Invoking google-oauth function via fetch...');
    const functionUrl = `${SUPABASE_URL}/functions/v1/google-oauth`;
    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
        }
    });

    const responseText = await response.text();
    console.log('Status:', response.status);
    console.log('Raw Response:', responseText);

    if (!response.ok) {
        console.error('Function invocation failed with status:', response.status);
    } else {
        try {
            const data = JSON.parse(responseText);
            console.log('Function Result:', data);
            if (data?.authUrl) {
                console.log('SUCCESS: Auth URL received!');
                console.log('URL:', data.authUrl);
            } else {
                console.error('FAILURE: No authUrl in response.');
            }
        } catch (e) {
            console.error('Failed to parse JSON:', e);
        }
    }
}

testIntegration();
