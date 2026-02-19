
const EVOLUTION_URL = 'https://evo.arkanlabs.com.br';
const API_KEY = 'YOUR_EVOLUTION_API_KEY';
const INSTANCES = ['solarzap-rodrigoarkan-226512']; // Main instance
const TARGET_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/evolution-webhook';

async function disableBase64() {
    for (const instance of INSTANCES) {
        console.log(`Disabling Base64 for: ${instance}...`);

        try {
            const body = {
                webhook: {
                    url: TARGET_URL,
                    webhookByEvents: true,
                    webhookBase64: false, // DISABLE BASE64
                    events: [
                        "QRCODE_UPDATED",
                        "CONNECTION_UPDATE",
                        "MESSAGES_UPSERT",
                        "MESSAGES_UPDATE",
                        "MESSAGES_SET",
                        "CONTACTS_UPSERT"
                    ],
                    enabled: true
                }
            };

            const res = await fetch(`${EVOLUTION_URL}/webhook/set/${instance}`, {
                method: 'POST',
                headers: {
                    'apikey': API_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                console.log('SUCCESS: Base64 Disabled.');
            } else {
                console.log(`Failed: ${res.status}`);
                console.log(await res.text());
            }
        } catch (err) {
            console.error('Error:', err.message);
        }
    }
}

disableBase64();
