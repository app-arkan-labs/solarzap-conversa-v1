
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function listInstances() {
    console.log('Listing DB Instances...');
    const { data, error } = await supabase.from('whatsapp_instances').select('instance_name, user_id');
    if (error) {
        console.error('DB Error:', error);
    } else {
        console.log('Instances:', data);
    }
}

listInstances();
