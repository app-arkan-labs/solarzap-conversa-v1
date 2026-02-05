
import { createClient } from '@supabase/supabase-js';

// Configuration
const FUNCTION_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/evolution-webhook';
const WEBHOOK_SECRET = 'arkan_secure_2026';

// Payload imitating Evolution API with Base64
const payload = {
    event: 'MESSAGES_UPSERT',
    instance: 'solarzap-rodrigoarkan-226512',
    data: {
        key: {
            remoteJid: '5514991436026@s.whatsapp.net',
            fromMe: false,
            id: 'TEST_LIVE_SYNC_' + Date.now()
        },
        pushName: 'Rodrigo Debug Final',
        message: {
            conversation: 'CONFIRMATION SYNC ' + new Date().toLocaleTimeString()
        },
        messageType: 'conversation'
    }
};

async function testWebhook() {
    console.log('Sending Base64 Payload to:', FUNCTION_URL);

    try {
        const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-arkan-webhook-secret': WEBHOOK_SECRET
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log(`Status: ${response.status} ${response.statusText}`);
        console.log('Response Body:', text);
    } catch (err) {
        console.error('Network/Fetch Error:', err);
    }
}

testWebhook();
