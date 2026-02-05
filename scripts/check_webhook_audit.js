
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

console.log('Keys loaded:', Object.keys(env).join(', '));

const SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
// Fallback to ANON KEY for verification (since we granted permissions to anon in migration)
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: Could not find Supabase URL or Key in .env');
    console.error('Required: VITE_SUPABASE_URL and (SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY)');
    process.exit(1);
}

// 2. Query REST API
async function checkAudit() {
    console.log(`\n--- Checking Verification Table ---`);

    // Construct REST URL
    // Endpoint: /rest/v1/whatsapp_webhook_events
    // Query: ?select=*&order=received_at.desc&limit=5

    const baseUrl = SUPABASE_URL.replace(/\/$/, '');
    const url = `${baseUrl}/rest/v1/whatsapp_webhook_events?select=*&order=received_at.desc&limit=5`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`❌ Erro ao consultar banco: ${response.status} ${response.statusText}`);
            console.error(`Detalhes: ${text}`);
            return;
        }

        const data = await response.json();

        if (data.length === 0) {
            console.log('⚠️  Nenhum evento encontrado na tabela (Tabela vazia).');
            console.log('Isso significa que o webhook NÃO chegou na tabela de auditoria.');
        } else {
            console.log(`✅  Encontrados ${data.length} registro(s) recentes:`);
            console.table(data.map(r => ({
                id: r.id,
                time: r.received_at,
                event: r.event,
                instance: r.instance_name
            })));
        }

    } catch (error) {
        console.error('❌ Erro de conexão:', error.message);
    }
}

checkAudit();
