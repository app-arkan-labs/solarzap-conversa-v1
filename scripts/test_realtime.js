
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;
// No Admin/Service Key needed for listening (since leads is public read or user read)
// We are using ID=... logic in filter? 
// The edge function sets user_id.
// The listener uses filter `user_id=eq.${user.id}` in the Frontend.
// Here we can listen to ALL events if we don't set filter (if RLS allows anon query of all rows - dubious)
// OR we can authenticate as a user.
// BUT, for now let's try to listen to EVERYTHING on public schema.

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Connecting to Realtime for "leads"...');

const channel = supabase
    .channel('test_leads_listener')
    .on(
        'postgres_changes',
        {
            event: '*',
            schema: 'public',
            table: 'leads',
        },
        (payload) => {
            console.log('✅ Realtime Event Received!');
            console.log('Event Type:', payload.eventType);
            console.log('New Record:', payload.new);
        }
    )
    .subscribe((status) => {
        console.log('Subscription Status:', status);
        if (status === 'SUBSCRIBED') {
            console.log('✅ LISTENING. Now run "node scripts/test_webhook_curl.js" in another terminal to trigger an event.');
        }
    });

// Keep process alive forever
setInterval(() => { }, 1000);
