
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Read .env manually
const rootEnvPath = path.resolve(__dirname, '..', '.env');
const localEnvPath = path.resolve(__dirname, 'env.example');

let envPath = rootEnvPath;
if (!fs.existsSync(rootEnvPath)) {
    if (fs.existsSync(localEnvPath)) envPath = localEnvPath;
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.replace(/\r\n/g, '\n').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        let key = match[1].trim();
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    }
});

// Config - Updated with User Provided Instance
const INSTANCE_NAME = 'solarzap-instanciateste-829711';
const API_URL = env.EVOLUTION_API_URL || 'https://evo.arkanlabs.com.br';
const API_KEY = env.EVOLUTION_API_KEY || 'YOUR_EVOLUTION_API_KEY';

// Construct Webhook URL
const SUPABASE_FUNCTION_URL = env.SUPABASE_FUNCTION_URL || (env.VITE_SUPABASE_URL ? `${env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect` : null);
const WEBHOOK_SECRET = env.WEBHOOK_SECRET || 'YOUR_WEBHOOK_SECRET';

if (!SUPABASE_FUNCTION_URL) {
    console.error('Error: Could not determine Supabase Function URL.');
    process.exit(1);
}

const finalWebhookUrl = `${SUPABASE_FUNCTION_URL}?token=${WEBHOOK_SECRET}`;

console.log(`\n--- Configuring Evolution API ---`);
console.log(`Instance: ${INSTANCE_NAME}`);
console.log(`Target URL: ${finalWebhookUrl}`);
console.log(`Evolution URL: ${API_URL}`);

async function configureWebhook() {
    // URL: /webhook/set/:instance
    const endpoint = `${API_URL}/webhook/set/${INSTANCE_NAME}`;

    // Payload matching Evolution v2 (Wrapped in webhook object)
    const payload = {
        "webhook": {
            "enabled": true,
            "url": finalWebhookUrl,
            "webhookByEvents": true,
            "events": [
                "QRCODE_UPDATED",
                "CONNECTION_UPDATE",
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "MESSAGES_DELETE",
                "SEND_MESSAGE"
            ]
        }
    };

    try {
        console.log('Sending request...');
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': API_KEY
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${text}`);

        if (response.ok) {
            console.log('\n✅ Evolution API Configured Successfully! (200 OK)');
            console.log('Next Step: Send a REAL WhatsApp message to the number and check audit logs.');
        } else {
            console.error('\n❌ Failed to configure Evolution API.');
            console.error('Check if the instance name is correct.');
        }

    } catch (error) {
        console.error('❌ Network Error:', error.message);
    }
}

configureWebhook();
