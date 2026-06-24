const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: orgs, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%Franco%Cunha%')
    
  if (orgErr) { console.error('Org error:', orgErr); return; }
  console.log('Orgs found:', orgs)

  if (!orgs || orgs.length === 0) {
    console.log('No org found with name Franco & Cunha')
    return;
  }

  const orgId = orgs[0].id

  const { data: members, error: memErr } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .limit(1)

  if (memErr) { console.error('Mem error:', memErr); return; }
  
  const userId = members[0]?.user_id
  console.log('User ID:', userId)

  const { data: inserted, error: insertErr } = await supabase
    .from('whatsapp_instances')
    .insert({
      org_id: orgId,
      user_id: userId,
      instance_name: 'solarzap-francocunhaenergiasolar-256499',
      display_name: 'Franco&Cunha Energia Solar',
      status: 'connected',
      is_active: true
    })
    .select()

  if (insertErr) {
    console.error('Insert error:', insertErr)
  } else {
    console.log('Successfully recreated instance link:', inserted)
  }
}

run()
