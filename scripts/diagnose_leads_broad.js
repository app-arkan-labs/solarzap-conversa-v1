
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('--- BROAD SEARCH ---');
    const { data: leads } = await supabase
        .from('leads')
        .select('*')
        .ilike('nome', '%Rodrigo%')
        .order('id', { ascending: true });

    console.table(leads.map(l => ({
        id: l.id,
        nome: l.nome,
        phone: l.phone_e164 || l.telefone
    })));
}

diagnose();
