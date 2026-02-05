import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables manually since we might not have dotenv
const envPath = path.join(__dirname, '..', '.env');
let envContent = '';
try {
    envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
    console.error("Could not read .env file at", envPath);
}

const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    const key = parts[0]?.trim();
    const value = parts.slice(1).join('=')?.trim();
    if (key && value) {
        env[key] = value;
    }
});

const API_URL = "https://evo.arkanlabs.com.br";
const API_KEY = "eef86d79f253d5f295edcd33b578c94b";
const SUPABASE_FUNCTION_URL = "https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/whatsapp-connect";
const WEBHOOK_SECRET = "sec_21312312-3232-4232-a232-323232323232";

if (!API_URL || !API_KEY || !SUPABASE_FUNCTION_URL || !WEBHOOK_SECRET) {
    console.error('Missing required environment variables.');
    process.exit(1);
}

// Construct the full webhook URL with token
const WEBHOOK_URL_FULL = `${SUPABASE_FUNCTION_URL}?token=${WEBHOOK_SECRET}`;

const instances = [
    'solarzap-rodrigoarkan-226512',
    'solarzap-rodrigopessoal-178481'
];

async function configureWebhook(instanceName) {
    const url = `${API_URL}/webhook/set/${instanceName}`;
    console.log(`\nConfiguring Webhook for ${instanceName} at ${url}...`);

    const payload = {
        "webhook": {
            "enabled": true,
            "url": WEBHOOK_URL_FULL,
            "webhookByEvents": false,
            "webhookBase64": true,
            "events": [
                "QRCODE_UPDATED",
                "CONNECTION_UPDATE",
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE"
            ]
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`Error configuring ${instanceName}: ${response.status} - ${text}`);
            return;
        }

        const data = await response.json();
        console.log(`Success ${instanceName}:`, JSON.stringify(data, null, 2));

        // Verify configuration
        await verifyWebhook(instanceName);

    } catch (error) {
        console.error(`Exception configuring ${instanceName}:`, error);
    }
}

async function verifyWebhook(instanceName) {
    const url = `${API_URL}/webhook/find/${instanceName}`;
    console.log(`Verifying configuration for ${instanceName}...`);
    try {
        const response = await fetch(url, {
            headers: {
                'apikey': API_KEY
            }
        });
        const data = await response.json();
        console.log(`Current Config for ${instanceName}:`);
        console.log(`  enabled: ${data.enabled}`);
        console.log(`  webhookBaes64: ${data.webhookBase64}`); // Should be true
        console.log(`  url: ${data.url}`);
    } catch (error) {
        console.error(`Error verifying ${instanceName}:`, error);
    }
}

async function run() {
    for (const instance of instances) {
        await configureWebhook(instance);
    }
}

run();
