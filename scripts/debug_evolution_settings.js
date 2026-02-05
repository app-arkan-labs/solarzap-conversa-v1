
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

const INSTANCE_NAME = 'solarzap-instanciateste-829711';
const API_URL = env.EVOLUTION_API_URL || 'https://evo.arkanlabs.com.br';
const API_KEY = env.EVOLUTION_API_KEY || 'eef86d79f253d5f295edcd33b578c94b';

console.log(`\n--- Fetching Settings for ${INSTANCE_NAME} ---`);

async function fetchInstances() {
    const url = `${API_URL}/instance/fetchInstances`;
    console.log(`\nTrying GET ${url}...`);
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': API_KEY,
                'Content-Type': 'application/json'
            }
        });
        const text = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${text}`);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

fetchInstances();
