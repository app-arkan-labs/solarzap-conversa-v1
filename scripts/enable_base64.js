
const EVOLUTION_URL = 'https://evo.arkanlabs.com.br';
const API_KEY = 'eef86d79f253d5f295edcd33b578c94b';
const INSTANCES = ['solarzap-rodrigoarkan-226512', 'solarzap-rodrigopessoal-178481'];
// The target URL that is already working for text
const TARGET_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/evolution-webhook';

async function enableBase64() {
    for (const instance of INSTANCES) {
        console.log(`Configuring Base64 for: ${instance}...`);

        try {
            const body = {
                webhook: {
                    url: TARGET_URL,
                    webhookByEvents: true,
                    webhookBase64: true, // CRITICAL CHANGE: ENABLE BASE64
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
                console.log('SUCCESS: Base64 Enabled.');
            } else {
                console.log(`Failed: ${res.status}`);
                console.log(await res.text());
            }
        } catch (err) {
            console.error('Error:', err.message);
        }
    }
}

enableBase64();
