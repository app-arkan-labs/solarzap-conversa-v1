const fs = require('fs');
const path = require('path');

// 1. Read .env manually to avoid dependencies
const envPath = path.join(__dirname, 'env.example'); // Fallback to example if .env missing, but user should have created .env
const realEnvPath = path.join(__dirname, '.env');
const targetPath = fs.existsSync(realEnvPath) ? realEnvPath : envPath;

console.log(`Reading env from: ${targetPath}`);
const envContent = fs.readFileSync(targetPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1].trim()] = match[2].trim();
    }
});

const SUPABASE_FUNCTION_URL = env.SUPABASE_FUNCTION_URL;
const WEBHOOK_SECRET = env.WEBHOOK_SECRET;
const INSTANCE_NAME = env.INSTANCE_NAME || 'solarzap_test_instance';

if (!SUPABASE_FUNCTION_URL) {
    console.error('Error: SUPABASE_FUNCTION_URL not found in .env');
    process.exit(1);
}

// 2. Simulate Webhook Call
async function testWebhook() {
    const url = `${SUPABASE_FUNCTION_URL}?token=${WEBHOOK_SECRET}`;

    const payload = {
        event: "MESSAGES_UPSERT",
        instance: INSTANCE_NAME,
        data: {
            key: {
                remoteJid: "5511999999999@s.whatsapp.net",
                fromMe: false
            },
            messageType: "conversation",
            message: {
                conversation: "Teste de Diagnostico Phase 3"
            },
            pushName: "Tester"
        }
    };

    console.log(`Sending POST to: ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`Response Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log('Response Body:', text);

        if (response.ok) {
            console.log('✅ Webhook accepted successfully!');
        } else {
            console.error('❌ Webhook rejected.');
        }
    } catch (error) {
        console.error('❌ Network Error:', error.message);
    }
}

testWebhook();
