
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function findDupes() {
    console.log('--- Searching for Rodrigo Duplicates ---');

    // 1. Get all leads with normalized phone 5514991436026
    const { data: leads, error } = await supabase
        .from('leads')
        .select('id, nome, phone_e164, created_at, instance_name')
        .eq('phone_e164', '5514991436026')
        .order('created_at', { ascending: true }); // Oldest first

    if (error) console.error(error);

    if (leads && leads.length > 0) {
        console.log(`Found ${leads.length} leads for 5514991436026:`);
        leads.forEach(l => {
            console.log(`[${l.id}] ${l.nome} (${l.phone_e164}) - ${new Date(l.created_at).toLocaleString()} - ${l.instance_name}`);
        });

        const master = leads[0];
        const ghosts = leads.slice(1);

        console.log(`\nPROPOSAL: Keep Master [${master.id}], Merge & Delete [${ghosts.map(g => g.id).join(', ')}]`);
    } else {
        console.log('No leads found with that exact e164 phone.');

        // Fallback search by name
        const { data: byName } = await supabase
            .from('leads')
            .select('id, nome, telefone, phone_e164')
            .ilike('nome', '%Rodrigo Set%') // User said Rodrigo Sena
            .limit(10);

        console.log('Search by Name result:', byName);
    }
}

findDupes();
