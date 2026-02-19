
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkMessage() {
    console.log('Checking database for simulated message...');

    const { data, error } = await supabase
        .from('interacoes')
        .select('id, mensagem, created_at')
        .ilike('mensagem', '%FINAL DEBUG MESSAGE%')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Database Error:', error);
    } else if (data && data.length > 0) {
        console.log('SUCCESS: Found message in DB:', data[0]);
    } else {
        console.error('FAILURE: Simulation returned 200 OK, but message NOT found in DB.');
    }
}

checkMessage();
