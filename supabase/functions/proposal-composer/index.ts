import OpenAI from "npm:openai";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
if (!ALLOWED_ORIGIN) {
  throw new Error("Missing ALLOWED_ORIGIN env");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type VariantId = "a" | "b";
type SectionSource = "manual" | "ai" | "hybrid";

const META_TAG = "[[LEAD_META_JSON]]";

const asString = (value: unknown, max = 800): string => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, max);
};

const clampScore = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
};

const parseLeadMeta = (obs: unknown): Record<string, unknown> => {
  const raw = asString(obs, 10000);
  if (!raw || !raw.includes(META_TAG)) return {};
  try {
    const parts = raw.split(META_TAG);
    if (parts.length < 2) return {};
    const jsonStr = parts[1].replace(/^:\s*/, "").trim();
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const asArrayOfString = (
  value: unknown,
  maxItems = 8,
  maxLen = 240,
): string[] => {
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

const asDocuments = (value: unknown, maxItems = 6) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({
      id: asString((row as any)?.id, 80),
      title: asString((row as any)?.title, 140),
      type: asString((row as any)?.type, 40),
      tags: Array.isArray((row as any)?.tags)
        ? (row as any).tags.map((t: unknown) => asString(t, 40)).filter(Boolean)
          .slice(0, 10)
        : [],
      body_snippet: asString((row as any)?.body_snippet ?? (row as any)?.body, 3000),
    }))
    .filter((row) => row.title || row.body_snippet)
    .slice(0, maxItems);
};

const extractJsonObject = (raw: string): any => {
  const cleaned = raw.trim();
  if (!cleaned) return {};
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = cleaned.slice(start, end + 1);
      return JSON.parse(sliced);
    }
    throw new Error("invalid_json_from_model");
  }
};

type ProposalSectionOut = {
  section_key: string;
  section_title?: string;
  section_order?: number;
  content: Record<string, unknown>;
  source?: SectionSource;
};

const normalizeSection = (raw: any, defaultOrder: number): ProposalSectionOut | null => {
  const key = asString(raw?.section_key ?? raw?.key, 80).toLowerCase();
  if (!key) return null;
  const title = asString(raw?.section_title ?? raw?.title, 140);
  const order = Number(raw?.section_order ?? raw?.order ?? defaultOrder);
  const safeOrder = Number.isFinite(order) ? Math.max(0, Math.min(1000, Math.floor(order))) : defaultOrder;
  const content = raw?.content && typeof raw.content === "object" ? raw.content : {};
  const sourceRaw = asString(raw?.source, 12).toLowerCase();
  const source: SectionSource =
    sourceRaw === "ai" ? "ai" : sourceRaw === "hybrid" ? "hybrid" : sourceRaw === "manual" ? "manual" : "ai";

  return {
    section_key: key,
    section_title: title || undefined,
    section_order: safeOrder,
    content: content as Record<string, unknown>,
    source,
  };
};

const normalizeVariant = (raw: any, id: VariantId) => {
  const fallbackLabel = id === "a" ? "Proposta A" : "Proposta B";

  const sectionsRaw = Array.isArray(raw?.sections) ? raw.sections : [];
  const normalizedSections = sectionsRaw
    .map((s: any, idx: number) => normalizeSection(s, 100 + idx * 10))
    .filter((s: ProposalSectionOut | null) => Boolean(s)) as ProposalSectionOut[];

  // Ensure deterministic order and avoid duplicate keys (unique index downstream).
  const seen = new Set<string>();
  const sections = normalizedSections
    .sort((a, b) => Number(a.section_order || 0) - Number(b.section_order || 0))
    .filter((s) => {
      if (seen.has(s.section_key)) return false;
      seen.add(s.section_key);
      return true;
    })
    .slice(0, 24);

  // ── Premium V2 fields ──
  const visitSteps = asArrayOfString(raw?.visit_steps, 10, 300);
  const bantRaw = Array.isArray(raw?.bant_qualification) ? raw.bant_qualification : [];
  const bantQualification = bantRaw
    .map((r: any) => ({
      item: asString(r?.item, 40),
      status: asString(r?.status, 120),
      question: asString(r?.question, 240),
    }))
    .filter((r: any) => r.item)
    .slice(0, 6);
  const termsConditions = asArrayOfString(raw?.terms_conditions, 12, 400);
  const nextStepsRaw = Array.isArray(raw?.next_steps_detailed) ? raw.next_steps_detailed : [];
  const nextStepsDetailed = nextStepsRaw
    .map((r: any) => ({
      step: asString(r?.step, 80),
      description: asString(r?.description, 300),
    }))
    .filter((r: any) => r.step)
    .slice(0, 8);

  return {
    id,
    label: asString(raw?.label, 80) || fallbackLabel,
    angle: asString(raw?.angle, 160),
    headline: asString(raw?.headline, 220),
    executive_summary: asString(raw?.executive_summary, 1600),
    persona_focus: asString(raw?.persona_focus, 220),
    next_step_cta: asString(raw?.next_step_cta, 220),
    value_pillars: asArrayOfString(raw?.value_pillars, 8, 200),
    proof_points: asArrayOfString(raw?.proof_points, 10, 220),
    objection_handlers: asArrayOfString(raw?.objection_handlers, 10, 260),
    assumptions: asArrayOfString(raw?.assumptions, 10, 260),
    visit_steps: visitSteps,
    bant_qualification: bantQualification,
    terms_conditions: termsConditions,
    next_steps_detailed: nextStepsDetailed,
    sections,
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
      return new Response(JSON.stringify({ error: "missing_supabase_env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = authData.user;

    const body = await req.json().catch(() => ({}));
    const leadId = Number(body?.leadId || 0);
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return new Response(JSON.stringify({ error: "invalid_lead_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRole);

    const { data: leadRow, error: leadErr } = await serviceClient
      .from("leads")
      .select("id, nome, user_id, observacoes")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr || !leadRow || leadRow.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "lead_not_found_or_forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: aiSettings } = await serviceClient
      .from("ai_settings")
      .select("openai_api_key")
      .maybeSingle();

    const apiKey = aiSettings?.openai_api_key || Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "missing_openai_key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = Deno.env.get("PROPOSAL_COMPOSER_MODEL") || "gpt-4o-mini";
    const openai = new OpenAI({ apiKey });

    const meta = parseLeadMeta((leadRow as any)?.observacoes);

    const metrics = {
      consumo_mensal_kwh: Number(body?.metrics?.consumoMensal || 0),
      potencia_sistema_kwp: Number(body?.metrics?.potenciaSistema || 0),
      quantidade_paineis: Number(body?.metrics?.quantidadePaineis || 0),
      valor_total_brl: Number(body?.metrics?.valorTotal || 0),
      economia_anual_brl: Number(body?.metrics?.economiaAnual || 0),
      payback_meses: Number(body?.metrics?.paybackMeses || 0),
      garantia_anos: Number(body?.metrics?.garantiaAnos || 0),
    };

    const monthlySavings = metrics.economia_anual_brl > 0 ? metrics.economia_anual_brl / 12 : 0;
    const roi25 = metrics.valor_total_brl > 0
      ? ((metrics.economia_anual_brl * 25 - metrics.valor_total_brl) / metrics.valor_total_brl) * 100
      : 0;

    const payload = {
      lead: {
        id: leadId,
        name: asString(body?.contactName || leadRow.nome, 120),
        client_type: (() => {
          const metaClientType = asString((meta as any)?.tipo_cliente, 40);
          return asString(body?.clientType || metaClientType, 40);
        })(),
        city: asString(body?.city, 80),
        state: asString(body?.state, 40),
      },
      metrics: {
        ...metrics,
        economia_mensal_brl: monthlySavings,
        roi_25y_percent: roi25,
      },
      observacoes: asString(body?.observacoes, 500),
      context: {
        comments: Array.isArray(body?.context?.comments) ? body.context.comments.slice(0, 10) : [],
        interactions: asInteractions(body?.context?.interactions, 18),
        company_profile: body?.context?.companyProfile || {},
        objections: Array.isArray(body?.context?.objections) ? body.context.objections.slice(0, 8) : [],
        testimonials: Array.isArray(body?.context?.testimonials) ? body.context.testimonials.slice(0, 6) : [],
        documents: asDocuments(body?.context?.documents, 6),
      },
    };

    const systemPrompt = `
Você é um estrategista comercial sênior especializado em propostas de energia solar (Brasil).

Objetivo: gerar DUAS versões A/B altamente persuasivas e premium para a mesma proposta.
- Variante A: foco em economia/retorno (payback/ROI) e decisão rápida.
- Variante B: foco em segurança, confiança e execução sem risco (garantia/processo/provas).

Regras obrigatórias:
- Português brasileiro. Tom profissional, direto, premium. Sem clichês.
- A primeira dobra deve responder: "quanto custa", "quanto economiza" e "por que confiar".
- PRIORIDADE MÁXIMA: Personalize a proposta com base nos COMENTÁRIOS INTERNOS (context.comments) e no HISTÓRICO DE CONVERSA/WHATSAPP (context.interactions). Esses dados contêm as dores, objeções, preferências e momento do cliente. Adapte o tom, os argumentos e o foco da proposta ao que o cliente demonstrou na conversa. Os números financeiros e técnicos já estarão nas tabelas do PDF — o seu papel é criar TEXTO persuasivo e personalizado a partir do contexto humano.
- Use também o perfil da empresa, objeções, depoimentos e documentos quando disponíveis.
- Não mencione "base de conhecimento" ou "documentos" explicitamente; apenas use os fatos.
- Não invente números. Números financeiros e técnicos devem vir de payload.metrics.
- Se um dado estiver ausente/0, seja transparente e não chute; use linguagem condicional.
- NÃO inclua "próximos passos" ou CTA do tipo "agendar visita" na proposta — ela é apresentada presencialmente durante a visita. O campo next_step_cta deve conter uma frase de fechamento/aprovação do tipo "Vamos seguir? Confirme para iniciarmos a validação técnica e cronograma de instalação." Nunca sugira agendar algo que já está acontecendo.

Estrutura obrigatória por variante:
- Campos "headline", "executive_summary", "persona_focus", "next_step_cta" e listas.
- Também inclua "sections" (JSON estruturado) para persistência e renderização:
  - first_fold: { headline, subheadline, bullets[3..5], trust_proofs[2..4] }
  - roi_payback: { summary, bullets[3..6] }
  - proof_points: { items[4..8] }
  - warranty_and_risk: { items[3..6] }
  - financing: { items[3..6] }
  - objections: { items[3..8] }
  - next_steps: { cta, steps[3..6] }
  - assumptions: { items[3..8] }

NOVOS campos obrigatórios (Premium V2) — estes alimentam gráficos e páginas extras do PDF:
- "visit_steps": ["string"] — 5 a 8 etapas de como conduzir a visita ao cliente (roteiro do vendedor).
- "bant_qualification": [{ "item": "Budget|Authority|Need|Timeline", "status": "string", "question": "string de validação" }] — 4 linhas BANT.
- "terms_conditions": ["string"] — 6 a 10 condições gerais da proposta (validade, premissas, garantias, prazo).
- "next_steps_detailed": [{ "step": "string", "description": "string" }] — 4 a 7 passos detalhados para pós-aprovação (aprovação -> vistoria -> projeto -> instalação -> homologação -> geração).

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
    "visit_steps": ["string"],
    "bant_qualification": [{ "item": "string", "status": "string", "question": "string" }],
    "terms_conditions": ["string"],
    "next_steps_detailed": [{ "step": "string", "description": "string" }],
    "sections": [
      { "section_key": "first_fold", "section_title": "string", "section_order": 10, "content": { } },
      { "section_key": "roi_payback", "section_title": "string", "section_order": 20, "content": { } },
      { "section_key": "proof_points", "section_title": "string", "section_order": 30, "content": { } },
      { "section_key": "warranty_and_risk", "section_title": "string", "section_order": 40, "content": { } },
      { "section_key": "financing", "section_title": "string", "section_order": 50, "content": { } },
      { "section_key": "objections", "section_title": "string", "section_order": 60, "content": { } },
      { "section_key": "next_steps", "section_title": "string", "section_order": 70, "content": { } },
      { "section_key": "assumptions", "section_title": "string", "section_order": 80, "content": { } }
    ],
    "persuasion_score": 0,
    "score_breakdown": { "clarity": 0, "personalization": 0, "value": 0, "trust": 0, "cta": 0 }
  },
  "variant_b": { "...": "mesma estrutura" },
  "recommended_variant": "a|b",
  "rationale": "string curta explicando recomendação"
}
`.trim();

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = extractJsonObject(raw);

    const variantA = normalizeVariant(parsed?.variant_a, "a");
    const variantB = normalizeVariant(parsed?.variant_b, "b");
    const recommendedVariant: VariantId =
      String(parsed?.recommended_variant || "a").toLowerCase() === "b" ? "b" : "a";
    const rationale = asString(parsed?.rationale, 280);

    return new Response(
      JSON.stringify({
        variants: [variantA, variantB],
        recommendedVariant,
        rationale,
        model,
        schemaVersion: "proposal_composer_v1",
        generatedAt: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("proposal-composer error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "unexpected_error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
