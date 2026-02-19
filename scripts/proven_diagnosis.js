
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runProtocol() {
    console.log('--- PROTOCOL STEP 1: PROOF ---');

    console.log('\n[QUERY A] Messages in DB (Last 2 Hours):');
    const { data: msgs, error: msgError } = await supabase
        .from('interacoes')
        .select('id, created_at, mensagem, user_id, lead_id, instance_name, remote_jid, phone_e164')
        .order('created_at', { ascending: false })
        .limit(20);

    if (msgError) console.error('Error Query A:', msgError);
    else console.table(msgs.map(m => ({
        id: m.id,
        created: new Date(m.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        msg: m.mensagem?.substring(0, 20),
        lead_id: m.lead_id,
        phone: m.phone_e164,
        instance: m.instance_name
    })));

    const leadIds = [...new Set(msgs?.map(m => m.lead_id).filter(id => id))];

    console.log('\n[QUERY B] Leads linked to recent messages:');
    if (leadIds.length > 0) {
        const { data: leads, error: leadError } = await supabase
            .from('leads')
            .select('id, nome, telefone, phone_e164, instance_name, updated_at')
            .in('id', leadIds)
            .order('updated_at', { ascending: false });

        if (leadError) console.error('Error Query B:', leadError);
        else console.table(leads.map(l => ({
            id: l.id,
            nome: l.nome,
            phone_e164: l.phone_e164,
            instance: l.instance_name,
            updated: new Date(l.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        })));
    } else {
        console.log('No leads linked to recent messages.');
    }
}

runProtocol();
