import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY is required.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const WEBHOOK_SECRET = 'solar_secret_2026';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runWebhookMock() {
    console.log("=== PREPARANDO AMBIENTE DE TESTE ===");

    const { data: instance } = await supabase.from('whatsapp_instances').select('id, instance_name, org_id, user_id').eq('id', '6179e08a-f995-4409-8348-2a5dc1f38c08').single();
    const { org_id: orgId, user_id: userId, instance_name: instanceName } = instance || {};

    if (!orgId) throw new Error("Org ID da instancia nao achado");

    // ATIVAR a AI Setting
    const { data: aiSettings } = await supabase.from('ai_settings').select('id, is_active').eq('org_id', orgId).single();
    const originalState = aiSettings?.is_active || false;
    if (!originalState) {
        await supabase.from('ai_settings').update({ is_active: true }).eq('org_id', orgId);
    }

    // ATIVAR A Instancia
    await supabase.from('whatsapp_instances').update({ ai_enabled: true }).eq('id', instance.id);

    const phoneE164 = `5511999990000`;
    const remoteJid = `${phoneE164}@s.whatsapp.net`;

    console.log("-> Criando/Buscando SMOKE_TEST_LEAD...");
    let { data: leadIns } = await supabase.from('leads').select('id').eq('phone_e164', phoneE164).maybeSingle();

    if (!leadIns) {
        const { data: newLead, error: insErr } = await supabase.from('leads').insert({
            org_id: orgId,
            user_id: userId,
            nome: 'SMOKE_TEST_LEAD',
            telefone: phoneE164,
            phone_e164: phoneE164,
            status_pipeline: 'novo_lead', // status inicial legível pela IA
            ai_enabled: true,             // garantir gate 3
            source: 'whatsapp'
        }).select('id').single();
        if (insErr) console.error("Erro insert lead:", insErr);
        leadIns = newLead;
    }
    const leadId = leadIns?.id;
    console.log(`-> Lead de teste ID: ${leadId}`);

    console.log(`=== INGESTÃO DE WEBHOOK (MOCK SMS) ===`);
    const msgId = `qa_${Date.now()}`;
    const payload = {
        event: 'MESSAGES_UPSERT',
        instance: instanceName,
        data: {
            key: { remoteJid, fromMe: false, id: msgId },
            messageType: 'conversation',
            message: { conversation: `Oi, estou procurando energia solar para minha casa. Como funciona?` },
            pushName: 'SMOKE_TEST_LEAD',
        }
    };

    // canonical webhook URL after consolidation (header-only secret)
    const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
    console.log(`-> Disparando Webhook: ${msgId}`);

    const r1 = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-arkan-webhook-secret': WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload)
    });
    console.log("-> Webhook HTTP Status:", r1.status);

    console.log("Aguardando invocação do edge function (15s)...");
    await sleep(15000);

    console.log("\n=== RESULTADOS ===");
    const { data: interacao } = await supabase.from('interacoes').select('id, lead_id, mensagem').match({ wa_message_id: msgId }).maybeSingle();
    console.log(`[Gate Ingestão] Interacao cliente: ${!!interacao}`);

    const { data: agentRuns } = await supabase.from('ai_agent_runs').select('id, status, error_details').eq('lead_id', leadId).order('id', { ascending: false }).limit(2);
    console.log(`[Gate AI Run] ai_agent_runs:`, agentRuns);

    const { data: actionLogs } = await supabase.from('ai_action_logs').select('id, action_type, details').eq('lead_id', leadId).order('id', { ascending: false }).limit(4);
    console.log(`[Gate Action Logs]:`, actionLogs.map(a => a.action_type));

    const { data: outbounds } = await supabase.from('interacoes').select('id, tipo, mensagem').eq('lead_id', leadId).in('tipo', ['mensagem_vendedor', 'mensagem_agente_ia']).order('created_at', { ascending: false }).limit(1);
    console.log(`[Gate Resposta AI]: Mensagem persistida? ${outbounds?.length > 0}`);
    if (outbounds?.length > 0) {
        console.log(`-> Texto IA: ${outbounds[0].mensagem}`);
    }

    // TESTE BURST
    console.log("\n=== TESTE BURST ===");
    const burstPayloads = [1, 2, 3].map(i => ({
        ...payload,
        data: {
            ...payload.data,
            key: { ...payload.data.key, id: `burst_${msgId}_${i}` },
            message: { conversation: `Mais uma duvida ${i}` }
        }
    }));

    for (const p of burstPayloads) {
        await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-arkan-webhook-secret': WEBHOOK_SECRET,
            },
            body: JSON.stringify(p)
        });
        await sleep(200);
    }

    console.log("Burst enviado. Aguardando 15s...");
    await sleep(15000);

    const { data: burstRuns } = await supabase.from('ai_agent_runs').select('id, status, error_details').eq('lead_id', leadId).order('id', { ascending: false }).limit(3);
    console.log(`[Gate Burst] ai_agent_runs:`, (burstRuns || []).map(r => ({ status: r.status, reason: r.error_details?.skipped })));

    // TESTE AÇÕES (move_stage via mock response AI)
    console.log("\n=== TESTE AÇÕES MOCKADAS ===");
    const { data: leadPos } = await supabase.from('leads').select('status_pipeline, ai_enabled').eq('id', leadId).single();
    console.log(`-> Estágio do Lead (move_stage verificação): ${leadPos?.status_pipeline}, ai_enabled=${leadPos?.ai_enabled}`);

    // Restaurar State
    if (!originalState) {
        console.log("\nRestaurando AI_Settings is_active para false");
        await supabase.from('ai_settings').update({ is_active: false }).eq('org_id', orgId);
    }
}

runWebhookMock().catch(console.error);
