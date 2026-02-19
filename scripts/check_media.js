
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkMedia() {
    console.log('Checking recent messages (last 5)...');

    // Check general messages to see if our test landed
    const { data, error } = await supabase
        .from('interacoes')
        .select('id, mensagem, created_at, user_id, instance_name, lead_id, phone_e164')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Recent Messages:', JSON.stringify(data, null, 2));
    }
}

checkMedia();
