
const EVOLUTION_URL = 'https://evo.arkanlabs.com.br';
const API_KEY = 'YOUR_EVOLUTION_API_KEY';
const TARGET_INSTANCE = 'solarzap-rodrigopessoal-178481';
const NEW_WEBHOOK_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co/functions/v1/evolution-webhook';

async function fixWebhook() {
    console.log(`Fixing Webhook for: ${TARGET_INSTANCE}...`);

    try {
        const body = {
            webhook: {
                url: NEW_WEBHOOK_URL,
                webhookByEvents: true,
                webhookBase64: false,
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

        const res = await fetch(`${EVOLUTION_URL}/webhook/set/${TARGET_INSTANCE}`, {
            method: 'POST',
            headers: {
                'apikey': API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            const data = await res.json();
            console.log('SUCCESS:', JSON.stringify(data, null, 2));
        } else {
            console.log(`Failed to set webhook: ${res.status} ${res.statusText}`);
            const errText = await res.text();
            console.log('Error:', errText);
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}

fixWebhook();
