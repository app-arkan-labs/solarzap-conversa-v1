const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY is required.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkGates() {
    console.log("=== VERIFICANDO GATES DE EXECUÇÃO ===");

    // 1. ai_settings.is_active
    const { data: aiSettings, error: errSettings } = await supabase
        .from('ai_settings')
        .select('id, is_active')
        .limit(1);

    if (errSettings) {
        console.error("Erro ao ler ai_settings:", errSettings);
    } else {
        console.log(`[Gate 1] ai_settings.is_active:`, aiSettings);
    }

    // 2. whatsapp_instances.ai_enabled
    const { data: instances, error: errInst } = await supabase
        .from('whatsapp_instances')
        .select('id, connection_status, is_ai_enabled')
        .limit(5);

    if (errInst) {
        console.error("Erro ao ler whatsapp_instances:", errInst);
    } else {
        console.log(`[Gate 2] whatsapp_instances.is_ai_enabled:`, instances);
    }

    // 3. leads.ai_enabled (ou campos relacionados a IA do lead)
    // Alguns projetos podem não ter ai_enabled direto no lead, vamos verificar o schema
    const { data: leads, error: errLeads } = await supabase
        .from('leads')
        .select('id, name, phase, status, phone')
        .order('created_at', { ascending: false })
        .limit(5);

    if (errLeads) {
        console.error("Erro ao ler leads:", errLeads);
    } else {
        console.log(`[Gate 3] Últimos Leads encontrados:`, leads.map(l => ({ id: l.id, status: l.status, phase: l.phase, phone: l.phone })));
    }
}

checkGates().catch(console.error);
