const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase
    .from('interacoes')
    .select('*')
    .eq('tipo', 'mensagem_vendedor')
    .order('created_at', { ascending: false })
    .limit(3)
    
  if (error) { console.error('Error:', error); return; }
  console.log('Recent AI responses:', JSON.stringify(data, null, 2))
}

run()
