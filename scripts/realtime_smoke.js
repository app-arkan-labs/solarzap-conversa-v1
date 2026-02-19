
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

console.log('Starting Realtime Smoke Test...');

const channel = supabase.channel('smoke_test')
    .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'interacoes' },
        (payload) => {
            console.log('🔴 [REALTIME INSERT RECEIVED]', payload.new.id, payload.new.mensagem);
            console.log('Full Payload:', JSON.stringify(payload.new, null, 2));
        }
    )
    .subscribe((status) => {
        console.log('🔵 [CHANNEL STATUS]', status);
        if (status === 'SUBSCRIBED') {
            console.log('✅ Listening for INSERTS on public.interacoes...');
        }
    });

// Keep process alive
setInterval(() => { }, 1000);
