require('dotenv').config();

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution.arkanlabs.com.br'; // example fallback
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = 'solarzap-rodrigopessoa-178481'; // From logs

async function testFetch() {
    console.log('Testing Evolution API Fetch...');
    console.log('URL:', EVOLUTION_URL);
    console.log('Instance:', INSTANCE);

    // Mock Payload for findMessage
    // We don't have a real messageID valid right now maybe, but we can check if instance connects
    const url = `${EVOLUTION_URL}/instance/connectionState/${INSTANCE}`;

    try {
        const resp = await fetch(url, {
            headers: { 'apikey': API_KEY }
        });
        console.log('Connection Check Status:', resp.status);
        const txt = await resp.text();
        console.log('Body:', txt);
    } catch (e) {
        console.error('Fetch Failed:', e);
    }
}

testFetch();
