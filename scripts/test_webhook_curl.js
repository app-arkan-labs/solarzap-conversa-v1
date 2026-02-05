
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Read .env manually
// Try project root .env first (up one level from scripts/)
const rootEnvPath = path.resolve(__dirname, '..', '.env');
const localEnvPath = path.resolve(__dirname, 'env.example');

let envPath = rootEnvPath;
if (!fs.existsSync(rootEnvPath)) {
    console.log(`Note: .env not found at ${rootEnvPath}, checking scripts/env.example...`);
    if (fs.existsSync(localEnvPath)) {
        envPath = localEnvPath;
    } else {
        console.error("Critical: No .env or env.example found.");
        process.exit(1);
    }
}

console.log(`Reading config from: ${envPath}`);
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

console.log('Keys loaded:', Object.keys(env).join(', '));

const SUPABASE_FUNCTION_URL = env.SUPABASE_FUNCTION_URL || (env.VITE_SUPABASE_URL ? `${env.VITE_SUPABASE_URL}/functions/v1/whatsapp-connect` : null);
const WEBHOOK_SECRET = env.WEBHOOK_SECRET || 'arkan_secure_2026'; // Fallback to hardcoded if missing
const INSTANCE_NAME = env.INSTANCE_NAME || 'solarzap_test_instance';

if (!SUPABASE_FUNCTION_URL) {
    console.error('Error: SUPABASE_FUNCTION_URL or VITE_SUPABASE_URL not found in .env');
    process.exit(1);
}

// 2. Simulate Webhook Call
async function testWebhook() {
    // Append token if not already in URL (handling cases where user put it in .env or not)
    const separator = SUPABASE_FUNCTION_URL.includes('?') ? '&' : '?';
    const url = `${SUPABASE_FUNCTION_URL}${separator}token=${WEBHOOK_SECRET}`;

    const payload = {
        event: "MESSAGES_UPSERT",
        instance: INSTANCE_NAME,
        data: {
            key: {
                remoteJid: "5511999988888@s.whatsapp.net", // New number
                fromMe: true
            },
            messageType: "conversation",
            message: {
                conversation: "Teste de Diagnostico Phase 3 (ZeroDep)"
            },
            pushName: "AGENT_NAME_TEST"
        }
    };

    console.log(`\n--- Sending Webhook ---`);
    console.log(`Target: ${url}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log(`Response: ${text}`);

        if (response.ok) {
            console.log('\n✅ SUCESSO: Webhook aceito pela Edge Function!');
        } else {
            console.error('\n❌ ERRO: Webhook rejeitado.');
        }
    } catch (error) {
        console.error('\n❌ ERRO DE REDE:', error.message);
    }
}

testWebhook();
