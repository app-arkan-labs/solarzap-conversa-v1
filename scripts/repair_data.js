
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function repair() {
    console.log('--- STARTING EMERGENCY REPAIR ---');

    // 1. Fetch ALL Leads
    const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('*');

    if (leadsError) {
        console.error('Failed to fetch leads:', leadsError);
        return;
    }

    console.log(`Processing ${leads.length} leads...`);

    let updatedCount = 0;

    for (const lead of leads) {
        // Calculate Canonical E164
        let rawPhone = lead.telefone || '';
        let e164 = rawPhone.replace(/\D/g, '');

        // Basic BR Logic
        if (e164.length >= 10 && e164.length <= 11 && !e164.startsWith('55')) {
            e164 = '55' + e164;
        }

        if (!e164) continue;

        // prepare update
        const updates = { phone_e164: e164 };

        // If name is "Rodrigo Sena" and fromMe created it... we could flag it, but let's just fix the phone_e164 first.

        const { error: upError } = await supabase
            .from('leads')
            .update(updates)
            .eq('id', lead.id);

        if (upError) console.error(`Failed lead ${lead.id}:`, upError);
        else {
            // 2. Propagate to Interactions
            // If the interaction doesn't have phone_e164, gives it the lead's phone_e164
            // We do this PER LEAD to ensure accuracy
            await supabase
                .from('interacoes')
                .update({ phone_e164: e164 })
                .eq('lead_id', lead.id)
                .is('phone_e164', null);

            updatedCount++;
        }
    }

    console.log(`Repaired ${updatedCount} leads and their interactions.`);
}

repair();
