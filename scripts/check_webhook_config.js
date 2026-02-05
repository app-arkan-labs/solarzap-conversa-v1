
const EVOLUTION_URL = 'https://evo.arkanlabs.com.br';
const API_KEY = 'eef86d79f253d5f295edcd33b578c94b';

async function checkWebhooks() {
    const instances = [
        'solarzap-rodrigoarkan-226512',
        'solarzap-rodrigopessoal-178481'
    ];

    for (const name of instances) {
        console.log(`\nChecking Webhook for: ${name}...`);
        try {
            // Try different endpoints as Evolution API versions vary
            const res = await fetch(`${EVOLUTION_URL}/webhook/find/${name}`, {
                headers: { 'apikey': API_KEY }
            });

            if (res.ok) {
                const data = await res.json();
                console.log(JSON.stringify(data, null, 2));
            } else {
                console.log(`Failed to fetch webhook: ${res.status}`);
            }
        } catch (err) {
            console.error('Error:', err.message);
        }
    }
}

checkWebhooks();
