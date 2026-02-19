import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY.startsWith('YOUR_')) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function checkStatus() {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('instance_name, status, phone_number');

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log('Instances Status:', JSON.stringify(data, null, 2));
}

checkStatus();
