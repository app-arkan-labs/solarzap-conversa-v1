const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Read .env manually
const realEnvPath = path.join(__dirname, '.env');
const envPath = fs.existsSync(realEnvPath) ? realEnvPath : path.join(__dirname, 'env.example');

console.log(`Reading env from: ${envPath}`);
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1].trim()] = match[2].trim();
    }
});

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAudit() {
    console.log('Checking whatsapp_webhook_events...');
    const { data, error } = await supabase
        .from('whatsapp_webhook_events')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching audit logs:', error);
        return;
    }

    if (data.length === 0) {
        console.log('No events found in audit table.');
    } else {
        console.table(data.map(r => ({
            id: r.id,
            time: r.received_at,
            event: r.event,
            instance: r.instance_name
        })));
    }
}

checkAudit();
