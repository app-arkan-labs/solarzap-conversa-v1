
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
    console.log('--- DB VERIFICATION START ---');

    // 1. Get the most recent proposal
    const { data: proposals, error: propErr } = await supabase
        .from('propostas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (propErr) {
        console.error('Error fetching proposals:', propErr);
        process.exit(1);
    }

    if (!proposals || proposals.length === 0) {
        console.log('No proposals found.');
        return;
    }

    const proposal = proposals[0];
    console.log(`\n1. Latest Proposal ID: ${proposal.id} (Lead: ${proposal.lead_id})`);

    // 2. Get versions for this proposal
    const { data: versions, error: verErr } = await supabase
        .from('proposal_versions')
        .select('id, version_no, created_at, context_snapshot, premium_payload')
        .eq('proposta_id', proposal.id)
        .order('version_no', { ascending: true });

    if (verErr) {
        console.error('Error fetching versions:', verErr);
    } else {
        console.log(`\n2. Versions for Proposal ${proposal.id}:`);
        versions?.forEach(v => {
            const snap = v.context_snapshot ? JSON.stringify(v.context_snapshot).substring(0, 100) + '...' : 'NULL';
            const payload = v.premium_payload ? JSON.stringify(v.premium_payload).substring(0, 100) + '...' : 'NULL';
            console.log(`   - v${v.version_no} (ID: ${v.id}) | Created: ${v.created_at}`);
            console.log(`     Snapshot: ${snap}`);
            console.log(`     Payload: ${payload}`);

            // Check for storage link in payload
            if (v.premium_payload?.storage?.shareUrl || v.premium_payload?.share?.url) {
                console.log(`     ✅ Storage Link Found: ${v.premium_payload.storage?.shareUrl || v.premium_payload.share?.url}`);
            } else {
                console.log(`     ❌ No Storage Link in payload`);
            }
        });
    }

    // 3. Get delivery events for the latest version
    if (versions && versions.length > 0) {
        const latestVersion = versions[versions.length - 1];
        const { data: events, error: evErr } = await supabase
            .from('proposal_delivery_events')
            .select('*')
            .eq('proposal_version_id', latestVersion.id)
            .order('created_at', { ascending: true });

        if (evErr) {
            console.error('Error fetching events:', evErr);
        } else {
            console.log(`\n3. Events for Version ${latestVersion.version_no} (ID: ${latestVersion.id}):`);
            events?.forEach(e => {
                console.log(`   - [${e.event_type}] via ${e.channel} at ${e.created_at}`);
                if (e.metadata) {
                    console.log(`     Metadata: ${JSON.stringify(e.metadata)}`);
                }
            });
        }
    }

    console.log('\n--- DB VERIFICATION END ---');
}

verify();
