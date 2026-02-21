import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY is required.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runTests() {
    console.log("=== V1. VALIDANDO GATES DE EXECUÇÃO ===");

    const { data: aiSettings } = await supabase.from('ai_settings').select('id, is_active').limit(1);
    console.log(`[Gate 1] ai_settings.is_active:`, aiSettings);

    const { data: instances } = await supabase.from('whatsapp_instances').select('id, status, ai_enabled').limit(5);
    console.log(`[Gate 2] whatsapp_instances.ai_enabled:`, instances);

    const { data: leads } = await supabase.from('leads').select('id, nome, ai_enabled').limit(5);
    console.log(`[Gate 3] leads.ai_enabled:`, leads);

    console.log("\n=== V2. TESTE DE INGESTÃO DE WEBHOOK (MOCK) ===");
    // Simulating an insert into whatsapp_webhook_events (if it exists)
    // or testing we can create an interaction directly.
    const { data: evTest, error: errEv } = await supabase.from('whatsapp_webhook_events').select('id').limit(1);
    if (errEv) {
        console.log("whatsapp_webhook_events error:", errEv.message);
    } else {
        console.log("whatsapp_webhook_events exists, count > 0:", evTest.length > 0);
    }

    // Check if interacoes table exists and can be written
    const { data: interacoesTest, error: errInt } = await supabase.from('interacoes').select('id').limit(1);
    if (errInt) {
        console.log("interacoes error:", errInt.message);
    } else {
        console.log("interacoes table connected. Count > 0:", interacoesTest.length > 0);
    }

    console.log("\n=== V3. TESTE DE INVOCAÇÃO E LOGS DO AGENTE ===");
    const { data: aiRuns, error: errRuns } = await supabase.from('ai_agent_runs').select('id, lead_id, status').limit(5);
    if (errRuns) {
        console.log("ai_agent_runs error:", errRuns.message);
    } else {
        console.log("ai_agent_runs table ok. Sample:", aiRuns.slice(0, 2));
    }

    const { data: aiLogs, error: errLogs } = await supabase.from('ai_action_logs').select('id, action_type').limit(5);
    if (errLogs) {
        console.log("ai_action_logs error:", errLogs.message);
    } else {
        console.log("ai_action_logs table ok. Sample:", aiLogs.slice(0, 2));
    }
}

runTests().catch(console.error);
