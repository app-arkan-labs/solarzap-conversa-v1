import { createClient } from "npm:@supabase/supabase-js@2";
import { Configuration, OpenAIApi } from "npm:openai@3.1.0";

Deno.serve(async (req) => {
    // 1. Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Fetch AI Settings
    const { data: settings } = await supabase.from('ai_settings').select('*').single();
    if (!settings?.is_active) return new Response("AI Active is false");

    // 3. Determine Report Type (Daily/Weekly/Monthly) based on request or schedule
    // For simplicity, we assume the scheduled invocation passes { type: 'daily' } etc.
    const { type } = await req.json().catch(() => ({ type: 'daily' }));

    // Check if enabled
    if (type === 'daily' && !settings.daily_report_enabled) return new Response("Daily report disabled");
    if (type === 'weekly' && !settings.weekly_report_enabled) return new Response("Weekly report disabled");
    if (type === 'monthly' && !settings.monthly_report_enabled) return new Response("Monthly report disabled");

    // 4. Gather Metrics
    const now = new Date();
    const startDate = new Date();

    if (type === 'daily') startDate.setDate(now.getDate() - 1);
    if (type === 'weekly') startDate.setDate(now.getDate() - 7);
    if (type === 'monthly') startDate.setMonth(now.getMonth() - 1);

    const { count: newLeads } = await supabase.from('leads').select('*', { count: 'exact' }).gte('created_at', startDate.toISOString());
    const { count: messagesSent } = await supabase.from('messages').select('*', { count: 'exact' }).gte('timestamp', startDate.toISOString()).eq('isFromClient', false);
    const { count: messagesReceived } = await supabase.from('messages').select('*', { count: 'exact' }).gte('timestamp', startDate.toISOString()).eq('isFromClient', true);

    // Fetch some qualitative data (e.g., last 5 lost leads reasons)
    const { data: lostLeads } = await supabase.from('leads').select('nome, comentarios_leads(texto)').eq('status_pipeline', 'perdido').gte('created_at', startDate.toISOString()).limit(5);

    // 5. Generate Report with LLM
    const openAIApiKey = settings.openai_api_key || Deno.env.get('OPENAI_API_KEY');
    const configuration = new Configuration({ apiKey: openAIApiKey });
    const openai = new OpenAIApi(configuration);

    const prompt = `
    Gere um relatório de performance ${type} para o gerente comercial da SolarZap.
    Período: Último(s) ${type === 'daily' ? '1 dia' : type === 'weekly' ? '7 dias' : '30 dias'}.
    
    METRÍCAS:
    - Novos Leads: ${newLeads}
    - Mensagens Enviadas: ${messagesSent}
    - Mensagens Recebidas: ${messagesReceived}
    
    LEADS PERDIDOS RECENTES (Analise os motivos):
    ${JSON.stringify(lostLeads)}

    Gere um texto curto, motivador e analítico para ser enviado no WhatsApp. Use emojis.
    Foque em: O que está bom? O que precisa melhorar? Sugestão de ação.
    `;

    const completion = await openai.createChatCompletion({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
    });

    const reportContent = completion.data.choices[0].message?.content;

    // 6. Send Report via WhatsApp
    if (settings.report_phone_number && reportContent) {
        await supabase.functions.invoke('evolution-api', {
            body: {
                action: 'send_text',
                phone: settings.report_phone_number,
                text: reportContent,
                instanceName: 'default' // Or fetch from settings
            }
        });
    }

    // 7. Log
    await supabase.from('ai_action_logs').insert({
        action_type: 'report_generated',
        details: `Generated ${type} report`,
        success: true
    });

    return new Response(JSON.stringify({ success: true, report: reportContent }), {
        headers: { 'Content-Type': 'application/json' }
    });
});
