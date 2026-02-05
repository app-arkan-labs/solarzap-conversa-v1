
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) { process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
    console.log("Testing Deal Insert for Lead 59...");

    // 1. Get user_id from lead
    const { data: lead } = await supabase.from('leads').select('user_id').eq('id', 59).single();
    if (!lead) { console.error("Lead 59 not found"); return; }

    console.log("Lead Value:", 18000, "User ID:", lead.user_id);

    // 2. Try Insert
    const { data, error } = await supabase.from('deals').insert({
        lead_id: 59,
        user_id: lead.user_id,
        status: 'won',
        amount: 18000,
        closed_at: new Date().toISOString()
    }).select();

    if (error) {
        console.error("INSERT FAILED:", error);
    } else {
        console.log("INSERT SUCCESS:", data);
    }
}

testInsert();
