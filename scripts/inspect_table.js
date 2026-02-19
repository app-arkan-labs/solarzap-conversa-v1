
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function inspect() {
    const { data: leads } = await supabase
        .from('leads')
        .select('id, nome, telefone')
        .ilike('nome', '%Rodrigo Sena%');

    const { data: messages } = await supabase
        .from('interacoes')
        .select('id, lead_id, mensagem, instance_name')
        .ilike('mensagem', '%Harley%')
        .limit(5);

    console.log('Leads:', leads);
    console.log('Messages:', messages);
}

inspect();
