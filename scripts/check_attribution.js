
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkAttribution() {
    console.log('Checking recent messages for instance attribution...');

    // Fetch last 5 messages
    const { data, error } = await supabase
        .from('interacoes')
        .select('id, mensagem, whatsapp_instance_id, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('DB Error:', error);
    } else {
        console.log('Recent Messages:', JSON.stringify(data, null, 2));
    }
}

checkAttribution();
