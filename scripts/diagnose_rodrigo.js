
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('--- Diagnosing Rodrigo Leads ---');
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .ilike('nome', '%Rodrigo%')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching leads:', error);
        return;
    }

    console.table(data.map(l => ({
        id: l.id,
        nome: l.nome,
        telefone: l.telefone,
        phone_e164: l.phone_e164, // CRITICAL
        instance: l.instance_name,
        created: new Date(l.created_at).toLocaleString()
    })));

    console.log('\n--- Recent Interactions for Rodrigo (Lead 66?) ---');
    const { data: ints } = await supabase
        .from('interacoes')
        .select('id, lead_id, mensagem, created_at, phone_e164')
        .order('created_at', { ascending: false })
        .limit(5);

    console.table(ints.map(i => ({
        id: i.id,
        lead_id: i.lead_id,
        msg: i.mensagem.substring(0, 30),
        phone: i.phone_e164,
        created: new Date(i.created_at).toLocaleString()
    })));
}

diagnose();
