const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('instance_name', 'solarzap-francocunhaenergiasolar-256499')
    
  if (error) { console.error('Error:', error); return; }
  console.log('Instance data:', data)
}

run()
