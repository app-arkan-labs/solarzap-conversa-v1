
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function diagnose() {
    console.log('--- PHASE 1: DIAGNOSIS ---');

    // A) Recent "teste" messages
    console.log('\n[A] Finding recent "teste" messages (Last 24h)...');
    const { data: messages, error: msgError } = await supabase
        .from('interacoes')
        .select('id, created_at, mensagem, user_id, lead_id, instance_name, remote_jid, wa_message_id')
        .or('mensagem.ilike.%teste%,mensagem.ilike.%não está aparecendo%')
        .order('id', { ascending: false })
        .limit(10);

    if (msgError) console.error('Msg Error:', msgError);
    console.table(messages?.map(m => ({
        id: m.id,
        lead_id: m.lead_id,
        time: new Date(m.created_at).toLocaleTimeString(),
        instance: m.instance_name,
        jid: m.remote_jid,
        msg: m.mensagem
    })));

    // B) Leads for involved phones
    console.log('\n[B] Finding Leads for involved phones...');
    const phonesOfInterest = ['5514991436026', '5514991402780', '14991436026', '14991402780'];
    // Construct OR filter manually or fetch all and filter (safer for variations)
    // Using simple ILIKE ORs for Supabase syntax
    const { data: leads, error: leadError } = await supabase
        .from('leads')
        .select('id, user_id, nome, telefone, instance_name, created_at, updated_at')
        .or(`telefone.ilike.%5514991436026%,telefone.ilike.%5514991402780%,telefone.ilike.%14991436026%,telefone.ilike.%14991402780%`)
        .order('updated_at', { ascending: false });

    if (leadError) console.error('Lead Error:', leadError);
    console.table(leads?.map(l => ({
        id: l.id,
        name: l.nome,
        phone: l.telefone,
        instance: l.instance_name || 'N/A', // instance_name might not exist yet in schema
        updated: new Date(l.updated_at).toLocaleString()
    })));

    // C) Verify "Ghost Threads"
    // Identify if messages are split across leads
    if (messages && messages.length > 0) {
        const activeLeadIds = [...new Set(messages.map(m => m.lead_id))];
        console.log('\n[C] Active Lead IDs receiving messages:', activeLeadIds);

        for (const lid of activeLeadIds) {
            const { data: lastMsgs } = await supabase
                .from('interacoes')
                .select('id, created_at, mensagem, instance_name')
                .eq('lead_id', lid)
                .order('id', { ascending: false })
                .limit(3);

            console.log(`\nLast 3 messages for Lead ID ${lid}:`);
            console.table(lastMsgs?.map(m => ({
                id: m.id,
                msg: m.mensagem,
                time: new Date(m.created_at).toLocaleTimeString()
            })));
        }
    }
}

diagnose();
