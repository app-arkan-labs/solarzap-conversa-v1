
import { fileURLToPath } from 'url';
import path from 'path';

const API_URL = 'https://evo.arkanlabs.com.br';
const API_KEY = 'YOUR_EVOLUTION_API_KEY';

async function checkWebhook(instanceName) {
    console.log(`Checking webhook for ${instanceName}...`);
    try {
        const response = await fetch(`${API_URL}/webhook/find/${instanceName}`, {
            headers: { 'apikey': API_KEY }
        });

        if (!response.ok) {
            console.error(`Error ${response.status}: ${await response.text()}`);
            return;
        }

        const data = await response.json();
        console.log(`CONFIG for ${instanceName}:`);
        console.log(`  Enabled: ${data.enabled}`);
        console.log(`  URL: ${data.url}`);
        console.log(`  Events: ${JSON.stringify(data.events)}`);
        // Check for base64 property naming
        console.log(`  Webhook Base64: ${data.webhook_base64} (snake) / ${data.webhookBase64} (camel)`);
    } catch (e) {
        console.error(e);
    }
}

async function main() {
    await checkWebhook('solarzap-rodrigoarkan-226512');
    await checkWebhook('solarzap-rodrigopessoal-178481');
}

main();
