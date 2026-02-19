
const EVOLUTION_URL = 'https://evo.arkanlabs.com.br';
const API_KEY = 'YOUR_EVOLUTION_API_KEY';

async function checkStatus() {
    console.log('Fetching Instances list...');
    try {
        const listRes = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
            headers: { 'apikey': API_KEY }
        });

        if (!listRes.ok) throw new Error(`List failed: ${listRes.status}`);
        const instances = await listRes.json();

        console.log(`Found ${instances.length} instances.`);

        if (instances.length > 0) console.log('Sample Instance:', JSON.stringify(instances[0], null, 2));

        for (const inst of instances) {
            const name = inst.instance?.instanceName || inst.instanceName || inst.name || inst.instance?.name;
            console.log(`\nChecking: ${name}...`);

            const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${name}`, {
                headers: { 'apikey': API_KEY }
            });

            if (stateRes.ok) {
                const state = await stateRes.json();
                console.log(`State:`, JSON.stringify(state, null, 2));

                // Also check Webhook config for this instance
                // Some versions use /webhook/find/${name}
                // We will try to fetch webhook info if possible (depends on API version)
            } else {
                console.log(`Could not get state for ${name}`);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

checkStatus();
