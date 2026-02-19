import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CONFIGURATION
const API_URL = 'https://evo.arkanlabs.com.br';
const API_KEY = 'YOUR_EVOLUTION_API_KEY';
const CORRECT_WEBHOOK_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/evolution-webhook?token=YOUR_WEBHOOK_SECRET';

console.log('🚀 Starting Webhook Fix...');

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'apikey': API_KEY
        }
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(`${API_URL}${endpoint}`, options);
        return await res.json();
    } catch (e) {
        console.error(`Error requesting ${endpoint}:`, e.message);
        return null;
    }
}

async function fix() {
    // 1. Fetch Instances
    console.log('🔍 Fetching instances...');
    const instancesResponse = await apiCall('/instance/fetchInstances');

    if (!instancesResponse) {
        console.error('❌ Failed to connect to Evolution API');
        Deno.exit(1);
    }

    // Normalize response
    const instances = Array.isArray(instancesResponse) ? instancesResponse : (instancesResponse.data || []);

    if (instances.length === 0) {
        console.error('⚠️ No instances found.');
        Deno.exit(0);
    }

    console.log(`✅ Found ${instances.length} instances.`);

    for (const item of instances) {
        const name = item.instance.instanceName;
        console.log(`\n🔧 Configuring Webhook for: ${name}...`);

        const payload = {
            webhookUrl: CORRECT_WEBHOOK_URL,
            webhookByEvents: true,
            events: [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'CONNECTION_UPDATE',
                'QRCODE_UPDATED',
                'SEND_MESSAGE'
            ]
        };

        const res = await apiCall(`/webhook/set/${name}`, 'POST', payload);

        if (res && (res.success || res.message?.includes('success'))) {
            // Verifica se ficou certo
            const check = await apiCall(`/webhook/find/${name}`);
            const currentUrl = check?.webhook?.url || check?.url;

            if (currentUrl === CORRECT_WEBHOOK_URL) {
                console.log(`✅ SUCCESS! Webhook updated to: ${currentUrl}`);
            } else {
                console.log(`⚠️ Warning: API returned success but verify showed: ${currentUrl}`);
            }
        } else {
            console.error(`❌ Error configuring ${name}:`, JSON.stringify(res));
        }
    }

    console.log('\n🏁 DONE. Please ask the user to test by sending a message.');
}

fix();
