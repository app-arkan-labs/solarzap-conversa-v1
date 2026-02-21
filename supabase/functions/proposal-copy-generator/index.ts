import OpenAI from "npm:openai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type VariantId = 'a' | 'b';
const META_TAG = '[[LEAD_META_JSON]]';

const asString = (value: unknown, max = 800): string => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.slice(0, max);
};

const parseLeadMeta = (obs: unknown): Record<string, unknown> => {
    const raw = asString(obs, 10000);
    if (!raw || !raw.includes(META_TAG)) return {};
    try {
        const parts = raw.split(META_TAG);
        if (parts.length < 2) return {};
        const jsonStr = parts[1].replace(/^:\s*/, '').trim();
        const parsed = JSON.parse(jsonStr);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const asArrayOfString = (value: unknown, maxItems = 6, maxLen = 220): string[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => asString(item, maxLen))
        .filter(Boolean)
        .slice(0, maxItems);
};

const asInteractions = (value: unknown, maxItems = 18) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((row) => ({
            created_at: asString((row as any)?.created_at, 40) || null,
            wa_from_me: Boolean((row as any)?.wa_from_me),
            tipo: asString((row as any)?.tipo, 40),
            mensagem: asString((row as any)?.mensagem, 900),
        }))
        .filter((row) => row.mensagem)
        .slice(0, maxItems);
};

const asDocuments = (value: unknown, maxItems = 4) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((row) => ({
            title: asString((row as any)?.title, 140),
            type: asString((row as any)?.type, 40),
            tags: Array.isArray((row as any)?.tags)
                ? (row as any).tags.map((t: unknown) => asString(t, 40)).filter(Boolean).slice(0, 10)
                : [],
            body_snippet: asString((row as any)?.body_snippet ?? (row as any)?.body, 2600),
        }))
        .filter((row) => row.title || row.body_snippet)
        .slice(0, maxItems);
};

const clampScore = (value: unknown): number => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n);
};

const extractJsonObject = (raw: string): any => {
    const cleaned = raw.trim();
    if (!cleaned) return {};
    try {
        return JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start >= 0 && end > start) {
            const sliced = cleaned.slice(start, end + 1);
            return JSON.parse(sliced);
        }
        throw new Error('invalid_json_from_model');
    }
};

const normalizeVariant = (raw: any, id: VariantId) => {
    const fallbackLabel = id === 'a' ? 'Variante A' : 'Variante B';
    return {
        id,
        label: asString(raw?.label, 80) || fallbackLabel,
        angle: asString(raw?.angle, 120),
        headline: asString(raw?.headline, 220),
        executive_summary: asString(raw?.executive_summary, 1300),
        persona_focus: asString(raw?.persona_focus, 180),
        next_step_cta: asString(raw?.next_step_cta, 180),
        value_pillars: asArrayOfString(raw?.value_pillars, 6, 180),
        proof_points: asArrayOfString(raw?.proof_points, 6, 180),
        objection_handlers: asArrayOfString(raw?.objection_handlers, 6, 220),
        assumptions: asArrayOfString(raw?.assumptions, 6, 220),
        persuasion_score: clampScore(raw?.persuasion_score),
        score_breakdown: {
            clarity: clampScore(raw?.score_breakdown?.clarity),
            personalization: clampScore(raw?.score_breakdown?.personalization),
            value: clampScore(raw?.score_breakdown?.value),
            trust: clampScore(raw?.score_breakdown?.trust),
            cta: clampScore(raw?.score_breakdown?.cta),
        },
    };
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
            return new Response(JSON.stringify({ error: 'missing_supabase_env' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const authHeader = req.headers.get('Authorization') || '';
        const authClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: authData, error: authError } = await authClient.auth.getUser();
        if (authError || !authData?.user) {
            return new Response(JSON.stringify({ error: 'unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        const user = authData.user;

        const body = await req.json().catch(() => ({}));
        const leadId = Number(body?.leadId || 0);
        if (!Number.isFinite(leadId) || leadId <= 0) {
            return new Response(JSON.stringify({ error: 'invalid_lead_id' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const serviceClient = createClient(supabaseUrl, supabaseServiceRole);

        // Validate ownership before generating sensitive sales copy.
        const { data: leadRow, error: leadErr } = await serviceClient
            .from('leads')
            // NOTE: production DB may not have "tipo_cliente" column; it can be stored in leads.observacoes META json.
            .select('id, nome, user_id, observacoes')
            .eq('id', leadId)
            .maybeSingle();
        if (leadErr || !leadRow || leadRow.user_id !== user.id) {
            return new Response(JSON.stringify({ error: 'lead_not_found_or_forbidden' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { data: aiSettings } = await serviceClient
            .from('ai_settings')
            .select('openai_api_key')
            .maybeSingle();

        const apiKey = aiSettings?.openai_api_key || Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'missing_openai_key' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const model = Deno.env.get('PROPOSAL_COPY_MODEL') || 'gpt-4o-mini';
        const openai = new OpenAI({ apiKey });

        const payload = {
            lead: {
                id: leadId,
                name: asString(body?.contactName || leadRow.nome, 120),
                client_type: (() => {
                    const meta = parseLeadMeta((leadRow as any)?.observacoes);
                    const metaClientType = asString((meta as any)?.tipo_cliente, 40);
                    return asString(body?.clientType || metaClientType, 40);
                })(),
                city: asString(body?.city, 80),
                state: asString(body?.state, 40),
            },
            metrics: {
                consumo_mensal_kwh: Number(body?.metrics?.consumoMensal || 0),
                potencia_sistema_kwp: Number(body?.metrics?.potenciaSistema || 0),
                quantidade_paineis: Number(body?.metrics?.quantidadePaineis || 0),
                valor_total_brl: Number(body?.metrics?.valorTotal || 0),
                economia_anual_brl: Number(body?.metrics?.economiaAnual || 0),
                payback_meses: Number(body?.metrics?.paybackMeses || 0),
                garantia_anos: Number(body?.metrics?.garantiaAnos || 0),
            },
            observacoes: asString(body?.observacoes, 400),
            base_content: body?.baseContent || null,
            context: {
                comments: Array.isArray(body?.context?.comments) ? body.context.comments.slice(0, 8) : [],
                interactions: asInteractions(body?.context?.interactions, 18),
                company_profile: body?.context?.companyProfile || {},
                objections: Array.isArray(body?.context?.objections) ? body.context.objections.slice(0, 6) : [],
                testimonials: Array.isArray(body?.context?.testimonials) ? body.context.testimonials.slice(0, 4) : [],
                documents: asDocuments(body?.context?.documents, 4),
            },
        };

        const systemPrompt = `
Você é estrategista de vendas para propostas comerciais de energia solar no Brasil.
Sua tarefa: gerar DUAS versões persuasivas de proposta (A/B), com ângulos diferentes:
- Variante A: foco em economia imediata e retorno financeiro.
- Variante B: foco em segurança, credibilidade e execução sem risco.

Regras obrigatórias:
- Português brasileiro, linguagem profissional e clara.
- Nada genérico; use o contexto do cliente e da empresa recebido no payload.
- Inclua CTA objetivo.
- Importante: esta proposta é apresentada presencialmente (visita já está acontecendo). Não use CTA do tipo "agendar visita" ou "agendar apresentação". Prefira CTA de confirmação/aprovação para iniciar validação técnica final, contrato e cronograma.
- Use o historico recente de conversa (context.interactions) para personalizar e antecipar objecoes.
- Use os documentos importados (context.documents) e a base (company_profile/objections/testimonials) como fonte de argumentos, garantias e diferenciais.
- Nao cite "documento/base de conhecimento" explicitamente; apenas aplique os fatos.
- Nao copie blocos longos do conteudo; sintetize.
- Estruture para decisão comercial rápida.
- Evite exageros não comprováveis.

Retorne SOMENTE JSON válido com esta estrutura:
{
  "variant_a": {
    "label": "string",
    "angle": "string",
    "headline": "string",
    "executive_summary": "string",
    "persona_focus": "string",
    "next_step_cta": "string",
    "value_pillars": ["string"],
    "proof_points": ["string"],
    "objection_handlers": ["string"],
    "assumptions": ["string"],
    "persuasion_score": 0,
    "score_breakdown": {
      "clarity": 0,
      "personalization": 0,
      "value": 0,
      "trust": 0,
      "cta": 0
    }
  },
  "variant_b": { ...mesmos campos... },
  "recommended_variant": "a|b",
  "rationale": "string curta explicando recomendação"
}
`;

        const completion = await openai.chat.completions.create({
            model,
            temperature: 0.45,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(payload) },
            ],
            response_format: { type: 'json_object' },
        });

        const raw = completion.choices?.[0]?.message?.content || '{}';
        const parsed = extractJsonObject(raw);

        const variantA = normalizeVariant(parsed?.variant_a, 'a');
        const variantB = normalizeVariant(parsed?.variant_b, 'b');
        const recommendedVariant = String(parsed?.recommended_variant || 'a').toLowerCase() === 'b' ? 'b' : 'a';
        const rationale = asString(parsed?.rationale, 240);

        return new Response(
            JSON.stringify({
                variants: [variantA, variantB],
                recommendedVariant,
                rationale,
                model,
                generatedAt: new Date().toISOString(),
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (error: any) {
        console.error('proposal-copy-generator error:', error);
        return new Response(
            JSON.stringify({ error: error?.message || 'unexpected_error' }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
