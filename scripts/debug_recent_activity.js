
import { createClient } from '@supabase/supabase-js';

// Load env vars manually since we are running via node (and might not have dotenv setup for this specific folder structure easily, using hardcoded for debug or process.env if available)
// Actually we can try to paste the known creds or use the ones from previous context if safe.
// Assuming we have access to the project URL and Anon Key from the previous context or files.
// Let's use the ones visible in src/lib/supabase.ts or similar if we viewed it?
// I viewed src/lib/supabase.ts but it uses import.meta.env.
// I can assume the user has a local .env file or I can ask the user.
// Wait, I see "c:\Users\rosen\Downloads\solarzap-conversa-main\solarzap-conversa-main\scripts\env.example" in open docs.
// I will try to read the real .env first to get credentials.
// For now, I'll write a script that expects to be run with environment variables or I will read them from the file.

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
    console.error("Please provide VITE_SUPABASE_ANON_KEY env var");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecentActivity() {
    console.log("--- Checking Recent Leads (Last 5) ---");
    const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, nome, status_pipeline, stage_changed_at, valor_estimado, canal')
        .order('stage_changed_at', { ascending: false, nullsFirst: false }) // Check recently moved
        .limit(5);

    if (leadsError) console.error("Leads Error:", leadsError);
    else console.table(leads);

    if (leads && leads.length > 0) {
        const leadIds = leads.map(l => l.id);
        console.log("\n--- Checking Associated Deals for these Leads ---");
        const { data: deals, error: dealsError } = await supabase
            .from('deals')
            .select('*')
            .in('lead_id', leadIds);

        if (dealsError) console.error("Deals Error:", dealsError);
        else console.table(deals);
    }
}

checkRecentActivity();
