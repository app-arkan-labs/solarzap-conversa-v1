
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkSpecific() {
    const { data, error } = await supabase
        .from('interacoes')
        .select('*')
        .eq('id', 996)
        .single();

    if (error) console.error(error);
    else console.log('Message 996:', JSON.stringify(data, null, 2));
}

checkSpecific();
