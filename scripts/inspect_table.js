
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8';

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
