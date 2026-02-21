
const API_URL = 'https://evo.arkanlabs.com.br';
const API_KEY = 'eef86d79f253d5f295edcd33b578c94b';
const WEBHOOK_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/evolution-webhook?secret=solar_secret_2026';

const instances = [
    'solarzap-rodrigoarkan-226512',
    'solarzap-rodrigopessoal-178481'
];

async function updateWebhooks() {
    for (const instance of instances) {
        console.log(`\n--- Configuring instance: ${instance} ---`);
        const endpoint = `${API_URL}/webhook/set/${instance}`;

        const payload = {
            "webhook": {
                "enabled": true,
                "url": WEBHOOK_URL,
                "webhookByEvents": false,
                "events": [
                    "MESSAGES_UPSERT",
                    "MESSAGES_UPDATE",
                    "SEND_MESSAGE"
                ]
            }
        };

        try {
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
                console.log(`✅ Webhook updated for ${instance}`);
            } else {
                console.error(`❌ Failed to update webhook for ${instance}`);
            }
        } catch (error) {
            console.error(`❌ Error updating ${instance}:`, error.message);
        }
    }
}

updateWebhooks();
