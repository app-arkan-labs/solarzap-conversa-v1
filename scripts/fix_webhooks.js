
import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co'
const SUPABASE_KEY = 'sb_secret_RKe8nY_5Eez8nQENWu3TSw_l81zxlN2'
const EVOLUTION_API_URL = 'https://evo.arkanlabs.com.br'
const EVOLUTION_API_KEY = 'eef86d79f253d5f295edcd33b578c94b'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
    console.log('--- FIXING WEBHOOKS (NODE.JS) ---')

    // 1. Fetch connected instances from Database
    const { data: instances, error } = await supabase
        .from('whatsapp_instances')
        // .select('*') // Can't select * if RLS blocks or columns differ compared to local types.
        .select('instance_name, status') // Minimal selection
        .eq('status', 'connected')

    if (error) {
        console.error('Error fetching instances:', error)
        return
    }

    if (!instances || instances.length === 0) {
        console.log('No connected instances found in DB.')
        return
    }

    console.log(`Found ${instances.length} connected instances.`)

    // 2. For each instance, set the webhook
    for (const inst of instances) {
        const instanceName = inst.instance_name
        console.log(`Configuring webhook for: ${instanceName}`)

        try {
            const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-connect?token=arkan_secure_2026`

            // Try alternate payload structure based on error "instance requires property webhook"
            const body = {
                webhook: {
                    enabled: true,
                    url: webhookUrl,
                    byEvents: true,
                    events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED']
                }
            }

            const response = await fetch(`${EVOLUTION_API_URL}/webhook/set/${instanceName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_KEY
                },
                body: JSON.stringify(body)
            })

            const text = await response.text()
            console.log(`Result for ${instanceName}: ${response.status} - ${text}`)

            if (response.status === 404) {
                console.log(`Instance ${instanceName} not found via API. Marking as disconnected in DB.`)
                await supabase.from('whatsapp_instances')
                    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
                    .eq('instance_name', instanceName)
            }

        } catch (e) {
            console.error(`Failed to set webhook for ${instanceName}:`, e)
        }
    }
    console.log('--- DONE ---')
}

main()
