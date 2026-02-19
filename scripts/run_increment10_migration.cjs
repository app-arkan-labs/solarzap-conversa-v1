
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Credentials from user
const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SERVICE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function runMigration() {
    console.log('🚀 Running migration for Increment 10...');

    // We can't easily run raw SQL via JS client without RPC or high privileges on direct connection.
    // However, since we are just inserting a row, we can use the JS client's logical operations :)
    // This is safer and easier than raw SQL if we don't have the CLI set up.

    try {
        console.log('Inserting "aprovou_projeto" into ai_stage_config...');
        const { data, error } = await supabase
            .from('ai_stage_config')
            .upsert({
                pipeline_stage: 'aprovou_projeto',
                is_active: true,
                prompt_override: 'OBJETIVO: Confirmar a aprovação do projeto, parabenizar o cliente e orientar sobre a assinatura do contrato. Manter tom profissional e positivo.',
                agent_goal: 'Confirmar a aprovação do projeto, parabenizar o cliente e orientar sobre a assinatura do contrato.',
                updated_at: new Date().toISOString()
            }, { onConflict: 'pipeline_stage' })
            .select();

        if (error) {
            console.error('❌ Migration Failed:', error);
            process.exit(1);
        }

        console.log('✅ Migration Validated: Row inserted/updated:', data);

    } catch (e) {
        console.error('❌ Unexpected Error:', e);
        process.exit(1);
    }
}

runMigration();
