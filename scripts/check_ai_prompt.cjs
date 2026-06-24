const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase
    .from('ai_stage_config')
    .select('stage, base_prompt, dynamic_variables, qualification_questions')
    .eq('org_id', '2f628c20-6f08-444c-b504-80cc4adf0868')
    
  if (error) { console.error('Error:', error); return; }
  console.log('AI Stage Configs:', JSON.stringify(data, null, 2))
}

run()
