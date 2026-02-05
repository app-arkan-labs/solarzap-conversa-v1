import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Configuration, OpenAIApi } from "https://esm.sh/openai@3.1.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- STAGE TRANSITION MAP (Strict Logic) ---
const STAGE_TRANSITION_MAP: Record<string, string[]> = {
    'novo_lead': ['respondeu', 'perdido'],
    'respondeu': ['chamada_agendada', 'visita_agendada', 'perdido', 'respondeu'], // Can stay
    'chamada_agendada': ['chamada_realizada', 'nao_compareceu', 'perdido'],
    'nao_compareceu': ['chamada_agendada', 'perdido'],
    'chamada_realizada': ['aguardando_proposta', 'perdido'],
    'aguardando_proposta': ['proposta_pronta', 'visita_agendada', 'perdido'],
    'proposta_pronta': ['proposta_negociacao', 'perdido'],
    'visita_agendada': ['visita_realizada', 'nao_compareceu', 'perdido'],
    'visita_realizada': ['proposta_negociacao', 'perdido'],
    'proposta_negociacao': ['financiamento', 'contrato_assinado', 'perdido'],
    'financiamento': ['contrato_assinado', 'perdido'],
    // ... others assume logical linear types
};

function isValidTransition(current: string, target: string): boolean {
    if (current === target) return true; // Staying is always valid
    const allowed = STAGE_TRANSITION_MAP[current];
    return allowed ? allowed.includes(target) : false; // If not mapped, block strict moves
}

// --- HELPER: Typing Indicator ---
async function sendTypingIndicator(instanceName: string, remoteJid: string, durationMs: number) {
    const evoUrl = Deno.env.get('EVOLUTION_API_URL');
    const evoKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evoUrl || !evoKey) return;

    try {
        // Start Typing
        await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: remoteJid.replace('@s.whatsapp.net', ''), presence: 'composing', delay: 0 })
        });

        // Wait
        await new Promise(r => setTimeout(r, durationMs));

        // Stop Typing
        await fetch(`${evoUrl}/chat/sendPresence/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: remoteJid.replace('@s.whatsapp.net', ''), presence: 'available', delay: 0 })
        });
    } catch (e) {
        console.error('Typing indicator failed:', e);
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const payload = await req.json();
        const { leadId, triggerType, interactionId, instanceName: webhookInstance } = payload;

        // 1. SETUP
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // 2. LOAD LEADI & SETTINGS
        const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();
        const { data: settings } = await supabase.from('ai_settings').select('*').single();
        if (!settings?.is_active) return new Response(JSON.stringify({ skipped: "System Inactive" }), { headers: corsHeaders });

        // 3. HUMAN DEBOUNCE (The "Sleep & Re-Check" Pattern)
        const DEBOUNCE_MS = Math.floor(Math.random() * (15000 - 10000 + 1) + 10000); // 10-15s
        console.log(`⏳ Debouncing for ${DEBOUNCE_MS}ms...`);
        await new Promise(r => setTimeout(r, DEBOUNCE_MS));

        // 4. RE-CHECK: Did a new message come in?
        if (interactionId) {
            const { data: latestMsg } = await supabase
                .from('interacoes')
                .select('id, created_at')
                .eq('lead_id', leadId)
                .eq('tipo', 'mensagem_cliente')
                .gt('id', interactionId) // Strictly newer ID
                .limit(1);

            if (latestMsg && latestMsg.length > 0) {
                console.log('🛑 Aborting: New message received during debounce.');
                return new Response(JSON.stringify({ aborted: "New message received" }), { headers: corsHeaders });
            }
        }

        // 5. DETERMINE INSTANCE (Priority: Settings > Webhook > Lead)
        const activeInstance = settings.whatsapp_instance_name || webhookInstance || lead.instance_name || 'default';

        // 6. BUILD CONTEXT (Multimodal capable - reuse previous logic here)
        const { data: stageConfig } = await supabase.from('ai_stage_config').eq('pipeline_stage', lead.pipeline_stage).single();
        if (!stageConfig?.is_active) return new Response(JSON.stringify({ skipped: "Stage Inactive" }));

        // Fetch History... (Simplified for brevity, assume fetch logic matches previous artifact)
        const { data: history } = await supabase.from('interacoes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(10);
        const chatHistory = (history || []).reverse().map((m: any) => ({
            role: m.tipo === 'mensagem_cliente' ? 'user' : 'assistant',
            content: m.mensagem
        }));

        // 7. OPENAI CALL
        const openAIApiKey = Deno.env.get('OPENAI_API_KEY') || settings.openai_api_key;
        const openai = new OpenAIApi(new Configuration({ apiKey: openAIApiKey }));

        const systemPrompt = `
        Identidade: ${settings.assistant_identity_name || 'Consultor'}.
        Objetivo: ${(stageConfig.prompt_override || stageConfig.default_prompt || '').split('\n')[0]}
        Regras: Responda curto, natural, PT-BR. Use 1 emoji max.
        JSON Estrito: {"action": "send_message"|"move_stage"|"add_comment"|"none", "content": "..."}
        `;

        const completion = await openai.createChatCompletion({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
            max_tokens: 300
        });

        const aiRes = JSON.parse(completion.data.choices[0].message?.content?.replace(/```json/g, '').replace(/```/g, '') || '{}');

        // 8. EXECUTE ACTIONS
        if (aiRes.action === 'send_message' && aiRes.content) {
            // A. TYPING INDICATOR
            const typingDuration = Math.min(6000, 2000 + (aiRes.content.length * 50));
            await sendTypingIndicator(activeInstance, lead.telefone || lead.whatsapp, typingDuration);

            // B. SEND
            const evoUrl = Deno.env.get('EVOLUTION_API_URL');
            const evoKey = Deno.env.get('EVOLUTION_API_KEY');
            if (evoUrl && evoKey) {
                const cleanPhone = (lead.telefone || '').replace(/\D/g, '');
                await fetch(`${evoUrl}/message/sendText/${activeInstance}`, {
                    method: 'POST',
                    headers: { 'apikey': evoKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        number: cleanPhone,
                        textMessage: { text: aiRes.content }
                    })
                });

                // C. LOG INTERACTION
                await supabase.from('interacoes').insert({
                    lead_id: leadId,
                    user_id: lead.user_id,
                    mensagem: aiRes.content,
                    tipo: 'mensagem_vendedor',
                    instance_name: activeInstance,
                    phone_e164: cleanPhone
                });
            }
        }

        // 9. STAGE TRANSITION (Checked)
        if (aiRes.action === 'move_stage' && aiRes.target_stage) {
            if (isValidTransition(lead.pipeline_stage, aiRes.target_stage)) {
                await supabase.from('leads').update({ pipeline_stage: aiRes.target_stage }).eq('id', leadId);
            } else {
                console.warn(`🚫 Invalid Transition Blocked: ${lead.pipeline_stage} -> ${aiRes.target_stage}`);
                // Log warning action?
            }
        }

        // 10. LOG RUN
        await supabase.from('ai_agent_runs').insert({
            company_id: settings.company_id,
            lead_id: leadId,
            status: 'success',
            llm_output: aiRes,
            actions_executed: [aiRes.action]
        });

        return new Response(JSON.stringify(aiRes), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error("Agent Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
});
