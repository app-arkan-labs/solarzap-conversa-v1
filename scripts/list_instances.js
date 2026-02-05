
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function listInstances() {
    console.log('Listing DB Instances...');
    const { data, error } = await supabase.from('whatsapp_instances').select('instance_name, user_id');
    if (error) {
        console.error('DB Error:', error);
    } else {
        console.log('Instances:', data);
    }
}

listInstances();
