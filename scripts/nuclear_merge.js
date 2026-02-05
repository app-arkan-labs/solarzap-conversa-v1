
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODAzOTIxMSwiZXhwIjoyMDgzNjE1MjExfQ.wfo81kDYPZK6wG3aRQyduQbiDX9JAIXxYttkrt4pKo8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function nuclearMerge() {
    const MASTER_ID = 31;
    const GHOST_IDS = [67, 66, 63]; // From previous context + confirmed scan

    console.log(`NUCLEAR MERGE: Moving messages from [${GHOST_IDS}] to MASTER [${MASTER_ID}]...`);

    // 1. Move Messages
    const { data: moved, error: moveError } = await supabase
        .from('interacoes')
        .update({ lead_id: MASTER_ID })
        .in('lead_id', GHOST_IDS);

    if (moveError) {
        console.error('Merge Failed:', moveError);
        return;
    }

    console.log('Messages moved successfully.');

    // 2. Delete Ghosts
    const { error: delError } = await supabase
        .from('leads')
        .delete()
        .in('id', GHOST_IDS);

    if (delError) {
        console.error('Ghost deletion failed (might be referenced elsewhere):', delError);
    } else {
        console.log('Ghosts deleted. Database is CLEAN.');
    }
}

nuclearMerge();
