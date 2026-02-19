
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env
const rootEnvPath = path.resolve(__dirname, '..', '.env');
const localEnvPath = path.resolve(__dirname, 'env.example');
let envPath = fs.existsSync(rootEnvPath) ? rootEnvPath : (fs.existsSync(localEnvPath) ? localEnvPath : null);

if (!envPath) { console.error("No .env found"); process.exit(1); }

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.replace(/\r\n/g, '\n').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
});

const API_URL = env.EVOLUTION_API_URL || 'https://evo.arkanlabs.com.br';
const API_KEY = env.EVOLUTION_API_KEY || 'YOUR_EVOLUTION_API_KEY';

const INSTANCES = [
    'solarzap-rodrigoarkan-226512',
    'solarzap-rodrigopessoal-178481'
];

async function configureMedia(instanceName) {
    // Try /settings/set/ which is standard for v2
    const url = `${API_URL}/settings/set/${instanceName}`;
    console.log(`\nConfiguring ${instanceName} at ${url}...`);

    const payload = {
        "rejectCall": false,
        "groupsIgnore": false,
        "alwaysOnline": true,
        "readMessages": false,
        "readStatus": false,
        "syncFullHistory": false,
        "media": {
            "type": "base64",
            "download": true,
            "base64": true
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST', // or PUT, but usually POST for settings
            headers: {
                'Content-Type': 'application/json',
                'apikey': API_KEY
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log(`Status: ${response.status}`);
        console.log(`Response: ${text}`);
    } catch (e) {
        console.error(`Error configuring ${instanceName}:`, e.message);
    }
}

async function run() {
    for (const inst of INSTANCES) {
        await configureMedia(inst);
    }
}

run();
