
import { createClient } from '@supabase/supabase-js';

// User Provided Service Role Key
const supabaseUrl = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const supabaseKey = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log('Testing connection and RPC function...');

    // 1. Test basic connection
    const { data: leads, error: leadError } = await supabase.from('leads').select('count').limit(1);
    if (leadError) {
        console.error('CRITICAL: Database connection failed:', leadError);
    } else {
        console.log('Database connection: OK');
    }

    // 2. Test RPC
    const { data, error } = await supabase.rpc('find_lead_by_phone', {
        p_user_id: 'd0e5a8c9-7708-410a-b31b-756187680000', // Dummy UUID format
        p_phone: '5511999999999'
    });

    if (error) {
        if (error.message.includes('function') && error.message.includes('not exist')) {
            console.error('FAIL: RPC function "find_lead_by_phone" MISSING.');
        } else {
            console.error('FAIL: RPC call error:', error);
        }
    } else {
        // Even if it returns no data (null), if no error, the function Exists.
        console.log('SUCCESS: RPC function "find_lead_by_phone" EXISTS and is callable.');
    }
}

verify();
