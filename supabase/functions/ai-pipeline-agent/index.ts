import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
    throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- STAGE TRANSITION MAP (Strict Logic) ---
const STAGE_TRANSITION_MAP: Record<string, string[]> = {
    'novo_lead': ['respondeu', 'perdido'],
    'respondeu': ['chamada_agendada', 'visita_agendada', 'perdido', 'respondeu'], // Can stay
    'chamada_agendada': ['chamada_realizada', 'nao_compareceu', 'perdido'],
    'nao_compareceu': ['chamada_agendada', 'visita_agendada', 'perdido'], // Added visita_agendada
    'chamada_realizada': ['aguardando_proposta', 'perdido'],
    'aguardando_proposta': ['proposta_pronta', 'visita_agendada', 'perdido'],
    'proposta_pronta': ['proposta_negociacao', 'perdido'],
    'visita_agendada': ['visita_realizada', 'nao_compareceu', 'perdido'],
    'visita_realizada': ['proposta_negociacao', 'perdido'],
    'proposta_negociacao': ['financiamento', 'aprovou_projeto', 'contrato_assinado', 'perdido'],
    'financiamento': ['aprovou_projeto', 'contrato_assinado', 'perdido'],
    'aprovou_projeto': ['contrato_assinado', 'perdido'],
    // ... others assume logical linear types
};

function isValidTransition(current: string, target: string): boolean {
    if (current === target) return true; // Staying is always valid
    const allowed = STAGE_TRANSITION_MAP[current];
    return allowed ? allowed.includes(target) : false; // If not mapped, block strict moves
}

function normalizeStage(str: string | null | undefined): string {
    if (!str) return ''
    return str
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s-]/g, '_')
        .replace(/[^a-z0-9_]/g, '')
}

function isMissingOrgIdColumnError(error: any): boolean {
    if (!error) return false;
    const code = String(error.code || '');
    if (code === '42703' || code === 'PGRST204') return true;
    return String(error.message || '').toLowerCase().includes('org_id');
}

async function tableHasOrgIdColumn(supabase: any, table: string): Promise<boolean> {
    const { error } = await supabase.from(table).select('org_id').limit(1);
    if (!error) return true;
    if (isMissingOrgIdColumnError(error)) return false;
    throw error;
}

function injectOrgIdIntoInsertPayload(payload: any, orgId: string | null): any {
    if (!orgId) {
        throw new Error('Missing org_id for AI insert payload');
    }
    if (Array.isArray(payload)) {
        return payload.map((row) => (row && typeof row === 'object' && !('org_id' in row)) ? { ...row, org_id: orgId } : row);
    }
    if (payload && typeof payload === 'object' && !('org_id' in payload)) {
        return { ...payload, org_id: orgId };
    }
    return payload;
}

function createOrgAwareSupabaseClient(
    supabase: any,
    getOrgId: () => string | null,
    aiActionLogsHasOrgId: boolean
) {
    return new Proxy(supabase, {
        get(target, prop, receiver) {
            if (prop !== 'from') return Reflect.get(target, prop, receiver);
            return (table: string) => {
                const query = target.from(table);
                return new Proxy(query, {
                    get(queryTarget, queryProp, queryReceiver) {
                        if (queryProp !== 'insert') return Reflect.get(queryTarget, queryProp, queryReceiver);
                        return (values: any, ...rest: any[]) => {
                            const shouldInject =
                                table === 'ai_agent_runs' ||
                                (table === 'ai_action_logs' && aiActionLogsHasOrgId);
                            const patchedValues = shouldInject
                                ? injectOrgIdIntoInsertPayload(values, getOrgId())
                                : values;
                            return queryTarget.insert(patchedValues, ...rest);
                        };
                    }
                });
            };
        }
    });
}

// --- INCREMENT 12: SOLAR BR PACK ---
const SOLAR_BR_PACK = `
CONTEXTO SOLAR BRASIL (LEI 14.300 & FLUXO REAL):
1. LEI 14.300: O "direito adquirido" (isenção total) acabou em 2023. Hoje pagamos o "Fio B" progressivo sobre a energia injetada na rede. AINDA ASSIM vale muito a pena: a economia na conta chega a 90%, blindando contra aumentos (inflação energética).
2. FLUXO REAL:
   - Análise de consumo/fatura -> Proposta -> Assinatura -> Engenharia/Projeto.
   - Instalação (Rápida: 1-3 dias).
   - Homologação: Depende da Concessionária (Enel, CPFL, Cemig, etc). Envolve vistoria e troca de medidor.
   - Início da compensação: Só após o medidor bidirecional estar ativo.
3. PRAZOS:
   - "Semanas" é o termo seguro. Instalar é rápido, mas a burocracia da distribuidora pode levar 15-45 dias ou mais.
   - NUNCA prometa data exata de ligação sem saber cidade/UF e concessionária.
4. DIMENSIONAMENTO:
   - Depende estritamente do consumo médio (kWh) e local (irradiação).
   - "Quantas placas?" é impossível responder sem saber o consumo e a potência dos módulos (450W, 550W, etc).
5. GARANTIAS:
   - Inversor: geralmente 5-10 anos (fabricante).
   - Módulos: 10-12 anos (produto) + 25 anos (performance linear).
   - Instalação: oferecemos garantia de serviço (ex: 1 ano).
`;

// --- INCREMENT 12: SAFETY GATE ---
function detectSolarIntentAndMissing(lastUserText: string, lead: any) {
    const text = lastUserText.toLowerCase();

    // Intents
    const isPrazo = /(prazo|demora|tempo|homolog|medid|vistoria|liga[çc])/i.test(text);
    const isDimensionamento = /(placa|pain|modul|tamanho|cust|pre[çc]|or[çc]a|gerar|pot[êe]ncia)/i.test(text);

    // Context Data
    const hasLocation = (lead.city && lead.city.length > 2) || (lead.meta && lead.meta.city);
    const hasUtility = (lead.meta && lead.meta.utility_company);
    const hasConsumption = (lead.consumo_kwh && lead.consumo_kwh > 0) || (lead.valor_estimado && lead.valor_estimado > 0);

    // Missing checks
    const missing = [];
    let directive = null;

    if (isPrazo) {
        if (!hasLocation) missing.push('cidade/uf');
        // Utility is secondary (can often infer from city), but good to ask if totally unknown
        // We focus on location as primary blocker for "prazo".
        if (missing.length > 0) {
            directive = "FALTAM DADOS ESSENCIAIS (PRAZO): O cliente perguntou de prazos/homologação mas não sabemos a Cidade/UF. PEÇA A CIDADE/UF e CONCESSIONÁRIA. Não dê prazos em dias sem isso. Diga que depende da região.";
            return { intent: 'prazos', missing, directive };
        }
    }

    if (isDimensionamento) {
        if (!hasConsumption) missing.push('consumo_kwh');
        // Location also affects sizing (irradiation), but consumption is the big blocker.
        if (!hasLocation) missing.push('cidade/uf');

        if (missing.includes('consumo_kwh')) {
            directive = "FALTAM DADOS ESSENCIAIS (DIMENSIONAMENTO): O cliente quer saber tamanho/preço/placas, mas não sabemos o consumo. PEÇA O CONSUMO MENSAL (kWh) OU VALOR DA CONTA. Não chute número de placas.";
            return { intent: 'dimensionamento', missing, directive };
        }
    }

    return { intent: null, missing: [], directive: null };
}

function buildFallbackCommentFromText(agg: string): { text: string; type: 'summary' } | null {
    const text = String(agg || '');
    const kwh = text.match(/(\d{2,4})\s*kwh/i)?.[1];
    const bill =
        text.match(/(\d{2,5})\s*reais/i)?.[1] ||
        text.match(/r\$\s*(\d{2,5})/i)?.[1];
    const city = text.match(/moro em\s*([^,.\n]+)/i)?.[1]?.trim();
    const roof = text.match(/telhado\s*([^,.\n]+)/i)?.[0]?.trim();

    const parts: string[] = [];
    if (kwh) parts.push(`consumo de ${kwh} kWh/mês`);
    if (bill) parts.push(`conta de luz de R$${bill}`);
    if (city) parts.push(`cidade: ${city}`);
    if (roof) parts.push(roof);
    if (parts.length < 2) return null;

    return {
        text: `Cliente informou ${parts.join(', ')}.`,
        type: 'summary'
    };
}

// --- HELPER: Safe Stage Update (Increment 10) ---
async function updateLeadStageSafe(
    supabase: any,
    leadId: string | number,
    targetStage: string,
    runId: string
): Promise<{ success: boolean; error?: string }> {
    const isSchemaMismatch = (code: string | undefined) => code === '42703' || code === 'PGRST204';
    const timestamp = new Date().toISOString();
    // 1. Try updating everything (status_pipeline + pipeline_stage + stage_changed_at)
    // This maintains compatibility with older schemas that use pipeline_stage
    const { error: err1 } = await supabase.from('leads').update({
        status_pipeline: targetStage,
        pipeline_stage: targetStage,
        stage_changed_at: timestamp
    }).eq('id', leadId);

    if (!err1) {
        console.log(`✅ [${runId}] Stage updated (dual write): ${targetStage}`);
        return { success: true };
    }

    // 2. Fallback: If schema mismatch (42703 / PGRST204), retry with canonical 'status_pipeline' only
    // This happens if 'pipeline_stage' was removed or 'stage_changed_at' is missing
    if (isSchemaMismatch(err1.code)) {
        console.warn(`⚠️ [${runId}] Stage update schema mismatch (${err1.code}). Retrying safe update.`);

        // Try without pipeline_stage but keep stage_changed_at
        const { error: err2 } = await supabase.from('leads').update({
            status_pipeline: targetStage,
            stage_changed_at: timestamp
        }).eq('id', leadId);

        if (!err2) {
            console.log(`✅ [${runId}] Stage updated (status_pipeline + date): ${targetStage}`);
            return { success: true };
        }

        // 3. Final Fallback: bare minimum
        if (isSchemaMismatch(err2.code)) {
            const { error: err3 } = await supabase.from('leads').update({
                status_pipeline: targetStage
            }).eq('id', leadId);

            if (err3) {
                console.error(`❌ [${runId}] Failed strict backup update:`, err3);
                return { success: false, error: err3?.message || 'bare_update_failed' };
            }
            console.log(`✅ [${runId}] Stage updated (bare status_pipeline): ${targetStage}`);
            return { success: true };
        } else {
            console.error(`❌ [${runId}] Failed backup update:`, err2);
            return { success: false, error: err2?.message || 'backup_update_failed' };
        }
    } else {
        console.error(`❌ [${runId}] Stage update failed (unknown error):`, err1);
        return { success: false, error: err1?.message || 'unknown_error' };
    }
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

// --- HELPER: Sanitize query for web search (remove PII) ---
function sanitizeQuery(text: string): string {
    return text
        .replace(/\b\d{8,}\b/g, '')           // Remove long digit sequences (phones, CPF)
        .replace(/\b\d{2,3}\.\d{3}\.\d{3}[-/]\d{1,2}\b/g, '') // CPF/CNPJ patterns
        .replace(/[+]\d{10,}/g, '')            // International phone numbers
        .trim()
        .substring(0, 200);
}

// Fix common UTF-8 mojibake patterns like "vocÃª", "mÃ©dia".
function repairMojibake(text: string): string {
    if (!text) return text;
    if (!/[ÃÂ]/.test(text)) return text;
    const replacements: Array<[string, string]> = [
        ['Ã¡', 'á'], ['Ã¢', 'â'], ['Ã£', 'ã'], ['Ã¤', 'ä'],
        ['Ã©', 'é'], ['Ãª', 'ê'], ['Ã«', 'ë'],
        ['Ã­', 'í'], ['Ã®', 'î'], ['Ã¯', 'ï'],
        ['Ã³', 'ó'], ['Ã´', 'ô'], ['Ãµ', 'õ'], ['Ã¶', 'ö'],
        ['Ãº', 'ú'], ['Ã»', 'û'], ['Ã¼', 'ü'],
        ['Ã§', 'ç'], ['Ã±', 'ñ'],
        ['Ã', 'Á'], ['Ã‚', 'Â'], ['Ãƒ', 'Ã'], ['Ã„', 'Ä'],
        ['Ã‰', 'É'], ['ÃŠ', 'Ê'], ['Ã‹', 'Ë'],
        ['Ã', 'Í'], ['ÃŽ', 'Î'], ['Ã', 'Ï'],
        ['Ã“', 'Ó'], ['Ã”', 'Ô'], ['Ã•', 'Õ'], ['Ã–', 'Ö'],
        ['Ãš', 'Ú'], ['Ã›', 'Û'], ['Ãœ', 'Ü'],
        ['Ã‡', 'Ç'], ['Ã‘', 'Ñ'],
        ['â€™', '’'], ['â€œ', '“'], ['â€', '”'], ['â€“', '–'], ['â€”', '—'],
        ['Â', '']
    ];
    let repaired = text;
    for (const [from, to] of replacements) {
        repaired = repaired.replaceAll(from, to);
    }
    return repaired;
}

// --- HELPER: Check if message looks like a real question ---
function looksLikeQuestion(text: string): boolean {
    if (!text || text.length < 8) return false;
    const lower = text.toLowerCase();
    const questionStarters = ['como', 'quanto', 'qual', 'quando', 'onde', 'por que', 'porque',
        'tempo', 'prazo', 'vale a pena', 'funciona', 'demora', 'custa', 'economia',
        'economizar', 'instalar', 'instalação', 'homologação', 'medidor', 'concessionária'];
    return lower.includes('?') || questionStarters.some(s => lower.includes(s));
}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./i, '');
    } catch (_) {
        return '';
    }
}

function extractTextFromMessageContent(content: any): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .map((part: any) => {
            if (!part || typeof part !== 'object') return '';
            if (part.type === 'text' && typeof part.text === 'string') return part.text;
            if (part.type === 'input_text' && typeof part.text === 'string') return part.text;
            return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
}

function normalizeHistoryText(message: any, attachmentUrl: string | null): string {
    let text = String(message || '').trim();
    if (attachmentUrl && text.includes(attachmentUrl)) {
        text = text.replace(attachmentUrl, '').trim();
    }
    return text;
}

async function isLeadAiEnabledNow(supabase: any, leadId: string | number): Promise<boolean> {
    const { data, error } = await supabase
        .from('leads')
        .select('ai_enabled')
        .eq('id', leadId)
        .maybeSingle();

    // FAIL-SAFE: on DB error, assume AI is disabled to prevent unwanted outbound messages
    if (error) {
        console.error('[isLeadAiEnabledNow] DB error — defaulting to DISABLED for safety:', error.message);
        return false;
    }
    if (!data) return false;
    return data.ai_enabled !== false;
}

async function performOpenAIWebSearch(openAIApiKey: string, query: string): Promise<{ ok: boolean; text: string; error?: string }> {
    try {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openAIApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                tools: [{ type: 'web_search_preview' }],
                input: `Pesquise na web e retorne no máximo 3 fatos curtos e práticos sobre energia solar no Brasil para responder: ${query}`
            })
        });

        if (!response.ok) {
            return { ok: false, text: '', error: `openai_http_${response.status}` };
        }

        const data: any = await response.json();
        const outputText = String(data?.output_text || '').trim();
        if (!outputText) {
            return { ok: false, text: '', error: 'openai_empty_output' };
        }

        return { ok: true, text: outputText };
    } catch (error: any) {
        return { ok: false, text: '', error: error?.message || String(error) };
    }
}

// --- V6: NORMALIZERS for lead field extraction ---
function normalizeMoneyBRL(raw: any): number | null {
    if (typeof raw === 'number') return raw > 0 ? raw : null;
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[R$\s.]/g, '').replace(',', '.').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}

function normalizeKwh(raw: any): number | null {
    if (typeof raw === 'number') return raw > 0 ? raw : null;
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[^0-9.,]/g, '').replace(',', '.').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) || n <= 0 ? null : Math.round(n);
}

function normalizeRoofType(raw: any): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes('ceramic') || lower.includes('ceramica')) return 'ceramica';
    if (lower.includes('fibro') || lower.includes('amianto') || lower.includes('eternit')) return 'fibrocimento';
    if (lower.includes('metal') || lower.includes('zinco') || lower.includes('galvan')) return 'metalica';
    if (lower.includes('laje') || lower.includes('concreto')) return 'laje';
    if (lower.includes('colonial')) return 'colonial';
    return 'outro';
}

function normalizeGridType(raw: any): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes('mono') || lower.includes('monofas')) return 'mono';
    if (lower.includes('bi') || lower.includes('bifas')) return 'bi';
    if (lower.includes('tri') || lower.includes('trifas')) return 'tri';
    return null;
}

function normalizeCustomerType(raw: any): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes('resid') || lower.includes('casa')) return 'residencial';
    if (lower.includes('comerc') || lower.includes('empresa') || lower.includes('loja')) return 'comercial';
    if (lower.includes('agro') || lower.includes('rural') || lower.includes('fazend')) return 'agro';
    if (lower.includes('indust')) return 'industrial';
    return raw.trim().toLowerCase();
}

// --- V6: LEAD_META_JSON idempotent helper (edge-function mini version) ---
const META_TAG = '[[LEAD_META_JSON]]';

function parseLeadMeta(obs: string | null | undefined): Record<string, any> {
    if (!obs || !obs.includes(META_TAG)) return {};
    try {
        const parts = obs.split(META_TAG);
        if (parts.length < 2) return {};
        const jsonStr = parts[1].trim();
        // Handle both ":{ ... }" and "{ ... }" formats
        const cleaned = jsonStr.startsWith(':') ? jsonStr.substring(1).trim() : jsonStr;
        return JSON.parse(cleaned) || {};
    } catch { return {}; }
}

function packLeadMeta(currentObs: string | null | undefined, newData: Record<string, any>): string {
    const baseObs = currentObs && currentObs.includes(META_TAG)
        ? currentObs.split(META_TAG)[0].trim()
        : (currentObs || '').trim();
    const existingMeta = parseLeadMeta(currentObs);
    const merged = { ...existingMeta, ...newData };
    const hasData = Object.values(merged).some(v => v !== undefined && v !== null && v !== '');
    if (!hasData) return baseObs;
    return `${baseObs}\n\n${META_TAG}:${JSON.stringify(merged)}`;
}

// --- Lead stage_data JSONB helpers (structured agent fields by stage) ---
const STAGE_DATA_NAMESPACE_BY_STAGE: Record<string, string> = {
    'respondeu': 'respondeu',
    'nao_compareceu': 'nao_compareceu',
    'proposta_negociacao': 'negociacao',
    'negociacao': 'negociacao',
    'financiamento': 'financiamento',
};

const STAGE_DATA_ALLOWED_FIELDS: Record<string, Set<string>> = {
    respondeu: new Set([
        'segment',
        'timing',
        'budget_fit',
        'need_reason',
        'decision_makers',
        'decision_makers_present',
        'visit_datetime',
        'address',
        'reference_point',
        'bant_complete',
    ]),
    nao_compareceu: new Set([
        'no_show_reason',
        'recovery_path',
        'next_step_choice',
        'next_step',
        'attempt_count',
        'call_datetime',
        'visit_datetime',
        'address',
        'reference_point',
    ]),
    negociacao: new Set([
        'payment_track',
        'payment_method',
        'main_objection',
        'chosen_condition',
        'explicit_approval',
        'negotiation_status',
    ]),
    financiamento: new Set([
        'financing_status',
        'missing_docs',
        'last_update_at',
        'next_followup_at',
        'fear_reason',
        'profile_type',
        'approved_at',
        'bank_notes',
    ]),
};

function toSnakeCaseKey(raw: string): string {
    return String(raw || '')
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s\-./]+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();
}

function parseBooleanLike(value: any): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        return null;
    }
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['true', '1', 'yes', 'y', 'sim'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'nao'].includes(normalized)) return false;
    return null;
}

function parseNumberLike(value: any): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const cleaned = value.replace(/[^0-9.,-]/g, '').trim();
    if (!cleaned) return null;
    const normalized = cleaned.includes(',') && !cleaned.includes('.')
        ? cleaned.replace(',', '.')
        : cleaned.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStringArray(value: any): string[] | null {
    if (Array.isArray(value)) {
        const items = value
            .map((item) => typeof item === 'string' ? item.trim() : String(item ?? '').trim())
            .filter(Boolean)
            .slice(0, 20);
        return items.length > 0 ? items : null;
    }
    if (typeof value === 'string') {
        const parts = value
            .split(/[;,|]/)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 20);
        if (parts.length > 0) return parts;
        const single = value.trim();
        return single ? [single] : null;
    }
    return null;
}

function normalizeStageDataValue(fieldName: string, value: any): any {
    if (value === undefined) return undefined;
    if (value === null) return null;

    switch (fieldName) {
        case 'decision_makers':
        case 'missing_docs':
            return normalizeStringArray(value);
        case 'attempt_count':
            return parseNumberLike(value);
        case 'bant_complete':
        case 'decision_makers_present':
        case 'explicit_approval':
            return parseBooleanLike(value);
        default:
            break;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
        const items = value
            .map((item) => typeof item === 'string' ? item.trim() : item)
            .filter((item) => item !== '' && item !== null && item !== undefined)
            .slice(0, 20);
        return items.length > 0 ? items : null;
    }
    if (typeof value === 'object') {
        return value;
    }

    return null;
}

function getStageDataNamespace(stage: string | null | undefined): string | null {
    const normalized = normalizeStage(stage);
    return STAGE_DATA_NAMESPACE_BY_STAGE[normalized] || null;
}

function resolveStageDataInput(rawStageData: any, namespace: string): Record<string, any> {
    if (!rawStageData || typeof rawStageData !== 'object' || Array.isArray(rawStageData)) return {};
    const obj = rawStageData as Record<string, any>;
    if (namespace === 'negociacao') {
        if (obj.negociacao && typeof obj.negociacao === 'object' && !Array.isArray(obj.negociacao)) return obj.negociacao;
        if (obj.proposta_negociacao && typeof obj.proposta_negociacao === 'object' && !Array.isArray(obj.proposta_negociacao)) return obj.proposta_negociacao;
    }
    const namespaced = obj[namespace];
    if (namespaced && typeof namespaced === 'object' && !Array.isArray(namespaced)) return namespaced;
    return obj;
}

function normalizeStageDataPayload(rawStageData: any, namespace: string): Record<string, any> {
    const allowed = STAGE_DATA_ALLOWED_FIELDS[namespace];
    if (!allowed) return {};

    const input = resolveStageDataInput(rawStageData, namespace);
    const normalized: Record<string, any> = {};

    for (const [rawKey, rawValue] of Object.entries(input)) {
        const key = toSnakeCaseKey(rawKey);
        if (!key || key === 'updated_at') continue;
        if (!allowed.has(key)) continue;

        const normalizedValue = normalizeStageDataValue(key, rawValue);
        if (normalizedValue === undefined || normalizedValue === null) continue;
        if (typeof normalizedValue === 'string' && normalizedValue.trim() === '') continue;
        if (Array.isArray(normalizedValue) && normalizedValue.length === 0) continue;

        normalized[key] = normalizedValue;
    }

    return normalized;
}

function normalizeLeadStageDataRoot(raw: any): Record<string, any> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, any>;
}

function extractStageDataCandidate(aiRes: any): Record<string, any> | null {
    const stageData = aiRes?.stage_data;
    if (stageData && typeof stageData === 'object' && !Array.isArray(stageData)) return stageData;
    const leadStageData = aiRes?.lead_stage_data;
    if (leadStageData && typeof leadStageData === 'object' && !Array.isArray(leadStageData)) return leadStageData;
    return null;
}

async function executeLeadStageDataUpdate(
    supabase: any,
    leadId: string | number,
    currentStage: string,
    rawStageData: Record<string, any>,
    lead: any,
    runId: string
): Promise<{
    candidateCount: number;
    writtenCount: number;
    namespace: string | null;
    skippedReason: string | null;
}> {
    const namespace = getStageDataNamespace(currentStage);
    if (!namespace) {
        return { candidateCount: 0, writtenCount: 0, namespace: null, skippedReason: 'stage_not_supported' };
    }

    const payload = normalizeStageDataPayload(rawStageData, namespace);
    const payloadKeys = Object.keys(payload);
    if (payloadKeys.length === 0) {
        return { candidateCount: 0, writtenCount: 0, namespace, skippedReason: 'no_supported_fields' };
    }

    const currentRoot = normalizeLeadStageDataRoot(lead?.lead_stage_data);
    const currentNamespaceData =
        currentRoot[namespace] && typeof currentRoot[namespace] === 'object' && !Array.isArray(currentRoot[namespace])
            ? (currentRoot[namespace] as Record<string, any>)
            : {};

    const nowIso = new Date().toISOString();
    const mergedRoot = {
        ...currentRoot,
        [namespace]: {
            ...currentNamespaceData,
            ...payload,
            updated_at: nowIso,
        },
    };

    try {
        const { error } = await supabase
            .from('leads')
            .update({ lead_stage_data: mergedRoot })
            .eq('id', leadId);

        if (error) {
            if (error.code === '42703' || error.code === 'PGRST204') {
                console.warn(`⚠️ [${runId}] Stage data column unavailable (lead_stage_data). Skipping structured write.`);
                return { candidateCount: payloadKeys.length, writtenCount: 0, namespace, skippedReason: 'column_missing' };
            }
            console.error(`❌ [${runId}] Stage data write failed:`, error.message);
            return { candidateCount: payloadKeys.length, writtenCount: 0, namespace, skippedReason: `db_error:${error.code || 'unknown'}` };
        }

        try {
            await supabase.from('ai_action_logs').insert({
                lead_id: Number(leadId),
                action_type: 'lead_stage_data_updated',
                details: JSON.stringify({
                    stage_namespace: namespace,
                    fields_written_count: payloadKeys.length,
                    fields_written: payload,
                    updated_at: nowIso,
                }),
                success: true,
            });
        } catch (logErr: any) {
            console.warn(`⚠️ [${runId}] Stage data audit log failed (non-blocking):`, logErr?.message || logErr);
        }

        console.log(`📦 [${runId}] Stage data updated (${namespace}): ${payloadKeys.join(', ')}`);
        return { candidateCount: payloadKeys.length, writtenCount: payloadKeys.length, namespace, skippedReason: null };
    } catch (err: any) {
        console.error(`❌ [${runId}] executeLeadStageDataUpdate error (non-blocking):`, err?.message || err);
        return { candidateCount: payloadKeys.length, writtenCount: 0, namespace, skippedReason: `exception:${err?.message || 'unknown'}` };
    }
}

// Columns that exist directly on leads table
const LEAD_DIRECT_COLUMNS: Record<string, (v: any) => any> = {
    'consumption_kwh_month': normalizeKwh,    // maps to consumo_kwh
    'estimated_value_brl': normalizeMoneyBRL, // maps to valor_estimado
    'customer_type': normalizeCustomerType,   // maps to tipo_cliente
    'city': (v: any) => typeof v === 'string' ? v.trim() : null,
    'zip': (v: any) => typeof v === 'string' ? v.replace(/[^0-9-]/g, '').trim() : null,
};

// Column name mapping: extraction field -> DB column
const FIELD_TO_COLUMN: Record<string, string> = {
    'consumption_kwh_month': 'consumo_kwh',
    'estimated_value_brl': 'valor_estimado',
    'customer_type': 'tipo_cliente',
    'city': 'cidade',
    'zip': 'cep',
};

const V6_NUMERIC_FIELDS = new Set(['consumption_kwh_month', 'estimated_value_brl']);

function isHedged(text: string | null | undefined): boolean {
    if (!text) return false;
    const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return /\b(acho|acho que|acredito|creio|talvez|deve ser|por volta|mais ou menos|aprox(?:imadamente)?\.?|cerca de|na faixa de|chutando|imagino|algo em torno|tipo)\b/.test(normalized)
        || /\buns?\b/.test(normalized)
        || /\bumas?\b/.test(normalized);
}

// Fields stored in meta JSON
const META_FIELDS: Record<string, (v: any) => any> = {
    'roof_type': normalizeRoofType,
    'utility_company': (v: any) => typeof v === 'string' ? v.trim().toUpperCase() : null,
    'grid_connection_type': normalizeGridType,
    'financing_interest': (v: any) => {
        if (typeof v === 'boolean') return v ? 'sim' : 'nao';
        if (typeof v !== 'string') return null;
        const l = v.toLowerCase();
        if (l.includes('sim') || l.includes('yes') || l === 'true') return 'sim';
        if (l.includes('nao') || l.includes('não') || l.includes('no') || l === 'false') return 'nao';
        return null;
    },
    'installation_site_type': (v: any) => typeof v === 'string' ? v.trim().toLowerCase() : null,
    'average_bill_context': (v: any) => typeof v === 'string' ? v.trim() : null,
};

// --- V6: Safe update evaluator ---
interface FieldCandidate {
    value: any;
    confidence: 'high' | 'medium' | 'low';
    source: 'user' | 'inferred' | 'confirmed';
}

function shouldWriteField(
    fieldName: string,
    candidate: FieldCandidate,
    currentValue: any
): { write: boolean; reason: string } {
    const hasExisting = currentValue !== null && currentValue !== undefined && currentValue !== '' && currentValue !== 0;

    // Rule: Never save low confidence
    if (candidate.confidence === 'low') {
        return { write: false, reason: 'confidence_too_low' };
    }

    // Rule: Existing value present — only overwrite if high confidence AND user/confirmed source
    if (hasExisting) {
        if (candidate.confidence === 'high' && (candidate.source === 'user' || candidate.source === 'confirmed')) {
            return { write: true, reason: 'high_conf_user_overwrite' };
        }
        return { write: false, reason: 'existing_value_protected' };
    }

    // Rule: Field empty — allow medium if source=user
    if (candidate.confidence === 'medium' && candidate.source === 'user') {
        return { write: true, reason: 'empty_field_medium_user' };
    }
    if (candidate.confidence === 'high') {
        return { write: true, reason: 'empty_field_high_conf' };
    }
    if (candidate.confidence === 'medium' && candidate.source === 'inferred') {
        return { write: false, reason: 'medium_inferred_blocked' };
    }

    return { write: false, reason: 'default_blocked' };
}

// --- V6: Execute lead field update (non-blocking, safe) ---
async function executeLeadFieldUpdate(
    supabase: any,
    leadId: string | number,
    fields: Record<string, FieldCandidate>,
    lead: any,
    runId: string,
    aggregatedText?: string
): Promise<{ candidateCount: number; writtenCount: number; skipped: Array<{ field: string; reason: string }> }> {
    const result = { candidateCount: 0, writtenCount: 0, skipped: [] as Array<{ field: string; reason: string }> };
    const dbUpdate: Record<string, any> = {};
    const metaUpdate: Record<string, any> = {};
    const hedgedInput = isHedged(aggregatedText);

    const existingMeta = parseLeadMeta(lead.observacoes || '');

    for (const [fieldName, candidate] of Object.entries(fields)) {
        result.candidateCount++;

        // Determine if direct column or meta
        const isDirect = fieldName in LEAD_DIRECT_COLUMNS;
        const isMeta = fieldName in META_FIELDS;

        if (!isDirect && !isMeta) {
            result.skipped.push({ field: fieldName, reason: 'unknown_field' });
            continue;
        }

        // Normalize value
        const normalizer = isDirect ? LEAD_DIRECT_COLUMNS[fieldName] : META_FIELDS[fieldName];
        const normalizedValue = normalizer(candidate.value);
        if (normalizedValue === null || normalizedValue === undefined) {
            result.skipped.push({ field: fieldName, reason: 'normalization_failed' });
            continue;
        }

        // Get current value
        let currentValue: any;
        if (isDirect) {
            const dbCol = FIELD_TO_COLUMN[fieldName] || fieldName;
            currentValue = lead[dbCol];
        } else {
            currentValue = existingMeta[fieldName];
        }

        const hasExisting = currentValue !== null && currentValue !== undefined && currentValue !== '' && currentValue !== 0;
        const isNumericField = V6_NUMERIC_FIELDS.has(fieldName);
        const candidateForDecision: FieldCandidate = {
            ...candidate,
            value: normalizedValue,
            confidence: hedgedInput && isNumericField && candidate.confidence === 'high'
                ? 'medium'
                : candidate.confidence,
        };

        // Hedge-protection: never overwrite existing numeric value from uncertain phrasing.
        if (hedgedInput && isNumericField && hasExisting) {
            result.skipped.push({ field: fieldName, reason: 'hedged_existing_value_protected' });
            continue;
        }

        // Evaluate write safety
        const decision = shouldWriteField(fieldName, candidateForDecision, currentValue);
        if (!decision.write) {
            result.skipped.push({ field: fieldName, reason: decision.reason });
            continue;
        }

        // Queue write
        if (isDirect) {
            const dbCol = FIELD_TO_COLUMN[fieldName] || fieldName;
            dbUpdate[dbCol] = normalizedValue;
        } else {
            metaUpdate[fieldName] = normalizedValue;
        }
        result.writtenCount++;
    }

    // Execute DB writes
    try {
        // Direct columns update
        if (Object.keys(dbUpdate).length > 0) {
            const { error: colErr } = await supabase.from('leads').update(dbUpdate).eq('id', leadId);
            if (colErr) {
                console.error(`❌ [${runId}] V6: Direct column update failed:`, colErr.message);
                // If column doesn't exist (42703), try meta fallback for those fields
                if (colErr.code === '42703') {
                    console.warn(`⚠️ [${runId}] V6: Column missing, falling back to meta for direct fields`);
                    for (const [col, val] of Object.entries(dbUpdate)) {
                        // Reverse-map column to field name
                        const fieldName = Object.entries(FIELD_TO_COLUMN).find(([, c]) => c === col)?.[0] || col;
                        metaUpdate[fieldName] = val;
                    }
                }
            }
        }

        // Meta JSON update
        if (Object.keys(metaUpdate).length > 0) {
            const currentObs = lead.observacoes || '';
            const newObs = packLeadMeta(currentObs, metaUpdate);
            const { error: metaErr } = await supabase.from('leads').update({ observacoes: newObs }).eq('id', leadId);
            if (metaErr) {
                console.error(`❌ [${runId}] V6: Meta JSON update failed:`, metaErr.message);
            }
        }

        // Audit log
        const hasHedgeBlock = result.skipped.some(s => s.reason === 'hedged_existing_value_protected');
        if (result.writtenCount > 0 || hasHedgeBlock) {
            await supabase.from('ai_action_logs').insert({
                lead_id: leadId,
                action_type: 'lead_fields_updated',
                details: JSON.stringify({
                    lead_fields_candidate_count: result.candidateCount,
                    lead_fields_written_count: result.writtenCount,
                    lead_fields_skipped_reason: result.skipped,
                    fields_written: { ...dbUpdate, ...metaUpdate },
                    hedged_input: hedgedInput,
                    hedge_text_preview: hedgedInput ? (aggregatedText || '').substring(0, 180) : null,
                }),
                success: true,
            });
        }

        console.log(`📋 [${runId}] V6: Lead fields update: ${result.writtenCount}/${result.candidateCount} written. Skipped: ${result.skipped.map(s => `${s.field}(${s.reason})`).join(', ') || 'none'}`);
    } catch (err: any) {
        console.error(`❌ [${runId}] V6: executeLeadFieldUpdate error (non-blocking):`, err?.message || err);
    }

    return result;
}

async function isAnchorLatestInbound(
    supabase: any,
    leadId: string | number,
    anchorInteractionId: string | number | null
): Promise<{ ok: boolean; latestId: any; latestCreatedAt: string | null }> {
    const { data: latestInbound, error } = await supabase
        .from('interacoes')
        .select('id, created_at')
        .eq('lead_id', leadId)
        .eq('wa_from_me', false)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    const latestId = latestInbound?.id ?? null;
    const latestCreatedAt = latestInbound?.created_at ?? null;
    const ok = !!anchorInteractionId && latestId !== null && String(latestId) === String(anchorInteractionId);

    return { ok, latestId, latestCreatedAt };
}

// --- V7: ADD COMMENT executor (idempotente via ai_action_logs) ---
async function executeAddComment(
    supabase: any,
    leadId: string | number,
    content: string,
    commentType: string,
    authorName: string,
    runId: string,
    anchorCreatedAt: string | null,
    anchorInteractionId: string | number | null
): Promise<{ written: boolean; skippedReason: string | null }> {
    const trimmed = (content || '').trim().substring(0, 1200);
    if (!trimmed) return { written: false, skippedReason: 'empty_content' };

    // Dedup check: same anchor should not produce duplicate comments
    const dedupKey = anchorCreatedAt || anchorInteractionId || runId;
    try {
        const { data: existing } = await supabase
            .from('ai_action_logs')
            .select('id')
            .eq('lead_id', leadId)
            .eq('action_type', 'lead_comment_added')
            .filter('details', 'ilike', `%${dedupKey}%`)
            .limit(1)
            .maybeSingle();

        if (existing) {
            console.log(`⏭️ [${runId}] V7: Comment skipped (duplicate for anchor ${dedupKey})`);
            return { written: false, skippedReason: 'skipped_duplicate' };
        }
    } catch (dedupErr: any) {
        console.warn(`⚠️ [${runId}] V7: Dedup check failed (non-blocking):`, dedupErr?.message);
    }

    const persistLeadCommentSafe = async (): Promise<{ ok: boolean; err: any | null }> => {
        const isSchemaMismatch = (code: string | undefined) => code === '42703' || code === 'PGRST204';
        const safeType = (commentType || 'note').trim().substring(0, 40) || 'note';
        const basePayload = {
            lead_id: Number(leadId),
            texto: `[${safeType}] ${trimmed}`,
            autor: 'AI',
        };
        const payloads = [
            { ...basePayload, categoria: safeType },
            { ...basePayload, tipo: safeType },
            basePayload,
        ];

        let lastErr: any = null;
        for (const payload of payloads) {
            const { error } = await supabase.from('comentarios_leads').insert(payload);
            if (!error) return { ok: true, err: null };
            lastErr = error;
            if (!isSchemaMismatch(error.code)) break;
        }
        return { ok: false, err: lastErr };
    };

    try {
        const persisted = await persistLeadCommentSafe();
        if (!persisted.ok) {
            console.error(`❌ [${runId}] V7: Comment insert error:`, persisted.err?.message || persisted.err);
            return { written: false, skippedReason: `db_error: ${persisted.err?.message || 'insert_failed'}` };
        }

        // Audit log
        await supabase.from('ai_action_logs').insert({
            lead_id: Number(leadId),
            action_type: 'lead_comment_added',
            details: JSON.stringify({
                anchorCreatedAt: anchorCreatedAt || null,
                interactionId: anchorInteractionId || null,
                runId,
                comment_type: commentType || 'note',
                comment_preview: trimmed.substring(0, 120),
                author_name: authorName || null,
                source: 'ai',
            }),
            success: true,
        });

        console.log(`💬 [${runId}] V7: Comment added (type=${commentType || 'note'}, ${trimmed.length} chars)`);
        return { written: true, skippedReason: null };
    } catch (err: any) {
        console.error(`❌ [${runId}] V7: executeAddComment error:`, err?.message || err);
        return { written: false, skippedReason: `exception: ${err?.message}` };
    }
}

// --- V7/V8: CREATE FOLLOWUP executor (real, inserts into lead_tasks) ---
async function executeCreateFollowup(
    supabase: any,
    leadId: string | number,
    task: any,
    runId: string,
    anchorCreatedAt: string | null,
    anchorInteractionId: string | number | null,
    orgId: string,
    userId: string
): Promise<{ written: boolean; skippedReason: string | null; taskId: string | null }> {
    // Validate title
    const title = (task?.title || '').trim().substring(0, 200);
    if (title.length < 3) {
        console.warn(`⚠️ [${runId}] V8: Followup skipped (title too short: "${title}")`);
        return { written: false, skippedReason: 'title_too_short', taskId: null };
    }

    const notes = (task?.notes || '').trim().substring(0, 1500) || null;

    // Validate due_at
    let dueAt: string | null = null;
    if (task?.due_at) {
        try {
            const d = new Date(task.due_at);
            if (!isNaN(d.getTime())) dueAt = d.toISOString();
        } catch (_) { /* invalid date, keep null */ }
    }

    // Normalize priority
    const validPriorities = ['low', 'medium', 'high'];
    const priority = validPriorities.includes(task?.priority) ? task.priority : 'medium';

    // Normalize channel
    const validChannels = ['whatsapp', 'call', 'email', 'other'];
    const channel = validChannels.includes(task?.channel) ? task.channel : null;

    // Dedup check
    const dedupKey = String(anchorInteractionId || anchorCreatedAt || runId);
    try {
        const { data: existing } = await supabase
            .from('ai_action_logs')
            .select('id')
            .eq('lead_id', leadId)
            .eq('action_type', 'followup_created')
            .filter('details', 'ilike', `%${dedupKey}%`)
            .limit(1)
            .maybeSingle();

        if (existing) {
            console.log(`⏭️ [${runId}] V8: Followup skipped (duplicate for anchor ${dedupKey})`);
            return { written: false, skippedReason: 'skipped_duplicate', taskId: null };
        }
    } catch (dedupErr: any) {
        console.warn(`⚠️ [${runId}] V8: Dedup check failed (non-blocking):`, dedupErr?.message);
    }

    try {
        const { data: inserted, error: insertErr } = await supabase.from('lead_tasks').insert({
            org_id: orgId,
            user_id: userId,
            lead_id: Number(leadId),
            title,
            notes,
            due_at: dueAt,
            status: 'open',
            priority,
            channel,
            created_by: 'ai',
        }).select('id').single();

        if (insertErr) {
            console.error(`❌ [${runId}] V8: lead_tasks insert error:`, insertErr.message);
            return { written: false, skippedReason: `db_error: ${insertErr.message}`, taskId: null };
        }

        const taskId = inserted?.id || null;

        // Audit log
        await supabase.from('ai_action_logs').insert({
            lead_id: Number(leadId),
            action_type: 'followup_created',
            details: JSON.stringify({
                anchorCreatedAt: anchorCreatedAt || null,
                interactionId: anchorInteractionId || null,
                runId,
                task_id: taskId,
                title,
                due_at: dueAt,
                priority,
                channel,
                source: 'ai',
            }),
            success: true,
        });

        console.log(`📝 [${runId}] V8: Followup created (id=${taskId}, title="${title}", due=${dueAt || 'none'}, priority=${priority})`);
        return { written: true, skippedReason: null, taskId };
    } catch (err: any) {
        console.error(`❌ [${runId}] V8: executeCreateFollowup error:`, err?.message || err);
        return { written: false, skippedReason: `exception: ${err?.message}`, taskId: null };
    }
}

// --- FALLBACK PROMPT for inactive/missing stages ---
const STAGE_FALLBACK_PROMPT = `Você é um consultor de energia solar (Brasil). O cliente falou fora de um fluxo ativo. Responda com qualidade e profundidade.
Nunca invente. Se faltar dado, diga que depende e peça 1 dado por vez.
Foque em explicar processo real (dimensionamento, homologação, instalação, troca de medidor, prazos por distribuidora, garantias, manutenção, economia e fatores).
Se o cliente perguntar "quanto tempo pra economizar", explique o fluxo real: instalação (1-3 dias), depois projeto/homologação na distribuidora, vistoria, troca de medidor (pode levar semanas), e só depois começa a compensação.
Peça cidade/UF e concessionária para estimar prazos.`;

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const payload = await req.json();

        // 0. GENERATE RUN ID
        const runId = crypto.randomUUID();

        // --- CONSTANTS ---
        const QUIET_WINDOW_MS = 3500;   // min silence before responding
        const MAX_WAIT_MS = 18000;  // hard stop total per run
        const BURST_LOOKBACK_S = 90;   // max age of burst msgs to aggregate

        // Tracking variables for structured logging
        let decision = 'proceed';
        let stageFallbackUsed = false;
        let kbHitsCount = 0;
        let kbChars = 0;
        let kbError: string | null = null;
        let webUsed = false;
        let webResultsCount = 0;
        let webError: string | null = null;
        let webSearchStatus: string | null = null;
        let webSearchPerformedThisRun = false;
        let evolutionSendStatus: number | null = null;
        let anchorCreatedAt: string | null = null;
        let lastOutboundCreatedAt: string | null = null;
        let aggregatedBurstCount = 0;
        let aggregatedChars = 0;
        let lastInboundAgeMs: number | null = null;
        let transportMode: 'live' | 'simulated' | 'blocked' = 'live';
        let transportSimReason: string | null = null;
        // V6 tracking
        let v6FieldsCandidateCount = 0;
        let v6FieldsWrittenCount = 0;
        // V11 tracking (stage_data JSONB)
        let v11StageDataCandidateCount = 0;
        let v11StageDataWrittenCount = 0;
        let v11StageDataNamespace: string | null = null;
        let v11StageDataSkippedReason: string | null = null;
        // V7 tracking
        let v7CommentWritten = false;
        let v7CommentSkippedReason: string | null = null;
        let v7FollowupWritten = false;
        let v7FollowupSkippedReason: string | null = null;
        // Stage move tracking (Tarefa 2)
        let stageMoveResult: string | null = null;
        // Tracks whether the agent actually sent an outbound reply this run (Tarefa 1)
        let didSendOutbound = false;

        // 1. STRICT INSTANCE CHECK
        const { leadId, instanceName } = payload;
        const inputInteractionId = payload.interactionId;
        let interactionId = payload.interactionId;
        let adoptedLatestOnce = false;
        let adoptedFromInteractionId: string | number | null = null;
        let adoptedToInteractionId: string | number | null = null;
        const forceSimulatedTransport = String(Deno.env.get('FORCE_SIMULATED_TRANSPORT') || '').toLowerCase() === 'true';
        const parsedMaxOutboundPerLeadPerMin = Number.parseInt(Deno.env.get('MAX_OUTBOUND_PER_LEAD_PER_MIN') || '3', 10);
        const maxOutboundPerLeadPerMin =
            Number.isFinite(parsedMaxOutboundPerLeadPerMin) && parsedMaxOutboundPerLeadPerMin > 0
                ? parsedMaxOutboundPerLeadPerMin
                : 3;

        const respondNoSend = (
            body: Record<string, any>,
            reason: string,
            mode: 'simulated' | 'blocked' = 'blocked',
            status = 200
        ) => {
            transportMode = mode;
            transportSimReason = reason;
            return new Response(
                JSON.stringify({
                    ...body,
                    _transport_mode: mode,
                    _transport_reason: reason
                }),
                {
                    status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        };

        console.log(`🚀 [${runId}] START Agent. Instance: ${instanceName}, Lead: ${leadId}, Interaction: ${interactionId}`);

        if (!instanceName) {
            console.error('🛑 Missing instanceName in payload');
            return respondNoSend({ skipped: "missing_instanceName" }, 'missing_instanceName');
        }

        const supabaseBase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        let leadOrgId: string | null = null;
        const aiActionLogsHasOrgId = await tableHasOrgIdColumn(supabaseBase, 'ai_action_logs');
        if (!aiActionLogsHasOrgId) {
            throw new Error('Schema hardening violation: ai_action_logs.org_id column is required');
        }
        const supabase = createOrgAwareSupabaseClient(
            supabaseBase,
            () => leadOrgId,
            aiActionLogsHasOrgId
        );

        const logRateLimitedOutbound = async (recentCount: number, anchorInteractionId: string | number | null) => {
            try {
                await supabase.from('ai_action_logs').insert({
                    lead_id: Number(leadId),
                    action_type: 'send_message_rate_limited',
                    details: JSON.stringify({
                        runId,
                        lead_id: Number(leadId),
                        instanceName,
                        window_sec: 60,
                        max_allowed: maxOutboundPerLeadPerMin,
                        recent_count: recentCount,
                        interactionId: anchorInteractionId || interactionId || null
                    }),
                    success: false
                });
            } catch (rateLogErr) {
                console.warn(`[${runId}] send_message_rate_limited log failed (non-blocking):`, rateLogErr);
            }
        };

        const logWebSearch = async (
            actionType: 'web_search_performed' | 'web_search_skipped',
            details: Record<string, any>
        ) => {
            try {
                await supabase.from('ai_action_logs').insert({
                    lead_id: Number(leadId),
                    action_type: actionType,
                    details: JSON.stringify({
                        runId,
                        ...details
                    }),
                    success: actionType === 'web_search_performed'
                });
            } catch (webLogErr) {
                console.warn(`[${runId}] ${actionType} log failed (non-blocking):`, webLogErr);
            }
        };

        // 2. CHECK IF AI IS ENABLED FOR THIS INSTANCE
        const { data: instanceData, error: instError } = await supabase
            .from('whatsapp_instances')
            .select('ai_enabled')
            .eq('instance_name', instanceName)
            .maybeSingle();

        if (instError || !instanceData || !instanceData.ai_enabled) {
            console.log(`🛑 AI disabled for instance: ${instanceName} (or instance not found)`);
            return respondNoSend({ skipped: "instance_ai_disabled" }, 'instance_ai_disabled');
        }

        // 3. LOAD LEAD & SETTINGS (org-scoped)
        const { data: lead, error: leadErr } = await supabase
            .from('leads')
            .select('*')
            .eq('id', leadId)
            .single();
        if (leadErr || !lead) {
            console.log(`🛑 Lead not found: ${leadId}`);
            return respondNoSend({ skipped: "lead_not_found" }, 'lead_not_found');
        }

        leadOrgId = lead.org_id ? String(lead.org_id) : null;
        if (!leadOrgId) {
            console.error(`🛑 [${runId}] lead_without_org_id`, { leadId, instanceName, interactionId });
            return new Response(
                JSON.stringify({
                    error: 'lead_without_org_id',
                    runId,
                    leadId,
                    instanceName,
                    interactionId
                }),
                {
                    status: 422,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        const { data: settings, error: settingsErr } = await supabase
            .from('ai_settings')
            .select('*')
            .eq('org_id', leadOrgId)
            .order('id', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (settingsErr) {
            console.warn(`⚠️ [${runId}] Failed to load ai_settings for org ${leadOrgId}:`, settingsErr);
            return respondNoSend({ skipped: "settings_query_failed" }, 'settings_query_failed');
        }
        if (!settings) {
            return respondNoSend({ skipped: "settings_not_found_for_org" }, 'settings_not_found_for_org');
        }

        if (!settings?.is_active) {
            return respondNoSend({ skipped: "System Inactive" }, 'system_inactive');
        }

        // 3a. CHECK IF LEAD HAS AI ENABLED SPECIFICALLY
        if (lead.ai_enabled === false) {
            console.log(`🛑 AI disabled for specific LEAD: ${leadId}`);
            return respondNoSend({ skipped: "lead_ai_disabled" }, 'lead_ai_disabled');
        }

        // 4. QUIET-WINDOW DEBOUNCE (wait for real silence)
        // Stage 1: short rapid checks (1500ms) to detect burst-in-progress
        // Stage 2: longer checks (4-7s) for natural human pauses
        let anchorInteractionId = interactionId;
        let stabilized = false;
        let anchorMsgCreatedAt: number | null = null;
        const debounceStart = Date.now();
        const RAPID_CHECK_MS = 1500;
        const RAPID_CHECKS = 3; // first 3 checks are rapid
        let loopCount = 0;

        while (true) {
            loopCount++;
            // Stage 1 (first 3 loops): rapid 1.5s checks to catch burst
            // Stage 2 (after): slower 4-7s checks for human pacing
            const sleepMs = loopCount <= RAPID_CHECKS
                ? RAPID_CHECK_MS
                : Math.floor(Math.random() * (7000 - 4000 + 1) + 4000);
            const elapsed = Date.now() - debounceStart;
            console.log(`⏳ [${runId}] Quiet-window loop #${loopCount} sleep ${sleepMs}ms (elapsed ${elapsed}ms/${MAX_WAIT_MS}ms)`);
            await new Promise(r => setTimeout(r, sleepMs));

            // Fetch latest client message for this lead+instance
            const { data: latestMsg } = await supabase
                .from('interacoes')
                .select('id, created_at')
                .eq('lead_id', leadId)
                .eq('instance_name', instanceName)
                .eq('tipo', 'mensagem_cliente')
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!latestMsg) {
                stabilized = true;
                break;
            }

            const inboundTime = new Date(latestMsg.created_at).getTime();
            lastInboundAgeMs = Date.now() - inboundTime;

            console.log(`Yield Debug: latest=${latestMsg.id}, anchor=${anchorInteractionId}, input=${interactionId}`);

            // YIELD CHECK: if a newer inbound exists, adopt it once; on second hop abort (loop guard)
            if (interactionId && String(latestMsg.id) !== String(interactionId)) {
                // If user is still typing (burst active), do NOT adopt/wait from an older run.
                // Yield immediately and let a later call (after quiet window) handle the latest inbound deterministically.
                if (lastInboundAgeMs !== null && lastInboundAgeMs < QUIET_WINDOW_MS) {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding: newer msg ${latestMsg.id} exists (ours was ${interactionId}) while burst active (age ${lastInboundAgeMs}ms < ${QUIET_WINDOW_MS}ms). Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsg.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }

                // If this run started before the latest inbound existed, it must not adopt/respond after quiet.
                // Yield so a newer call (triggered after the latest inbound) can handle deterministically.
                if (debounceStart < inboundTime) {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding: newer msg ${latestMsg.id} exists (ours was ${interactionId}); run started before latest inbound (runStart<inbound). Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsg.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }

                // If the newest inbound is part of a tight burst (very close to the previous inbound),
                // do NOT adopt from an older run even if it's quiet now. Let the latest inbound call handle it.
                // This prevents TEST 7 mid-burst leaks caused by late-start runs adopting and responding.
                try {
                    const { data: lastTwoInbounds } = await supabase
                        .from('interacoes')
                        .select('id, created_at')
                        .eq('lead_id', leadId)
                        .eq('instance_name', instanceName)
                        .eq('tipo', 'mensagem_cliente')
                        .order('id', { ascending: false })
                        .limit(2);

                    if (lastTwoInbounds && lastTwoInbounds.length >= 2) {
                        const latestTs = new Date(lastTwoInbounds[0].created_at).getTime();
                        const prevTs = new Date(lastTwoInbounds[1].created_at).getTime();
                        const deltaMs = latestTs - prevTs;

                        if (Number.isFinite(deltaMs) && deltaMs < QUIET_WINDOW_MS) {
                            decision = 'yield_to_newer';
                            console.log(`🔄 [${runId}] Yielding: newer msg ${latestMsg.id} exists (ours was ${interactionId}); quiet now but burst detected (delta ${deltaMs}ms < ${QUIET_WINDOW_MS}ms). Aborting this run.`);
                            return respondNoSend({
                                aborted: "yield_to_newer",
                                runId,
                                debug: {
                                    latest: latestMsg.id,
                                    anchor: anchorInteractionId,
                                    input: interactionId,
                                    adopted_from: adoptedFromInteractionId,
                                    adopted_to: adoptedToInteractionId,
                                    burst_delta_ms: deltaMs,
                                    burst_latest_id: lastTwoInbounds[0]?.id,
                                    burst_prev_id: lastTwoInbounds[1]?.id
                                }
                            }, 'yield_to_newer');
                        }
                    }
                } catch (burstDeltaErr) {
                    console.warn(`[${runId}] Burst delta check failed (non-blocking):`, burstDeltaErr);
                }

                if (!adoptedLatestOnce) {
                    adoptedLatestOnce = true;
                    adoptedFromInteractionId = interactionId;
                    adoptedToInteractionId = latestMsg.id;

                    interactionId = latestMsg.id;
                    anchorInteractionId = latestMsg.id;
                    anchorCreatedAt = latestMsg.created_at || null;
                    anchorMsgCreatedAt = inboundTime;

                    console.log(`🔄 [${runId}] Yield guard adopted latest inbound ${latestMsg.id} (from ${adoptedFromInteractionId}). Continuing this run.`);

                    try {
                        await supabase.from('ai_action_logs').insert({
                            lead_id: Number(leadId),
                            action_type: 'yield_adopt_latest',
                            details: JSON.stringify({
                                runId,
                                from: adoptedFromInteractionId,
                                to: adoptedToInteractionId,
                                anchor: anchorInteractionId,
                                latest: latestMsg.id
                            }),
                            success: true
                        });
                    } catch (yieldAdoptLogErr) {
                        console.warn(`[${runId}] yield_adopt_latest log failed (non-blocking):`, yieldAdoptLogErr);
                    }

                    // Burst is already quiet here (see guard above), so we can stabilize and proceed immediately.
                    stabilized = true;
                    console.log(`✅ [${runId}] Stabilized after adopting latest (quiet ${lastInboundAgeMs}ms >= ${QUIET_WINDOW_MS}ms). Anchor: ${anchorInteractionId}`);
                    break;
                }

                // A newer msg arrived again after one-hop adoption → abort to avoid infinite loops
                decision = 'yield_to_newer';
                console.log(`🔄 [${runId}] Yielding: newer msg ${latestMsg.id} exists (ours was ${interactionId}) after adopt hop. Aborting this run.`);
                return respondNoSend({
                    aborted: "yield_to_newer",
                    runId,
                    debug: {
                        latest: latestMsg.id,
                        anchor: anchorInteractionId,
                        input: interactionId,
                        adopted_from: adoptedFromInteractionId,
                        adopted_to: adoptedToInteractionId
                    }
                }, 'yield_to_newer');
            }

            anchorInteractionId = latestMsg.id;

            if (lastInboundAgeMs >= QUIET_WINDOW_MS) {
                // Silence detected — user stopped typing
                stabilized = true;
                anchorMsgCreatedAt = inboundTime;
                anchorCreatedAt = latestMsg.created_at;
                console.log(`✅ [${runId}] Stabilized (quiet ${lastInboundAgeMs}ms >= ${QUIET_WINDOW_MS}ms). Anchor: ${anchorInteractionId}`);
                break;
            }

            // Still receiving messages — check hard stop
            if (Date.now() - debounceStart > MAX_WAIT_MS) {
                decision = 'quiet_window_timeout';
                console.warn(`🛑 [${runId}] Aborted: quiet-window timeout after ${MAX_WAIT_MS}ms. User still typing.`);
                return respondNoSend({ aborted: "quiet_window_timeout", runId }, 'quiet_window_timeout');
            }

            console.log(`🔄 [${runId}] Still typing (lastInboundAge=${lastInboundAgeMs}ms < ${QUIET_WINDOW_MS}ms). Waiting...`);
        }

        if (!stabilized) {
            decision = 'not_stabilized';
            return respondNoSend({ aborted: "not_stabilized", runId }, 'not_stabilized');
        }

        // Post-stabilize recheck: avoid responding from an older run if a newer inbound became visible after we broke
        // (e.g., DB visibility lag). This is critical for TEST 7 (No Response Mid-Burst).
        try {
            const { data: latestMsgPost } = await supabase
                .from('interacoes')
                .select('id, created_at')
                .eq('lead_id', leadId)
                .eq('instance_name', instanceName)
                .eq('tipo', 'mensagem_cliente')
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestMsgPost?.id && anchorInteractionId && String(latestMsgPost.id) !== String(anchorInteractionId)) {
                const postInboundTime = latestMsgPost.created_at ? new Date(latestMsgPost.created_at).getTime() : NaN;
                const postAgeMs = Number.isFinite(postInboundTime) ? Date.now() - postInboundTime : NaN;
                if (Number.isFinite(postAgeMs)) lastInboundAgeMs = postAgeMs;

                // Burst still active -> do NOT adopt/wait; yield immediately.
                if (Number.isFinite(postAgeMs) && postAgeMs < QUIET_WINDOW_MS) {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding (post-stabilize): newer msg ${latestMsgPost.id} exists (ours was ${interactionId}) while burst active (age ${postAgeMs}ms < ${QUIET_WINDOW_MS}ms). Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsgPost.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }

                // If this run started before the latest inbound existed, it must not adopt/respond after quiet.
                if (Number.isFinite(postInboundTime) && debounceStart < postInboundTime) {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding (post-stabilize): newer msg ${latestMsgPost.id} exists (ours was ${interactionId}); run started before latest inbound (runStart<inbound). Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsgPost.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }

                // If the newest inbound is part of a tight burst, do NOT adopt from an older run even if quiet now.
                try {
                    const { data: lastTwoInbounds } = await supabase
                        .from('interacoes')
                        .select('id, created_at')
                        .eq('lead_id', leadId)
                        .eq('instance_name', instanceName)
                        .eq('tipo', 'mensagem_cliente')
                        .order('id', { ascending: false })
                        .limit(2);

                    if (lastTwoInbounds && lastTwoInbounds.length >= 2) {
                        const latestTs = new Date(lastTwoInbounds[0].created_at).getTime();
                        const prevTs = new Date(lastTwoInbounds[1].created_at).getTime();
                        const deltaMs = latestTs - prevTs;

                        if (Number.isFinite(deltaMs) && deltaMs < QUIET_WINDOW_MS) {
                            decision = 'yield_to_newer';
                            console.log(`🔄 [${runId}] Yielding (post-stabilize): newer msg ${latestMsgPost.id} exists (ours was ${interactionId}); quiet now but burst detected (delta ${deltaMs}ms < ${QUIET_WINDOW_MS}ms). Aborting this run.`);
                            return respondNoSend({
                                aborted: "yield_to_newer",
                                runId,
                                debug: {
                                    latest: latestMsgPost.id,
                                    anchor: anchorInteractionId,
                                    input: interactionId,
                                    adopted_from: adoptedFromInteractionId,
                                    adopted_to: adoptedToInteractionId,
                                    burst_delta_ms: deltaMs,
                                    burst_latest_id: lastTwoInbounds[0]?.id,
                                    burst_prev_id: lastTwoInbounds[1]?.id
                                }
                            }, 'yield_to_newer');
                        }
                    }
                } catch (burstDeltaErr) {
                    console.warn(`[${runId}] Burst delta check failed (non-blocking):`, burstDeltaErr);
                }

                // Quiet -> allow one-hop adoption.
                if (!adoptedLatestOnce) {
                    adoptedLatestOnce = true;
                    adoptedFromInteractionId = interactionId;
                    adoptedToInteractionId = latestMsgPost.id;

                    interactionId = latestMsgPost.id;
                    anchorInteractionId = latestMsgPost.id;
                    anchorCreatedAt = latestMsgPost.created_at || null;
                    if (Number.isFinite(postInboundTime)) anchorMsgCreatedAt = postInboundTime;

                    console.log(`🔄 [${runId}] Yield guard adopted latest inbound ${latestMsgPost.id} (from ${adoptedFromInteractionId}) post-stabilize. Continuing this run.`);

                    try {
                        await supabase.from('ai_action_logs').insert({
                            lead_id: Number(leadId),
                            action_type: 'yield_adopt_latest',
                            details: JSON.stringify({
                                runId,
                                from: adoptedFromInteractionId,
                                to: adoptedToInteractionId,
                                anchor: anchorInteractionId,
                                latest: latestMsgPost.id
                            }),
                            success: true
                        });
                    } catch (yieldAdoptLogErr) {
                        console.warn(`[${runId}] yield_adopt_latest log failed (non-blocking):`, yieldAdoptLogErr);
                    }
                } else {
                    decision = 'yield_to_newer';
                    console.log(`🔄 [${runId}] Yielding (post-stabilize): newer msg ${latestMsgPost.id} exists (ours was ${interactionId}) after adopt hop. Aborting this run.`);
                    return respondNoSend({
                        aborted: "yield_to_newer",
                        runId,
                        debug: {
                            latest: latestMsgPost.id,
                            anchor: anchorInteractionId,
                            input: interactionId,
                            adopted_from: adoptedFromInteractionId,
                            adopted_to: adoptedToInteractionId
                        }
                    }, 'yield_to_newer');
                }
            }
        } catch (postStabilizeErr) {
            console.warn(`[${runId}] Post-stabilize latest inbound check failed (fail-open):`, postStabilizeErr);
        }

        // If this run was invoked for an older interactionId than the stabilized anchor, yield.
        // This keeps burst handling deterministic: only the call for the latest inbound should proceed.
        if (!adoptedLatestOnce && inputInteractionId && anchorInteractionId && String(inputInteractionId) !== String(anchorInteractionId)) {
            decision = 'yield_to_newer';
            console.log(`🔄 [${runId}] Yielding: stabilized anchor ${anchorInteractionId} is newer than input ${inputInteractionId}. Aborting this run.`);
            return respondNoSend({
                aborted: "yield_to_newer",
                runId,
                debug: {
                    latest: anchorInteractionId,
                    anchor: anchorInteractionId,
                    input: inputInteractionId,
                    adopted_from: adoptedFromInteractionId,
                    adopted_to: adoptedToInteractionId
                }
            }, 'yield_to_newer');
        }

        // 4a. Ensure anchorMsgCreatedAt is set
        if (!anchorMsgCreatedAt && anchorInteractionId) {
            const { data: anchorRow } = await supabase
                .from('interacoes')
                .select('created_at')
                .eq('id', anchorInteractionId)
                .single();
            if (anchorRow) {
                anchorMsgCreatedAt = new Date(anchorRow.created_at).getTime();
                anchorCreatedAt = anchorRow.created_at;
            }
        }

        // 5. RESOLVE REMOTE JID (Scoped to Instance)
        let resolvedRemoteJid = (payload.remoteJid || payload.remote_jid || null);

        if (!resolvedRemoteJid && anchorInteractionId) {
            const { data: anchorRow } = await supabase
                .from('interacoes')
                .select('remote_jid, instance_name')
                .eq('id', anchorInteractionId)
                .maybeSingle();

            // Only use if instance matches (safety check)
            if (anchorRow?.remote_jid && anchorRow.instance_name === instanceName) {
                resolvedRemoteJid = anchorRow.remote_jid;
            }
        }

        if (!resolvedRemoteJid) {
            // Fallback: Last valid remote_jid for this lead ON THIS INSTANCE
            const { data: lastValid } = await supabase.from('interacoes')
                .select('id, remote_jid')
                .eq('lead_id', leadId)
                .eq('instance_name', instanceName) // STRICT FILTER
                .not('remote_jid', 'is', null)
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (lastValid?.remote_jid) resolvedRemoteJid = lastValid.remote_jid;
        }

        console.log(`🎯 [${runId}] Resolved RemoteJid: ${resolvedRemoteJid || 'MISSING'} for Instance: ${instanceName}`);

        if (!resolvedRemoteJid) {
            console.error(`🛑 [${runId}] Aborting: No remoteJid found for this instance.`);
            return respondNoSend({ skipped: "missing_remoteJid" }, 'missing_remoteJid');
        }

        // --- CHECK #1: ANTI-SPAM (FIXED: anchor-based, not 60s cooldown) ---
        try {
            const { data: lastOutbound, error: lastOutError } = await supabase
                .from('interacoes')
                .select('id, created_at')
                .eq('instance_name', instanceName)
                .eq('remote_jid', resolvedRemoteJid)
                .eq('wa_from_me', true)
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!lastOutError && lastOutbound) {
                const lastTime = new Date(lastOutbound.created_at).getTime();
                const nowTime = Date.now();
                lastOutboundCreatedAt = lastOutbound.created_at;

                // A) ALREADY REPLIED: outbound is NEWER than anchor → duplicate run
                if (anchorMsgCreatedAt && lastTime > anchorMsgCreatedAt) {
                    decision = 'already_replied';
                    console.warn(`🛑 [${runId}] Skipped: Already replied after anchor. lastOut=${lastOutbound.created_at} > anchor=${anchorCreatedAt}`);
                    return respondNoSend({ skipped: "already_replied", runId }, 'already_replied');
                }

                // B) TIGHT LOOP GUARD: block only true re-entry (no newer inbound than last outbound)
                const TIGHT_LOOP_GUARD_MS = 5000;
                const lastOutboundAtMs = Date.parse(lastOutbound.created_at);
                const anchorAtMs = anchorCreatedAt ? Date.parse(anchorCreatedAt) : NaN;
                const ageMs = nowTime - lastOutboundAtMs;

                if (ageMs < TIGHT_LOOP_GUARD_MS) {
                    if (anchorCreatedAt && Number.isFinite(anchorAtMs) && anchorAtMs > lastOutboundAtMs) {
                        console.log(`[${runId}] Tight-loop bypass: inbound(${anchorCreatedAt}) is newer than last outbound(${lastOutbound.created_at}).`);
                    } else {
                        decision = 'tight_loop_guard';
                        console.warn(`🛑 [${runId}] Skipped: Tight loop guard. Last sent ${ageMs / 1000}s ago.`);
                        return respondNoSend({ skipped: "tight_loop_guard", runId }, 'tight_loop_guard');
                    }
                }

                // C) ANCHOR IS NEWER → new inbound after bot reply → ALLOW
                decision = 'allowed_new_inbound';
                console.log(`✅ [${runId}] Allowed: anchor is newer than last outbound. Responding to follow-up.`);
            }
        } catch (err) {
            console.error(`⚠️ [${runId}] Anti-Spam Check #1 failed (non-blocking):`, err);
            // Fail open - continue
        }

        // 6. BUILD CONTEXT (Scoped History)
        const currentStage = normalizeStage(lead.status_pipeline) || lead.pipeline_stage || 'novo_lead';
        let { data: stageConfig } = await supabase
            .from('ai_stage_config')
            .select('*')
            .eq('org_id', leadOrgId)
            .eq('pipeline_stage', currentStage)
            .maybeSingle();

        if (!stageConfig) {
            const { data: fallback } = await supabase
                .from('ai_stage_config')
                .select('*')
                .eq('org_id', leadOrgId)
                .eq('pipeline_stage', 'novo_lead')
                .maybeSingle();
            stageConfig = fallback;
        }

        // FIX: Stage Inactive → use fallback prompt instead of skipping
        let stagePromptText = '';
        if (!stageConfig?.is_active) {
            stageFallbackUsed = true;
            stagePromptText = STAGE_FALLBACK_PROMPT;
            console.log(`⚠️ [${runId}] Stage '${currentStage}' inactive/missing. Using FAQ fallback prompt. stageFallbackUsed=true`);
        } else {
            stagePromptText = stageConfig.prompt_override || stageConfig.default_prompt || '';
            console.log(`📝 [${runId}] Stage '${currentStage}' prompt source: ${stageConfig.prompt_override ? 'OVERRIDE' : 'DEFAULT'}. Length: ${stagePromptText.length}`);
            if (stagePromptText.length > 0 && stagePromptText.length < 200) {
                console.warn(`🚨 [${runId}] CRITICAL: Stage prompt for '${currentStage}' is suspiciously short (${stagePromptText.length} chars). Likely a placeholder seed. Check ai_stage_config.default_prompt for org_id=${leadOrgId}.`);
            }
        }

        // HISTORY SCOPED TO INSTANCE
        const { data: history } = await supabase
            .from('interacoes')
            .select('*')
            .eq('lead_id', leadId)
            .eq('instance_name', instanceName) // STRICT FILTER
            .order('id', { ascending: false })
            .limit(30); // Use 30 for context aggregation

        // BURST AGGREGATION: collect consecutive client msgs since last outbound (within 90s)
        let chatHistory = (history || []).reverse().map((m: any) => {
            const role = m.tipo === 'mensagem_cliente' ? 'user' : 'assistant';
            const attachmentType = String(m?.attachment_type || '').toLowerCase();
            const attachmentUrl = m?.attachment_url ? String(m.attachment_url) : null;
            const normalizedText = normalizeHistoryText(m?.mensagem, attachmentUrl);

            if (role === 'user' && attachmentType === 'image' && attachmentUrl) {
                return {
                    role,
                    content: [
                        { type: 'text', text: normalizedText || 'Imagem enviada pelo cliente.' },
                        { type: 'image_url', image_url: { url: attachmentUrl } }
                    ],
                    created_at: m.created_at
                };
            }

            return {
                role,
                content: normalizedText,
                created_at: m.created_at
            };
        });

        // Build aggregated burst block from raw history (walk backward from newest)
        const burstMsgs: string[] = [];
        const anchorTs = anchorMsgCreatedAt || Date.now();
        const cutoffTs = anchorTs - (BURST_LOOKBACK_S * 1000); // 90s lookback
        if (history && history.length > 0) {
            // history is desc order (newest first) — walk forward = newest to oldest
            for (const m of history) {
                if (m.wa_from_me || m.tipo !== 'mensagem_cliente') break; // hit an outbound → stop
                const mTs = new Date(m.created_at).getTime();
                if (mTs < cutoffTs) break; // too old
                burstMsgs.push(m.mensagem);
            }
        }
        burstMsgs.reverse(); // chronological order
        const lastUserTextAggregated = burstMsgs.join('\n');
        aggregatedBurstCount = burstMsgs.length;
        aggregatedChars = lastUserTextAggregated.length;
        if (aggregatedBurstCount > 1) {
            console.log(`🧩 [${runId}] Burst aggregated: ${aggregatedBurstCount} msgs, ${aggregatedChars} chars.`);
        }

        // Replace the last user block in chatHistory with the burst-aggregated text
        if (chatHistory.length > 0 && aggregatedBurstCount > 0) {
            // Remove all trailing user messages
            let idx = chatHistory.length - 1;
            while (idx >= 0 && chatHistory[idx].role === 'user') idx--;
            chatHistory = chatHistory.slice(0, idx + 1);
            // Push single aggregated block
            chatHistory.push({ role: 'user', content: lastUserTextAggregated });
        }

        // Strip created_at from chatHistory before sending to LLM
        chatHistory = chatHistory.map((m: any) => ({ role: m.role, content: m.content }));

        // Extract last user text for KB/web search
        const lastUserText = lastUserTextAggregated || (
            chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user'
                ? extractTextFromMessageContent(chatHistory[chatHistory.length - 1].content)
                : ''
        );

        const openAIApiKey = Deno.env.get('OPENAI_API_KEY') || settings.openai_api_key || '';
        const openai = openAIApiKey ? new OpenAI({ apiKey: openAIApiKey }) : null;

        // --- CRM COMMENTS CONTEXT ---
        let crmCommentsBlock = '';
        let crmCommentsCount = 0;
        try {
            const { data: crmComments, error: crmCommentsErr } = await supabase
                .from('comentarios_leads')
                .select('texto, autor, created_at')
                .eq('lead_id', Number(leadId))
                .order('created_at', { ascending: false })
                .limit(12);

            if (crmCommentsErr) {
                console.warn(`⚠️ [${runId}] CRM comments load error (non-blocking):`, crmCommentsErr.message);
            } else if (crmComments && crmComments.length > 0) {
                crmCommentsCount = crmComments.length;
                crmCommentsBlock = crmComments
                    .slice()
                    .reverse()
                    .map((c: any) => {
                        const author = String(c?.autor || 'CRM').trim();
                        const text = String(c?.texto || '').replace(/\s+/g, ' ').trim().substring(0, 220);
                        const at = c?.created_at ? String(c.created_at).substring(0, 19) : 'sem_data';
                        return `- [${at}] ${author}: ${text}`;
                    })
                    .join('\n');
                console.log(`🗂️ [${runId}] CRM comments loaded: ${crmCommentsCount}`);
            }
        } catch (crmCommentErr: any) {
            console.warn(`⚠️ [${runId}] CRM comments exception (non-blocking):`, crmCommentErr?.message || crmCommentErr);
        }

        // --- LATEST PROPOSAL SNAPSHOT (avoid repeated asks / preserve continuity) ---
        let latestProposalBlock = '';
        try {
            const { data: latestProposal, error: latestProposalErr } = await supabase
                .from('propostas')
                .select('id, status, valor_projeto, consumo_kwh, potencia_kw, paineis_qtd, economia_mensal, payback_anos, created_at')
                .eq('lead_id', Number(leadId))
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestProposalErr) {
                console.warn(`⚠️ [${runId}] Latest proposal load error (non-blocking):`, latestProposalErr.message);
            } else if (latestProposal) {
                latestProposalBlock =
                    `id=${latestProposal.id}, status=${latestProposal.status}, valor_projeto=${latestProposal.valor_projeto}, ` +
                    `consumo_kwh=${latestProposal.consumo_kwh}, potencia_kw=${latestProposal.potencia_kw}, ` +
                    `paineis_qtd=${latestProposal.paineis_qtd}, economia_mensal=${latestProposal.economia_mensal}, ` +
                    `payback_anos=${latestProposal.payback_anos}, created_at=${latestProposal.created_at}`;
            }
        } catch (latestProposalErr: any) {
            console.warn(`⚠️ [${runId}] Latest proposal exception (non-blocking):`, latestProposalErr?.message || latestProposalErr);
        }

        // --- RAG: INTERNAL KB SEARCH ---
        let kbBlock = '';
        let companyNameForPrompt = '';

        // M7.2: strict org source (no silent fallback to user_id/user metadata).
        let kbOrgId = leadOrgId;
        let kbOrgIdSource = 'lead.org_id';

        if (settings.org_id && leadOrgId && String(settings.org_id) !== String(leadOrgId)) {
            console.warn(`⚠️ [${runId}] ai_settings.org_id (${settings.org_id}) differs from lead.org_id (${leadOrgId}). Using lead.org_id.`);
            kbOrgId = leadOrgId;
            kbOrgIdSource = 'lead.org_id';
        }

        try {
            if (kbOrgId) {
                const { data: companyProfileForName, error: companyNameErr } = await supabase
                    .from('company_profile')
                    .select('company_name')
                    .eq('org_id', kbOrgId)
                    .maybeSingle();

                if (!companyNameErr) {
                    companyNameForPrompt = String(companyProfileForName?.company_name || '').trim();
                }
            }
        } catch (companyNameFetchErr: any) {
            console.warn(`⚠️ [${runId}] Company name load exception (non-blocking):`, companyNameFetchErr?.message || companyNameFetchErr);
        }

        try {
            if (lastUserText && kbOrgId) {
                const { data: kbResults, error: kbErr } = await supabase.rpc('knowledge_search_v3', {
                    p_org_id: kbOrgId,
                    p_query_text: lastUserText,
                    p_limit: 6
                });

                if (kbErr) {
                    kbError = kbErr.message;
                    console.warn(`⚠️ [${runId}] KB search error (non-blocking):`, kbErr.message);
                } else if (kbResults && kbResults.length > 0) {
                    kbHitsCount = kbResults.length;
                    const kbLines: string[] = [];
                    if (companyNameForPrompt) {
                        kbLines.push(`[empresa_nome] ${companyNameForPrompt}`);
                    }
                    for (const item of kbResults) {
                        const snippet = (item.content_snippet || '').substring(0, 400);
                        if (item.item_type === 'company_info') {
                            kbLines.push(`[empresa] ${item.content_snippet}`);
                        } else if (item.item_type === 'objection') {
                            kbLines.push(`[objecao] P: ${item.title_or_name} R: ${snippet}`);
                        } else if (item.item_type === 'testimonial') {
                            kbLines.push(`[depoimento] ${item.title_or_name}: ${snippet}`);
                        } else {
                            kbLines.push(`[${item.item_type}] ${item.title_or_name}: ${snippet}`);
                        }
                    }
                    kbBlock = kbLines.join('\n');
                    kbChars = kbBlock.length;
                    console.log(`📚 [${runId}] KB search (Org: ${kbOrgId} | Src: ${kbOrgIdSource}) returned ${kbHitsCount} hits, ${kbChars} chars.`);
                }
            }
        } catch (err: any) {
            kbError = err?.message || String(err);
            console.warn(`⚠️ [${runId}] KB search exception (non-blocking):`, kbError);
        }

        if (!kbBlock && companyNameForPrompt) {
            kbBlock = `[empresa_nome] ${companyNameForPrompt}`;
            kbChars = kbBlock.length;
        }

        // --- WEB SEARCH FALLBACK (OpenAI Web Search -> Serper) ---
        let webBlock = '';
        let webNoKeyFallbackResponse: { action: string; content: string; _web_search: string } | null = null;
        const serperKey = Deno.env.get('SERPER_API_KEY') || Deno.env.get('GOOGLE_SERPER_API_KEY');
        const webSearchEnabled = String(Deno.env.get('AI_WEB_SEARCH_ENABLED') || 'true').toLowerCase() !== 'false';
        const missingEssentialContext = detectSolarIntentAndMissing(lastUserText || '', lead).missing.length > 0;
        const shouldTryWebSearch = webSearchEnabled && kbChars < 400 && looksLikeQuestion(lastUserText) && !missingEssentialContext;
        const sanitizedWebQuery = sanitizeQuery(lastUserText);
        const webQuery = sanitizedWebQuery.length > 5 ? `energia solar Brasil ${sanitizedWebQuery}` : '';

        try {
            if (shouldTryWebSearch && webQuery) {
                if (webSearchPerformedThisRun) {
                    webSearchStatus = 'already_performed_this_run';
                    await logWebSearch('web_search_skipped', {
                        query: webQuery,
                        results_count: 0,
                        reason: 'already_performed_this_run',
                        latency_ms: 0
                    });
                } else {
                    const nowMinus60sIso = new Date(Date.now() - 60_000).toISOString();
                    const { count: recentWebSearchCount, error: webRateErr } = await supabase
                        .from('ai_action_logs')
                        .select('id', { count: 'exact', head: true })
                        .eq('lead_id', Number(leadId))
                        .eq('action_type', 'web_search_performed')
                        .gte('created_at', nowMinus60sIso);

                    if (webRateErr) {
                        webSearchStatus = 'rate_limit_check_error';
                        webError = webRateErr.message;
                        await logWebSearch('web_search_skipped', {
                            query: webQuery,
                            results_count: 0,
                            reason: 'rate_limit_check_error',
                            latency_ms: 0
                        });
                    } else if ((recentWebSearchCount || 0) > 0) {
                        webSearchStatus = 'rate_limited';
                        await logWebSearch('web_search_skipped', {
                            query: webQuery,
                            results_count: 0,
                            reason: 'recent_search_60s',
                            latency_ms: 0
                        });
                    } else {
                        console.log(`🌐 [${runId}] Web search triggered. Query: "${webQuery}"`);
                        const webStart = Date.now();

                        if (openAIApiKey) {
                            const openAiSearch = await performOpenAIWebSearch(openAIApiKey, webQuery);
                            if (openAiSearch.ok) {
                                webUsed = true;
                                webResultsCount = 1;
                                webSearchStatus = 'performed_openai';
                                webSearchPerformedThisRun = true;
                                webBlock = `- ${openAiSearch.text.substring(0, 1200)}`;
                                await logWebSearch('web_search_performed', {
                                    query: webQuery,
                                    results_count: webResultsCount,
                                    latency_ms: Date.now() - webStart,
                                    provider: 'openai'
                                });
                            } else {
                                webError = openAiSearch.error || 'openai_search_failed';
                                console.warn(`⚠️ [${runId}] OpenAI web search failed, fallback to Serper: ${webError}`);
                            }
                        }

                        if (!webUsed) {
                            if (!serperKey) {
                                webSearchStatus = 'skipped_no_key';
                                webError = webError || 'missing_serper_key';
                                webNoKeyFallbackResponse = {
                                    action: 'send_message',
                                    content: 'Posso te orientar com base no fluxo padrão. Para te passar algo mais preciso, me confirma sua cidade/UF e concessionária de energia.',
                                    _web_search: 'skipped_no_key'
                                };
                                await logWebSearch('web_search_skipped', {
                                    query: webQuery,
                                    results_count: 0,
                                    reason: webError,
                                    latency_ms: Date.now() - webStart
                                });
                            } else {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 8000);
                                let serperResp: Response;
                                try {
                                    serperResp = await fetch('https://google.serper.dev/search', {
                                        method: 'POST',
                                        headers: {
                                            'X-API-KEY': serperKey,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({ q: webQuery, gl: 'br', hl: 'pt', num: 3 }),
                                        signal: controller.signal
                                    });
                                } finally {
                                    clearTimeout(timeoutId);
                                }

                                const latencyMs = Date.now() - webStart;
                                if (serperResp.ok) {
                                    const serperData = await serperResp.json();
                                    const organic = Array.isArray(serperData?.organic) ? serperData.organic : [];
                                    const topResults = organic.slice(0, 3).map((r: any) => {
                                        const title = String(r?.title || '').trim().substring(0, 120);
                                        const snippet = String(r?.snippet || '').replace(/\s+/g, ' ').trim().substring(0, 200);
                                        const domain = extractDomain(String(r?.link || ''));
                                        return { title, snippet, domain };
                                    }).filter((r: any) => r.title || r.snippet);

                                    webUsed = true;
                                    webResultsCount = topResults.length;
                                    webSearchStatus = 'performed_serper';
                                    webSearchPerformedThisRun = true;

                                    const webLines: string[] = [];
                                    for (const r of topResults) {
                                        const source = r.domain ? ` (fonte: ${r.domain})` : '';
                                        webLines.push(`- ${r.title || 'Sem título'}: ${r.snippet || '(sem resumo)'}${source}`);
                                    }
                                    webBlock = webLines.join('\n');

                                    await logWebSearch('web_search_performed', {
                                        query: webQuery,
                                        results_count: webResultsCount,
                                        latency_ms: latencyMs,
                                        provider: 'serper'
                                    });
                                    console.log(`🌐 [${runId}] Serper web search returned ${webResultsCount} results.`);
                                } else {
                                    webSearchStatus = 'http_error';
                                    webError = `Serper HTTP ${serperResp.status}`;
                                    await logWebSearch('web_search_skipped', {
                                        query: webQuery,
                                        results_count: 0,
                                        reason: `http_${serperResp.status}`,
                                        latency_ms: latencyMs,
                                        provider: 'serper'
                                    });
                                    console.warn(`⚠️ [${runId}] Serper API error: ${serperResp.status}`);
                                }
                            }
                        }
                    }
                }
            }
        } catch (err: any) {
            webSearchStatus = err?.name === 'AbortError' ? 'timeout' : 'error';
            webError = err?.message || String(err);
            await logWebSearch('web_search_skipped', {
                query: webQuery || null,
                results_count: 0,
                reason: webSearchStatus,
                latency_ms: 0
            });
            console.warn(`⚠️ [${runId}] Web search exception (non-blocking):`, webError);
        }


        // Initialize gate (scoped outside for post-processing)
        let gate: { intent: string | null; missing: string[]; directive: string | null; } = { intent: null, missing: [], directive: null };

        // 7. OPENAI CALL
        let aiRes: AIResponse | null = null;

        // --- TEST 11: DETERMINISTIC FOLLOWUP TRIGGER ---
        console.log(`Debug Aggregated: ${JSON.stringify(lastUserTextAggregated)}`);
        if (lastUserTextAggregated.includes('[[SMOKE_FOLLOWUP_TEST__9f3c1a]]')) {
            console.log(`🧪 [${runId}] Test 11 Triggered: Forcing create_followup`);
            aiRes = {
                action: 'send_message',
                content: 'Ok! Vou criar a tarefa de follow-up agora.',
                task: {
                    title: 'SMOKE_FOLLOWUP_OK - Aguardar conta de luz',
                    notes: 'Teste determinístico do follow-up.',
                    due_at: '2026-02-10T12:00:00-03:00',
                    priority: 'medium',
                    channel: 'whatsapp'
                }
            };
        }

        // --- TEST 14: DETERMINISTIC PROPOSAL TRIGGER ---
        if (!aiRes && (lastUserTextAggregated.includes('PROPOSAL_TEST_A') || lastUserTextAggregated.includes('PROPOSAL_TEST_B'))) {
            console.log(`🧪 [${runId}] Test 14 Triggered: Forcing create_proposal_draft`);
            aiRes = {
                action: 'create_proposal_draft',
                content: 'Preparei um rascunho de proposta com base nos dados informados.',
                proposal: {
                    valor_projeto: { value: 25000, confidence: 'high', source: 'user' },
                    consumo_kwh: { value: 350, confidence: 'high', source: 'user' },
                    potencia_kw: { value: 4.5, confidence: 'medium', source: 'estimated' },
                    paineis_qtd: { value: 10, confidence: 'medium', source: 'estimated' },
                    economia_mensal: { value: 300, confidence: 'medium', source: 'estimated' },
                    payback_anos: { value: 5, confidence: 'medium', source: 'estimated' },
                    assumptions: 'Telhado colonial, orientação norte, sem sombreamento.'
                }
            };
        }

        // --- TEST 18: HUMANIZATION FAIL TRIGGER ---
        if (!aiRes && lastUserTextAggregated.includes('[[TEST_HUMANIZATION_FAIL]]')) {
            console.log(`🧪 [${runId}] Test 18 Triggered: Forcing UNCANNY response`);
            aiRes = {
                action: 'send_message',
                // Long text, specific forbidden emoji, no split
                content: 'Oi tudo bem? 😊 Eu sou um robô corporativo e gostaria de saber se você quer energia solar. Se for solar, posso te ajudar! 😊 Isso aqui é um texto muito longo propositalmente para testar o auto-splitter que deve quebrar em várias mensagens quando detecta que o texto ficou gigante e chato de ler no WhatsApp. Espero que funcione! 😊'
            };
        }

        if (!aiRes && webNoKeyFallbackResponse) {
            aiRes = webNoKeyFallbackResponse as any;
        }

        if (!aiRes) {
            if (!openai) {
                return respondNoSend({ skipped: 'missing_openai_api_key' }, 'missing_openai_api_key');
            }

            // --- INCREMENT 12: SOLAR GATE EXECUTION ---
            gate = detectSolarIntentAndMissing(lastUserTextAggregated || '', lead);
            if (gate.directive) {
                console.log(`🛡️ [${runId}] Solar Gate Triggered: ${gate.intent} missing [${gate.missing.join(',')}]`);
            }

            const systemPrompt = `
IDENTIDADE: ${settings.assistant_identity_name || 'Consultor Solar'}. Consultor de energia solar no Brasil.

${SOLAR_BR_PACK}

${gate.directive ? `\n🚨 ***SOLAR_SAFETY_GATE ATIVADO*** 🚨\n${gate.directive}\n(Obedeça esta diretiva acima de todas as outras de estilo)\n` : ''}

REGRAS DE VERDADE E QUALIDADE (OBRIGATÓRIO):
- NUNCA invente dados, prazos, percentuais ou garantias. Se não tiver certeza, diga "isso depende de [X]" e peça o dado.
- Responda com PROFUNDIDADE PRÁTICA: 3–8 linhas úteis. NÃO seja raso.
- Energia solar no Brasil — fluxo real que você deve conhecer:
  1. Análise da conta de luz / dimensionamento do sistema
  2. Proposta comercial / negociação
  3. Contrato e (se aplicável) financiamento
  4. Projeto de engenharia
  5. Homologação na distribuidora / concessionária (prazos variam por região: CEMIG, CPFL, Enel, Energisa, etc.)
  6. Instalação física (geralmente 1–3 dias para residencial)
  7. Vistoria / troca do medidor pela distribuidora (pode levar de dias a semanas)
  8. Liberação e início da compensação de créditos de energia
- Para perguntas sobre PRAZOS/ECONOMIA: explique que a instalação é rápida, mas o início da economia real depende de homologação + troca de medidor + liberação da concessionária. Dê faixa típica e peça cidade/UF e concessionária para estimar melhor.
- NUNCA prometa economia garantida. Use linguagem condicional ("pode reduzir", "tende a", "a simulação indica…").
- Peça UM dado por vez quando precisar (cidade/UF, concessionária, tipo de telhado, consumo mensal, etc.).

ESTILO WHATSAPP (MODO HUMANO OBRIGATÓRIO):
- Escreva como humano no WhatsApp: direto, curto, natural. Sem texto corporativo.
- NÃO repetir saudação ("Oi tudo bem...") em toda mensagem. Cumprimente só no começo ou depois de longo silêncio.
- Responder em 2–4 mensagens curtas quando houver mais de 1 ideia.
  Use "||" para separar as mensagens (o sistema já envia em sequência).
  Regra: 1–2 frases por mensagem, preferir <= 140 caracteres por parte.
- Emojis: por padrão ZERO. Se usar, no máximo 1 e NUNCA use 😊.
  Só use emoji se o lead usou antes OU em confirmação (variar: ✅👍👌). Não repetir o mesmo.
- Perguntas: no máximo 1 pergunta por mensagem. Se precisar de 2, separar em mensagens diferentes.
- Off-topic (lead manda algo fora do contexto):
  1) reconhecer em 1 linha (sem "resposta inválida")
  2) fazer uma pergunta humana de clarificação
  3) só então puxar de volta com leveza para ENERGIA SOLAR
  Exemplos (use como padrão, sem soar script):
   - "Entendi. Isso é sobre o atendimento de energia solar ou foi outra coisa que você mandou aqui?"
   - "Saquei. Me diz só: você quer falar de energia solar agora ou prefere que eu te chame mais tarde?"
   - "Beleza. Sobre energia solar: sua conta de luz fica mais ou menos em qual faixa?"

PROIBIÇÕES ABSOLUTAS:
- Proibido: "Ops, resposta inválida..."
- Proibido: "se for solar..."
- Proibido: emoji 😊

REGRA DE AGENDAMENTO:
- Se o cliente confirma agendamento (diz "sim", "pode", "vamos", "bora", "quero agendar"), SEMPRE responda pedindo dia e horário sugerindo 2 opções.
- Só mova para chamada_agendada quando o cliente fornecer dia+horário concretos.

PROTOCOLO DA ETAPA:
${stagePromptText}

COMENTARIOS_CRM_RECENTES:
${crmCommentsBlock || '(sem comentários internos disponíveis)'}

RESUMO_PROPOSTA_ATUAL:
${latestProposalBlock || '(sem proposta registrada)'}

CONHECIMENTO_INTERNO:
${kbBlock || '(sem dados internos disponíveis)'}

PESQUISA_WEB:
${webBlock || '(sem pesquisa web)'}

EXTRAÇÃO DE DADOS DO LEAD (OBRIGATÓRIO):
Sempre que o lead informar dados úteis (conta de luz, consumo, telha, concessionária, cidade, CEP, tipo de instalação, padrão de energia, financiamento), extraia e inclua "fields" no JSON de resposta.
Nunca invente dados; se não tiver certeza, pergunte 1 coisa por vez.
Confidence: "high" se o usuário disse explicitamente, "medium" se inferido claramente, "low" se duvidoso.
Source: "user" se veio direto do que o cliente escreveu, "inferred" se você deduziu, "confirmed" se o cliente confirmou algo que você perguntou.
Campos possíveis: consumption_kwh_month, estimated_value_brl, customer_type, city, zip, roof_type, utility_company, grid_connection_type, financing_interest, installation_site_type, average_bill_context.

DADOS ESTRUTURADOS POR ETAPA (OPCIONAL, quando houver alta/medio confianca):
- Quando a conversa trouxer dados estruturados relevantes da etapa atual, inclua "stage_data" no JSON.
- Use chaves em snake_case.
- Para currentStage="proposta_negociacao", use namespace "negociacao" (ou "proposta_negociacao" se preferir) dentro de "stage_data".
- Nunca invente; omita campos sem certeza.

COMENTÁRIOS INTERNOS E FOLLOW-UPS (V7):
- Antes de pedir dados novamente, confira COMENTARIOS_CRM_RECENTES e RESUMO_PROPOSTA_ATUAL para não repetir perguntas já respondidas pelo lead.
- Após coletar uma informação importante ou definir próximo passo, registre um comentário interno via add_comment. Use comment_type: "summary" para resumos, "next_step" para próximo passo, "note" para observações gerais.
- Quando houver ação pendente (documentos, retorno, confirmação do cliente), crie um follow-up via create_followup com título claro e due_at se possível.
- Nunca crie tarefas/comentários duplicados no mesmo contexto; um por burst/âncora.
- Você pode combinar: action="send_message" + "comment":{"text":"...","type":"next_step"} para responder E registrar comentário ao mesmo tempo.

FORMATO DE SAÍDA (JSON ESTRITO, sem markdown, sem explicação fora do JSON):
{"action": "send_message"|"move_stage"|"update_lead_fields"|"add_comment"|"create_followup"|"none", "content": "Texto humano aqui...", "target_stage": "next_stage_id", "fields": {"campo": {"value": "...", "confidence": "high"|"medium"|"low", "source": "user"|"inferred"|"confirmed"}}, "stage_data": {"campo_ou_namespace": "valor"}, "comment": {"text": "Resumo/nota interna", "type": "summary|note|next_step"}, "task": {"title": "Título do follow-up", "notes": "Detalhes", "due_at": "ISO", "priority": "low|medium|high", "channel": "whatsapp|call|email"}}

Se action for "move_stage", DEVE incluir "target_stage".
Se currentStage for "novo_lead" e action for "send_message", DEVE incluir "target_stage": "respondeu" (obrigatorio - lead respondeu pela primeira vez).
Se action for "send_message", "content" é obrigatório.
Você pode combinar: action="send_message" + "fields" para responder E extrair dados ao mesmo tempo.
Você pode combinar: action="send_message" + "stage_data" para responder E salvar dados estruturados da etapa.
Se action for "add_comment", inclua "content" com o texto do comentário.
Se action for "create_followup", inclua "task" com título obrigatório.
Se APENAS dados foram detectados e não há resposta necessária, use action="update_lead_fields" (sem content).
`;

            let completion;
            try {
                completion = await openai.chat.completions.create({
                    model: "gpt-4o",
                    messages: [{ role: "system", content: systemPrompt }, ...chatHistory],
                    max_tokens: 900,
                    response_format: { type: "json_object" }
                });
            } catch (openaiErr: any) {
                console.error(`❌ [${runId}] OpenAI API call failed:`, openaiErr?.message || openaiErr);
                try {
                    await supabase.from('ai_action_logs').insert({
                        org_id: leadOrgId,
                        lead_id: Number(leadId),
                        action_type: 'openai_call_failed',
                        details: JSON.stringify({
                            runId,
                            error: openaiErr?.message || String(openaiErr),
                            status: openaiErr?.status || null,
                            interactionId: anchorInteractionId || null
                        }),
                        success: false
                    });
                } catch (_logErr) { /* non-blocking */ }
                return respondNoSend({ skipped: 'openai_call_failed', runId, error: openaiErr?.message }, 'openai_call_failed');
            }

            // Do not redeclare aiRes!
            aiRes = {};
            const rawContent = completion.choices[0]?.message?.content || '{}';

            try {
                const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
                aiRes = JSON.parse(cleaned);
            } catch (err) {
                console.error('⚠️ JSON Parse Failed. Fallback to raw text.', err);
                aiRes = { action: 'send_message', content: rawContent };
            }
        } // End if (!aiRes)

        if (typeof aiRes.content === 'string') aiRes.content = aiRes.content.substring(0, 2000);
        else if (aiRes.content) aiRes.content = String(aiRes.content).substring(0, 2000);
        else aiRes.content = '';

        // --- INCREMENT 12: POST-PROCESSING GUARDRAIL ---
        // Verify if AI actually obeyed the gate. If not, force the question.
        let gateApplied = false;
        if (gate.directive && aiRes.content) {
            const botText = aiRes.content.toLowerCase();

            // 1. Check if AI asked the missing info
            const missing = gate.missing; // ['cidade/uf'] or ['consumo_kwh', 'cidade/uf']
            let asked = false;

            if (gate.intent === 'prazos') {
                asked = /(cidade|qual.*lugar|onde.*mora|concession|distribuidora)/i.test(botText);

                // Anti-hallucination for specific deadlines (Broader Regex)
                // Matches: "5 dias", "10 a 15 dias", "um dia", "3 dias uteis"
                const daysRegex = /(\d+|um|dois|tr[êe]s|quatro|cinco)(\s*(?:a|e|ou|-|–)\s*\d+)?\s*(dias|dia)/gi;
                if (daysRegex.test(botText)) {
                    // AI hallucinated a specific day count ("5 dias") without knowing city. Sanitize.
                    aiRes.content = aiRes.content.replace(daysRegex, "algumas semanas (varia por região)");
                    console.warn(`🛡️ [${runId}] Gate Sanitized: Removed specific days from deadline response. Match found.`);
                }
            }

            if (gate.intent === 'dimensionamento') {
                asked = /(conta|fatura|energia|consumo|kwh|quais.*gasto|quanto.*paga)/i.test(botText);

                // Anti-hallucination for specific plates
                if (/\b(\d+)\s*(placas|pain[eé]is|m[óo]dulos)\b/i.test(botText)) {
                    aiRes.content = aiRes.content.replace(/\b(\d+)\s*(placas|pain[eé]is|m[óo]dulos)\b/gi, "um número exato de painéis");
                    console.warn(`🛡️ [${runId}] Gate Sanitized: Removed specific plate count.`);
                }
            }

            // Force append if not asked
            if (!asked) {
                gateApplied = true;
                const append = gate.intent === 'dimensionamento'
                    ? "\n\n(Para eu te responder com precisão: qual é o valor médio da sua conta de luz ou consumo em kWh?)"
                    : "\n\n(Para eu te dar uma estimativa real: qual é sua cidade e concessionária?)";
                aiRes.content += append;
                console.log(`🛡️ [${runId}] Gate Enforced: Appended missing question.`);
            }
        }

        // --- INCREMENT 13: HUMANIZATION POST-PROCESSING ---
        if (aiRes.content) {
            let text = aiRes.content;

            // 1. Strip Banned Emoji (😊)
            if (text.includes('😊')) {
                text = text.replace(/😊/g, '');
                console.warn(`🎨 [${runId}] Humanizer: Stripped '😊' emoji.`);
            }

            // 2. Auto-Split Long Messages (> 220 chars) if no "||" present
            if (text.length > 220 && !text.includes('||')) {
                const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g);
                if (sentences && sentences.length > 1) {
                    const blocks: string[] = [];
                    let currentBlock = "";

                    for (const s of sentences) {
                        if ((currentBlock.length + s.length) < 160) {
                            currentBlock += s;
                        } else {
                            if (currentBlock.length > 0) blocks.push(currentBlock.trim());
                            currentBlock = s;
                        }
                    }
                    if (currentBlock.length > 0) blocks.push(currentBlock.trim());

                    if (blocks.length > 1) {
                        text = blocks.join('||');
                        console.log(`🎨 [${runId}] Humanizer: Auto-split long text (${aiRes.content.length} chars) into ${blocks.length} parts.`);
                    }
                }
            }

            // 3. Final Assignment
            aiRes.content = text;
        }

        // DEBUG: Attach aggregated text
        aiRes._debug_aggregated = lastUserTextAggregated;
        if (adoptedLatestOnce) {
            (aiRes as any)._debug_yield_adopted = {
                from: adoptedFromInteractionId,
                to: adoptedToInteractionId
            };
        }
        if (webSearchStatus && !(aiRes as any)?._web_search) {
            (aiRes as any)._web_search = webSearchStatus;
        }

        if (!aiRes?.comment?.text || !String(aiRes.comment.text).trim()) {
            const fallbackComment = buildFallbackCommentFromText(lastUserTextAggregated || '');
            if (fallbackComment) {
                aiRes.comment = fallbackComment;
            }
        }

        // --- V6: EXTRACT AND SAVE LEAD FIELDS (side-effect, non-blocking) ---
        if (aiRes.fields && typeof aiRes.fields === 'object' && Object.keys(aiRes.fields).length > 0) {
            try {
                let skipV6Writes = false;
                const v6CandidateCount = Object.keys(aiRes.fields).length;

                try {
                    const anchorLatest = await isAnchorLatestInbound(supabase, leadId, anchorInteractionId);
                    if (!anchorLatest.ok) {
                        skipV6Writes = true;
                        v6FieldsCandidateCount = v6CandidateCount;
                        v6FieldsWrittenCount = 0;
                        (aiRes as any)._debug_overwrite_skipped = {
                            reason: 'stale_anchor',
                            anchor: anchorInteractionId || null,
                            latest: anchorLatest.latestId,
                            latestCreatedAt: anchorLatest.latestCreatedAt
                        };

                        console.warn(`⚠️ [${runId}] V6 overwrite skipped: stale anchor ${anchorInteractionId} (latest inbound ${anchorLatest.latestId}).`);

                        try {
                            await supabase.from('ai_action_logs').insert({
                                lead_id: Number(leadId),
                                action_type: 'lead_fields_skipped_stale_anchor',
                                details: JSON.stringify({
                                    runId,
                                    anchorInteractionId: anchorInteractionId || null,
                                    latestInboundId: anchorLatest.latestId,
                                    latestInboundCreatedAt: anchorLatest.latestCreatedAt
                                }),
                                success: false,
                            });
                        } catch (staleLogErr: any) {
                            console.warn(`⚠️ [${runId}] V6 stale-anchor skip log failed (non-blocking):`, staleLogErr?.message || staleLogErr);
                        }
                    }
                } catch (anchorCheckErr: any) {
                    console.warn(`⚠️ [${runId}] V6 stale-anchor check failed (fail-open):`, anchorCheckErr?.message || anchorCheckErr);
                    (aiRes as any)._debug_overwrite_skipped = {
                        reason: 'check_failed',
                        anchor: anchorInteractionId || null
                    };
                }

                if (!skipV6Writes) {
                    // Re-fetch lead for freshest data (avoid stale overwrite)
                    const { data: freshLead } = await supabase.from('leads').select('*').eq('id', leadId).single();
                    if (freshLead) {
                        const v6Result = await executeLeadFieldUpdate(supabase, leadId, aiRes.fields, freshLead, runId, lastUserTextAggregated);
                        v6FieldsCandidateCount = v6Result.candidateCount;
                        v6FieldsWrittenCount = v6Result.writtenCount;
                    }
                }
            } catch (v6Err: any) {
                console.error(`⚠️ [${runId}] V6: Field extraction failed (non-blocking):`, v6Err?.message || v6Err);
            }
        }

        // --- V11: EXTRACT AND SAVE STRUCTURED STAGE DATA (JSONB merge, non-blocking) ---
        const stageDataCandidate = extractStageDataCandidate(aiRes);
        if (stageDataCandidate) {
            try {
                let skipV11Writes = false;

                try {
                    const anchorLatest = await isAnchorLatestInbound(supabase, leadId, anchorInteractionId);
                    if (!anchorLatest.ok) {
                        skipV11Writes = true;
                        v11StageDataSkippedReason = 'stale_anchor';
                        console.warn(`⚠️ [${runId}] V11 stage_data write skipped: stale anchor ${anchorInteractionId} (latest inbound ${anchorLatest.latestId}).`);
                    }
                } catch (anchorCheckErr: any) {
                    console.warn(`⚠️ [${runId}] V11 stale-anchor check failed (fail-open):`, anchorCheckErr?.message || anchorCheckErr);
                }

                if (!skipV11Writes) {
                    const { data: freshLead } = await supabase.from('leads').select('*').eq('id', leadId).single();
                    if (freshLead) {
                        const v11Result = await executeLeadStageDataUpdate(
                            supabase,
                            leadId,
                            currentStage,
                            stageDataCandidate,
                            freshLead,
                            runId
                        );
                        v11StageDataCandidateCount = v11Result.candidateCount;
                        v11StageDataWrittenCount = v11Result.writtenCount;
                        v11StageDataNamespace = v11Result.namespace;
                        v11StageDataSkippedReason = v11Result.skippedReason;
                    } else {
                        v11StageDataSkippedReason = 'lead_refetch_failed';
                    }
                }
            } catch (v11Err: any) {
                v11StageDataSkippedReason = `exception:${v11Err?.message || 'unknown'}`;
                console.error(`⚠️ [${runId}] V11: Stage data extraction failed (non-blocking):`, v11Err?.message || v11Err);
            }
        }

        // V6: If action is purely update_lead_fields (no content to send), return early
        if (aiRes.action === 'update_lead_fields' && !aiRes.content) {
            console.log(`📋 [${runId}] V6: Pure field update (no message). Fields: ${v6FieldsWrittenCount}/${v6FieldsCandidateCount}`);
            // Still do structured log and run log below, skip message sending
        }

        // --- V7: COMMENT SIDE-EFFECT (non-blocking, runs alongside send_message/move_stage) ---
        const sideEffectComment = aiRes.comment && typeof aiRes.comment === 'object' && aiRes.comment.text;
        if (sideEffectComment) {
            try {
                const v7Result = await executeAddComment(
                    supabase, leadId, aiRes.comment.text, aiRes.comment.type || 'note',
                    settings.assistant_identity_name || 'IA', runId, anchorCreatedAt, anchorInteractionId
                );
                v7CommentWritten = v7Result.written;
                v7CommentSkippedReason = v7Result.skippedReason;
            } catch (v7Err: any) {
                console.error(`⚠️ [${runId}] V7: Comment side-effect failed (non-blocking):`, v7Err?.message || v7Err);
            }
        }

        // --- V7: FOLLOWUP SIDE-EFFECT (non-blocking) ---
        const sideEffectTask = aiRes.task && typeof aiRes.task === 'object' && aiRes.task.title;
        if (sideEffectTask) {
            try {
                const v7fResult = await executeCreateFollowup(
                    supabase, leadId, aiRes.task, runId, anchorCreatedAt, anchorInteractionId,
                    leadOrgId, lead.user_id
                );
                v7FollowupWritten = v7fResult.written;
                v7FollowupSkippedReason = v7fResult.skippedReason;
            } catch (v7Err: any) {
                console.error(`⚠️ [${runId}] V7: Followup side-effect failed (non-blocking):`, v7Err?.message || v7Err);
            }
        }

        // --- V9: APPOINTMENT SIDE-EFFECT (Blocking for stage move, but safe exec) ---
        let appointmentWritten = false;
        let appointmentSkippedReason: string | null = null;
        let appointmentError: string | null = null;

        const sideEffectAppointment = aiRes.appointment && typeof aiRes.appointment === 'object' && aiRes.appointment.title;
        const isAppointmentAction = aiRes.action === 'create_appointment';

        if (sideEffectAppointment || isAppointmentAction) {
            try {
                const apptData = aiRes.appointment || {};
                const v9Result = await executeCreateAppointment(
                    supabase, leadId, apptData, runId, anchorCreatedAt, anchorInteractionId,
                    leadOrgId, lead.user_id
                );
                appointmentWritten = v9Result.written;
                appointmentSkippedReason = v9Result.skippedReason;
            } catch (v9Err: any) {
                appointmentError = v9Err?.message || String(v9Err);
                console.error(`⚠️ [${runId}] V9: Appointment creation failed:`, appointmentError);
            }
        }

        // --- V10: PROPOSAL DRAFT SIDE-EFFECT (non-blocking) ---
        let proposalWritten = false;
        let proposalSkippedReason: string | null = null;
        let proposalId: string | null = null;

        const sideEffectProposal = aiRes.proposal && typeof aiRes.proposal === 'object';
        const isProposalAction = aiRes.action === 'create_proposal_draft';

        if (sideEffectProposal || isProposalAction) {
            try {
                // If action is explicit but proposal missing, we might skip or fail.
                // But the function handles validation.
                const proposalData = aiRes.proposal || {};
                const v10Result = await executeCreateProposalDraft(
                    supabase, leadId, proposalData, runId, anchorInteractionId, lead.user_id, leadOrgId
                );
                proposalWritten = v10Result.written;
                proposalSkippedReason = v10Result.skippedReason;
                proposalId = v10Result.proposalId;
            } catch (v10Err: any) {
                console.error(`⚠️ [${runId}] V10: Proposal side-effect failed:`, v10Err?.message || v10Err);
            }
        }

        // V7: If action is purely add_comment (no outbound message)
        if (aiRes.action === 'add_comment' && !sideEffectComment) {
            try {
                const v7Result = await executeAddComment(
                    supabase, leadId, aiRes.content || '', aiRes.comment_type || 'note',
                    settings.assistant_identity_name || 'IA', runId, anchorCreatedAt, anchorInteractionId
                );
                v7CommentWritten = v7Result.written;
                v7CommentSkippedReason = v7Result.skippedReason;
            } catch (v7Err: any) {
                console.error(`⚠️ [${runId}] V7: add_comment action failed (non-blocking):`, v7Err?.message || v7Err);
            }
            console.log(`💬 [${runId}] V7: Pure add_comment action. Written: ${v7CommentWritten}`);
        }

        // V7: If action is purely create_followup (no outbound message)
        if (aiRes.action === 'create_followup') {
            try {
                const v7fResult = await executeCreateFollowup(
                    supabase, leadId, aiRes.task || {}, runId, anchorCreatedAt, anchorInteractionId,
                    leadOrgId, lead.user_id
                );
                v7FollowupWritten = v7fResult.written;
                v7FollowupSkippedReason = v7fResult.skippedReason;
            } catch (v7Err: any) {
                console.error(`⚠️ [${runId}] V7: create_followup action failed (non-blocking):`, v7Err?.message || v7Err);
            }
            console.log(`📝 [${runId}] V7: Pure create_followup action. Written: ${v7FollowupWritten}`);
        }

        // V9: Pure create_appointment (already handled in shared block above, just logging)
        if (aiRes.action === 'create_appointment') {
            console.log(`📅 [${runId}] V9: Pure create_appointment action. Written: ${appointmentWritten}, Reason: ${appointmentSkippedReason || 'OK'}`);
        }

        // 8. EXECUTE ACTIONS (INCREMENT 2: Split Support)
        if ((aiRes.action === 'send_message' || (aiRes.action === 'move_stage' && aiRes.content) || (aiRes.action === 'create_appointment' && aiRes.content)) && aiRes.content && aiRes.action !== 'update_lead_fields' && aiRes.action !== 'add_comment' && aiRes.action !== 'create_followup') {
            const sourceTag = String(payload?.source || '').toLowerCase();
            const remoteDigits = String(resolvedRemoteJid || '').replace(/\D/g, '');
            const isSmokeTransport =
                payload?.dryRun === true ||
                payload?.dry_run === true ||
                sourceTag === 'smoke' ||
                remoteDigits === '5511999990000' ||
                lead?.nome === 'SMOKE_TEST_LEAD';
            const isSimulatedTransport = forceSimulatedTransport || isSmokeTransport;

            if (isSimulatedTransport) {
                transportMode = 'simulated';
                transportSimReason = forceSimulatedTransport
                    ? 'force_simulated_transport'
                    : payload?.dryRun === true || payload?.dry_run === true
                        ? 'dry_run'
                        : sourceTag === 'smoke'
                            ? 'source_smoke'
                            : remoteDigits === '5511999990000'
                                ? 'test_remote'
                                : 'smoke_lead';
            }

            const rawParts = aiRes.content
                .split('||')
                .map((p: string) => p.trim())
                .filter(Boolean);
            const singleOutboundContent = rawParts.join('\n\n').trim();
            const burstMode = aggregatedBurstCount > 1;

            // Burst safety: never fan out multiple outbound messages for a burst response.
            const parts = isSimulatedTransport
                ? [singleOutboundContent]
                : rawParts;

            if (isSimulatedTransport) {
                console.log(`[${runId}] Simulated transport enabled (${transportSimReason || 'unknown'}).`);
            }

            for (let i = 0; i < parts.length; i++) {
                const partContent = parts[i];
                if (!partContent) continue;
                const outboundText = repairMojibake(partContent);

                const typingDuration = Math.min(6000, 2000 + (outboundText.length * 50));
                if (!isSimulatedTransport) {
                    await sendTypingIndicator(instanceName, resolvedRemoteJid, typingDuration);
                }

                // --- CHECK #2: ANTI-SPAM FINAL (First Part Only) — FIXED: anchor-based ---
                if (i === 0) {
                    try {
                        const leadStillAiEnabled = await isLeadAiEnabledNow(supabase, leadId);
                        if (!leadStillAiEnabled) {
                            decision = 'lead_ai_disabled_before_send';
                            return respondNoSend({ skipped: 'lead_ai_disabled_before_send', runId }, 'lead_ai_disabled_before_send');
                        }

                        const { data: latestClientAtSend } = await supabase
                            .from('interacoes')
                            .select('id')
                            .eq('lead_id', leadId)
                            .eq('instance_name', instanceName)
                            .eq('tipo', 'mensagem_cliente')
                            .order('id', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        // In burst mode, only the call that was invoked with the latest inbound id is allowed to send.
                        // This prevents older runs (even if they adopted latest) from winning and sending before the final quiet-window call.
                        const raceInteractionId = burstMode ? (inputInteractionId ?? interactionId) : interactionId;

                        if (latestClientAtSend?.id && String(latestClientAtSend.id) !== String(raceInteractionId)) {
                            decision = 'lost_latest_race';
                            console.warn(`[${runId}] Skipped (Final Check): interaction ${raceInteractionId} lost race to latest ${latestClientAtSend.id}.`);
                            return respondNoSend({ skipped: "lost_latest_race", runId }, 'lost_latest_race');
                        }

                        if (burstMode && latestClientAtSend?.id) {
                            const burstKey = `${instanceName}:${resolvedRemoteJid}:${latestClientAtSend.id}`;
                            try {
                                await supabase.from('ai_action_logs').insert({
                                    lead_id: Number(leadId),
                                    action_type: 'burst_winner_claim',
                                    details: JSON.stringify({
                                        key: burstKey,
                                        runId,
                                        interactionId: latestClientAtSend.id
                                    }),
                                    success: true
                                });

                                const { data: winnerClaim } = await supabase
                                    .from('ai_action_logs')
                                    .select('id, details')
                                    .eq('lead_id', Number(leadId))
                                    .eq('action_type', 'burst_winner_claim')
                                    .filter('details', 'ilike', `%"key":"${burstKey}"%`)
                                    .order('id', { ascending: true })
                                    .limit(1)
                                    .maybeSingle();

                                if (winnerClaim?.details) {
                                    let winnerRunId: string | null = null;
                                    try {
                                        winnerRunId = JSON.parse(winnerClaim.details)?.runId || null;
                                    } catch (_) {
                                        winnerRunId = null;
                                    }

                                    if (winnerRunId && winnerRunId !== runId) {
                                        decision = 'lost_burst_winner';
                                        console.warn(`[${runId}] Skipped (Burst Winner): winner is ${winnerRunId}.`);
                                        return respondNoSend({ skipped: "lost_burst_winner", runId }, 'lost_burst_winner');
                                    }
                                }
                            } catch (winnerErr) {
                                console.warn(`[${runId}] burst_winner_claim failed (non-blocking):`, winnerErr);
                            }
                        }

                        const { data: finalCheck, error: finalError } = await supabase
                            .from('interacoes')
                            .select('id, created_at, tipo, wa_from_me')
                            .eq('instance_name', instanceName)
                            .eq('remote_jid', resolvedRemoteJid)
                            .in('tipo', ['mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor'])
                            .order('id', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (!finalError && finalCheck) {
                            const lastTime2 = new Date(finalCheck.created_at).getTime();
                            const nowTime2 = Date.now();

                            // Already replied after anchor → abort
                            if (anchorMsgCreatedAt && lastTime2 > anchorMsgCreatedAt) {
                                decision = 'already_replied_final';
                                console.warn(`🛑 [${runId}] Skipped (Final Check): Already replied after anchor.`);
                                return respondNoSend({ skipped: "already_replied_final", runId }, 'already_replied_final');
                            }

                            // Tight loop guard check
                            if ((nowTime2 - lastTime2) < 5000) {
                                // ... existing guard ...
                            }
                        } // end of spam check 2
                    } catch (err) {
                        console.error(`⚠️ [${runId}] Anti-Spam Check #2 failed (non-blocking):`, err);
                    }
                }

                const evoUrl = Deno.env.get('EVOLUTION_API_URL');
                const evoKey = Deno.env.get('EVOLUTION_API_KEY');
                const numberToSend = resolvedRemoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');

                if (isSimulatedTransport) {
                    evolutionSendStatus = 202;
                    const { data: ins, error: insErr } = await supabase.from('interacoes').insert({
                        lead_id: leadId,
                        user_id: lead.user_id,
                        mensagem: outboundText,
                        tipo: 'mensagem_vendedor',
                        instance_name: instanceName,
                        phone_e164: numberToSend,
                        remote_jid: resolvedRemoteJid,
                        wa_from_me: true
                    }).select('id').single();

                    if (insErr) console.error('DB Insert Error (Smoke):', insErr);
                    else {
                        console.log(`Outbound inserted id (Smoke): ${ins?.id} (Instance: ${instanceName})`);
                        didSendOutbound = true; // Tarefa 1: mark reply as sent (simulated)
                        try {
                            await supabase.from('ai_action_logs').insert({
                                lead_id: Number(leadId),
                                action_type: 'simulated_outbound',
                                details: JSON.stringify({
                                    runId,
                                    interactionId: anchorInteractionId || null,
                                    source: sourceTag || null,
                                    reason: transportSimReason,
                                    remote_jid: resolvedRemoteJid,
                                    message_id: ins?.id || null,
                                    message_preview: outboundText.substring(0, 120)
                                }),
                                success: true
                            });
                        } catch (simLogErr) {
                            console.warn(`[${runId}] simulated_outbound log failed (non-blocking):`, simLogErr);
                        }
                    }
                    continue;
                }

                const nowMinus60sIso = new Date(Date.now() - 60_000).toISOString();
                const { data: recentOutboundRows, error: rateLimitErr } = await supabase
                    .from('interacoes')
                    .select('id')
                    .eq('lead_id', leadId)
                    .eq('wa_from_me', true)
                    .eq('tipo', 'mensagem_vendedor')
                    .gte('created_at', nowMinus60sIso);

                if (rateLimitErr) {
                    console.warn(`[${runId}] Rate-limit check failed (fail-open):`, rateLimitErr?.message || rateLimitErr);
                } else {
                    let recentCount = (recentOutboundRows || []).length;
                    if (recentCount > 0) {
                        const recentOutboundIds = new Set<number>();
                        for (const row of (recentOutboundRows || [])) {
                            const rowId = Number((row as any)?.id);
                            if (Number.isFinite(rowId)) recentOutboundIds.add(rowId);
                        }

                        try {
                            const { data: simulatedLogs, error: simulatedLogsErr } = await supabase
                                .from('ai_action_logs')
                                .select('details')
                                .eq('lead_id', Number(leadId))
                                .eq('action_type', 'simulated_outbound')
                                .gte('created_at', nowMinus60sIso);

                            if (simulatedLogsErr) {
                                console.warn(`[${runId}] Rate-limit simulated_outbound lookup failed (non-blocking):`, simulatedLogsErr?.message || simulatedLogsErr);
                            } else if (simulatedLogs?.length) {
                                const simulatedIds = new Set<number>();
                                for (const logRow of simulatedLogs) {
                                    try {
                                        const details = typeof (logRow as any)?.details === 'string'
                                            ? JSON.parse((logRow as any).details)
                                            : (logRow as any)?.details;
                                        const msgId = Number(details?.message_id);
                                        if (Number.isFinite(msgId) && recentOutboundIds.has(msgId)) {
                                            simulatedIds.add(msgId);
                                        }
                                    } catch (_) {
                                        // Ignore malformed details rows
                                    }
                                }

                                if (simulatedIds.size > 0) {
                                    recentCount = Math.max(0, recentCount - simulatedIds.size);
                                }
                            }
                        } catch (simLookupErr) {
                            console.warn(`[${runId}] Rate-limit simulated_outbound parse failed (non-blocking):`, simLookupErr);
                        }
                    }

                    if (recentCount >= maxOutboundPerLeadPerMin) {
                        decision = 'rate_limited';
                        await logRateLimitedOutbound(recentCount, anchorInteractionId || null);
                        return respondNoSend({ aborted: 'rate_limited', runId }, 'rate_limited', 'blocked');
                    }
                }

                if (evoUrl && evoKey) {

                    console.log(`📤 Sending Part ${i + 1}/${parts.length} to Evolution: ${instanceName} -> ${numberToSend}`);

                    const sendResp = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
                        method: 'POST',
                        headers: { 'apikey': evoKey, 'Content-Type': 'application/json; charset=utf-8' },
                        body: JSON.stringify({
                            number: numberToSend,
                            text: outboundText,
                            textMessage: { text: outboundText }
                        })
                    });

                    evolutionSendStatus = sendResp.status;
                    console.log(`📨 Evolution Send Status: ${sendResp.status}`);

                    if (sendResp.ok) {
                        // C. LOG OUTBOUND (Strictly for this instance)
                        const { data: ins, error: insErr } = await supabase.from('interacoes').insert({
                            lead_id: leadId,
                            user_id: lead.user_id,
                            mensagem: outboundText,
                            tipo: 'mensagem_vendedor',
                            instance_name: instanceName, // STRICT
                            phone_e164: numberToSend,
                            remote_jid: resolvedRemoteJid,
                            wa_from_me: true
                        }).select('id').single();

                        if (insErr) console.error('❌ DB Insert Error:', insErr);
                        else {
                            console.log(`💾 Outbound inserted id: ${ins?.id} (Instance: ${instanceName})`);
                            didSendOutbound = true; // Tarefa 1: mark reply as sent (live)
                        }

                    } else {
                        const errText = await sendResp.text();
                        console.error(`❌ Send Failed: ${sendResp.status} - ${errText}`);
                    }
                }

                // Delay between parts
                if (i < parts.length - 1) {
                    const splitDelay = Math.floor(Math.random() * 400 + 800); // 800-1200ms
                    console.log(`⏳ Split Delay: ${splitDelay}ms`);
                    await new Promise(r => setTimeout(r, splitDelay));
                }
            }
        }

        // 9. STAGE TRANSITION (Increment 3.1: Implicit move if target provided)
        if (aiRes.target_stage) {
            const target = normalizeStage(aiRes.target_stage);

            // --- V9 GATING LOGIC ---
            let gateCheck = true;
            if (target === 'chamada_agendada') {
                // Gated: only move if appointment was written OR duplicate
                if (appointmentWritten || appointmentSkippedReason === 'skipped_duplicate') {
                    gateCheck = true;
                } else {
                    gateCheck = false;
                    console.warn(`🛑 [${runId}] Gate Block: 'chamada_agendada' requires successful appointment. Written=${appointmentWritten}, Skipped=${appointmentSkippedReason}`);
                }
            }

            // Verify transition (allow if valid, irrespective of action='move_stage' or 'send_message')
            if (gateCheck && target !== currentStage && isValidTransition(currentStage, target)) {

                // INCREMENT 10: Safe Update (Tarefa 3: check return value)
                const stageResult = await updateLeadStageSafe(supabase, leadId, target, runId);
                if (stageResult.success) {
                    console.log(`🚚 [${runId}] Moved stage: ${currentStage} -> ${target}`);
                    stageMoveResult = `${currentStage}_to_${target}`; // Tarefa 2
                } else {
                    console.error(`❌ [${runId}] Stage update FAILED: ${stageResult.error}`);
                    stageMoveResult = `error:${currentStage}_to_${target}:${stageResult.error}`; // Tarefa 2
                }

            } else if (target !== currentStage) {
                console.warn(`⚠️ [${runId}] Invalid transition blocked (or Gated): ${currentStage} -> ${target}`);
                stageMoveResult = `blocked:${currentStage}_to_${target}`; // Tarefa 2
            }
        }

        // --- TAREFA 1: DETERMINISTIC FALLBACK — novo_lead → respondeu ---
        // Guarantees the stage move even when the LLM omits target_stage from its JSON response.
        // Only fires if: (a) LLM did NOT provide target_stage, (b) current stage is novo_lead,
        // (c) the agent actually sent an outbound reply this run (didSendOutbound=true).
        // Does NOT fire for aborted/yielded runs (those return via respondNoSend before reaching here).
        if (!aiRes.target_stage && currentStage === 'novo_lead' && didSendOutbound) {
            console.log(`🔧 [${runId}] Deterministic fallback: novo_lead → respondeu (LLM omitted target_stage, didSendOutbound=true)`);
            const fallbackResult = await updateLeadStageSafe(supabase, leadId, 'respondeu', runId);
            if (fallbackResult.success) {
                stageMoveResult = 'novo_lead_to_respondeu_deterministic'; // Tarefa 2
                (aiRes as any)._deterministic_stage_move = 'novo_lead_to_respondeu';
            } else {
                console.error(`❌ [${runId}] Deterministic fallback stage update FAILED: ${fallbackResult.error}`);
                stageMoveResult = `error:novo_lead_to_respondeu_deterministic:${fallbackResult.error}`; // Tarefa 2
            }
        }

        if (transportMode !== 'live') {
            aiRes._transport_mode = transportMode;
            aiRes._transport_reason = transportSimReason;
        }

        // 10. STRUCTURED LOG
        const structuredLog = {
            event: 'ai_agent_run_complete',
            runId,
            anchorInteractionId,
            anchorCreatedAt,
            lastOutboundCreatedAt,
            lastInboundAgeMs,
            aggregatedBurstCount,
            aggregatedChars,
            decision,
            stageFallbackUsed,
            kb_hits_count: kbHitsCount,
            kb_chars: kbChars,
            kb_error: kbError,
            kb_org_id_used: kbOrgId,
            kb_org_id_source: kbOrgIdSource,
            web_used: webUsed,
            web_results_count: webResultsCount,
            web_error: webError,
            evolutionSendStatus,
            transport_mode: transportMode,
            transport_sim_reason: transportSimReason,
            solar_gate_intent: gate?.intent || null,
            solar_gate_missing: gate?.missing?.join(',') || null,
            solar_gate_applied: gateApplied || false,
            // Stage move observability (Tarefa 2)
            stage_move_result: stageMoveResult,
            stage_current: currentStage,
            stage_target_from_llm: (aiRes as any)?.target_stage || null,
            did_send_outbound: didSendOutbound,
            // V6
            v6_fields_candidate_count: v6FieldsCandidateCount,
            v6_fields_written_count: v6FieldsWrittenCount,
            // V7
            v7_comment_written: v7CommentWritten,
            v7_comment_skipped_reason: v7CommentSkippedReason,
            v7_followup_written: v7FollowupWritten,
            v7_followup_skipped_reason: v7FollowupSkippedReason,
            // V11 stage_data JSONB
            v11_stage_data_candidate_count: v11StageDataCandidateCount,
            v11_stage_data_written_count: v11StageDataWrittenCount,
            v11_stage_data_namespace: v11StageDataNamespace,
            v11_stage_data_skipped_reason: v11StageDataSkippedReason,
            // V9
            v9_appointment_written: appointmentWritten,
            v9_appointment_skipped_reason: appointmentSkippedReason,
            v9_appointment_error: appointmentError,
            // V10
            v10_proposal_written: proposalWritten,
            v10_proposal_skipped_reason: proposalSkippedReason,
        };
        console.log(`📊 [${runId}] STRUCTURED_LOG: ${JSON.stringify(structuredLog)}`);

        // 11. LOG RUN (Include instance info + input_snapshot)
        try {
            await supabase.from('ai_agent_runs').insert({
                org_id: leadOrgId,
                lead_id: leadId,
                trigger_type: payload?.triggerType || 'incoming_message',
                status: 'success',
                llm_output: aiRes,
                actions_executed: [aiRes.action, `instance:${instanceName}`, ...(v6FieldsWrittenCount > 0 ? ['update_lead_fields'] : []), ...(v11StageDataWrittenCount > 0 ? ['update_lead_stage_data'] : []), ...(v7CommentWritten ? ['add_comment'] : []), ...(v7FollowupWritten ? ['create_followup'] : []), ...(appointmentWritten ? ['create_appointment'] : []), ...(proposalWritten ? ['create_proposal_draft'] : []), ...(stageMoveResult ? [`stage_move:${stageMoveResult}`] : [])], // Tarefa 6
                input_snapshot: {
                    runId,
                    anchorInteractionId,
                    decision,
                    lastInboundAgeMs,
                    aggregatedBurstCount,
                    aggregatedChars,
                    stageFallbackUsed,
                    kb_hits_count: kbHitsCount,
                    kb_chars: kbChars,
                    web_used: webUsed,
                    web_results_count: webResultsCount,
                    v6_fields_candidate_count: v6FieldsCandidateCount,
                    v6_fields_written_count: v6FieldsWrittenCount,
                    v11_stage_data_candidate_count: v11StageDataCandidateCount,
                    v11_stage_data_written_count: v11StageDataWrittenCount,
                    v11_stage_data_namespace: v11StageDataNamespace,
                }
            });
        } catch (logErr) {
            console.warn(`⚠️ [${runId}] ai_agent_runs insert failed (non-blocking):`, logErr);
        }

        return new Response(JSON.stringify(aiRes), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error("Agent Error:", error);
        try {
            if (leadId) {
                await supabase.from('ai_action_logs').insert({
                    org_id: leadOrgId || null,
                    lead_id: Number(leadId) || null,
                    action_type: 'agent_unhandled_exception',
                    details: JSON.stringify({
                        runId: runId || null,
                        error: error?.message || String(error),
                        stack: (error?.stack || '').substring(0, 500)
                    }),
                    success: false
                });
            }
        } catch (_logErr) { /* non-blocking */ }
        return new Response(
            JSON.stringify({
                error: error.message,
                _transport_mode: 'blocked',
                _transport_reason: 'exception'
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});

// --- V9: CREATE APPOINTMENT executor ---
async function executeCreateAppointment(
    supabase: any,
    leadId: string | number,
    appointment: any,
    runId: string,
    anchorCreatedAt: string | null,
    anchorInteractionId: string | number | null,
    orgId: string,
    userId: string
): Promise<{ written: boolean; skippedReason: string | null; appointmentId: string | null }> {
    // Validate start_at
    if (!appointment?.start_at) {
        console.warn(`⚠️ [${runId}] V9: Appointment skipped (missing start_at)`);
        return { written: false, skippedReason: 'missing_start_at', appointmentId: null };
    }

    let startAt: string;
    let endAt: string;
    try {
        const s = new Date(appointment.start_at);
        if (isNaN(s.getTime())) throw new Error("Invalid start_at");
        startAt = s.toISOString();

        if (appointment.end_at) {
            const e = new Date(appointment.end_at);
            if (!isNaN(e.getTime()) && e > s) {
                endAt = e.toISOString();
            } else {
                // Default 30 min
                endAt = new Date(s.getTime() + 30 * 60000).toISOString();
            }
        } else {
            endAt = new Date(s.getTime() + 30 * 60000).toISOString();
        }
    } catch (dErr) {
        console.warn(`⚠️ [${runId}] V9: Appointment skipped (invalid dates):`, dErr);
        return { written: false, skippedReason: 'invalid_dates', appointmentId: null };
    }

    const title = (appointment.title || 'Agendamento').trim().substring(0, 200);
    // Map to Portuguese types for safety (DB constraint might be strict)
    let type = 'chamada';
    const rawType = (appointment.type || '').toLowerCase();
    if (rawType.includes('visit') || rawType.includes('visita')) type = 'visita';
    else if (rawType.includes('meet') || rawType.includes('reunia')) type = 'reuniao';
    else if (rawType.includes('instal')) type = 'instalacao';

    const notes = (appointment.notes || '').trim().substring(0, 1000) || null;
    const location = (appointment.location || '').trim().substring(0, 500) || null;

    // Dedup check (Strict interactionId)
    // We store interactionId in ai_action_logs.details->>'interactionId'
    // User requested "match exato em details->>'interactionId'".
    const interactionIdStr = String(anchorInteractionId || '');

    if (interactionIdStr) {
        try {
            // Using .filter with arrow operator for strict JSON value matching
            const { data: existing } = await supabase
                .from('ai_action_logs')
                .select('id')
                .eq('lead_id', leadId)
                .eq('action_type', 'appointment_created')
                .filter('details->>interactionId', 'eq', interactionIdStr)
                .limit(1)
                .maybeSingle();

            if (existing) {
                console.log(`⏭️ [${runId}] V9: Appointment skipped (duplicate for interaction ${interactionIdStr})`);
                return { written: false, skippedReason: 'skipped_duplicate', appointmentId: null };
            }
        } catch (dedupErr: any) {
            console.warn(`⚠️ [${runId}] V9: Dedup check failed:`, dedupErr?.message);
        }
    }

    try {
        // Insert Appointment
        // lead_id is int8, make sure to cast
        // User migration show NO org_id in V9? 
        // Migration 20260128_calendar_module.sql (referenced in Step 14):
        // CREATE TABLE IF NOT EXISTS public.appointments ( ... user_id uuid NOT NULL ... ) -- NO org_id present!
        // Make sure to pass user_id, but NOT org_id if column missing.
        // Actually, user_id is required. 

        const insertPayload: any = {
            user_id: userId,
            lead_id: Number(leadId),
            title,
            type,
            status: 'scheduled',
            start_at: startAt,
            end_at: endAt,
            notes,
            location
        };

        const { data: inserted, error: insertErr } = await supabase.from('appointments').insert(insertPayload).select('id').single();

        if (insertErr) {
            console.error(`❌ [${runId}] V9: appointments insert error:`, insertErr.message);
            return { written: false, skippedReason: `db_error: ${insertErr.message}`, appointmentId: null };
        }

        const appointmentId = inserted?.id || null;

        // Audit Log
        await supabase.from('ai_action_logs').insert({
            lead_id: Number(leadId),
            action_type: 'appointment_created',
            details: JSON.stringify({
                interactionId: interactionIdStr, // Strict field for dedup
                runId,
                appointment_id: appointmentId,
                title,
                start_at: startAt,
                end_at: endAt,
                type
            }),
            success: true
        });

        console.log(`📅 [${runId}] V9: Appointment created (id=${appointmentId}, start=${startAt})`);
        return { written: true, skippedReason: null, appointmentId };

    } catch (err: any) {
        console.error(`❌ [${runId}] V9: executeCreateAppointment error:`, err?.message || err);
        return { written: false, skippedReason: `exception: ${err?.message}`, appointmentId: null };
    }
}

function mapCustomerTypeToSegment(customerType: string | null | undefined): 'residencial' | 'empresarial' | 'agronegocio' | 'usina' | 'indefinido' {
    const normalized = String(customerType || '').toLowerCase().trim();
    if (normalized === 'residencial') return 'residencial';
    if (normalized === 'comercial' || normalized === 'industrial') return 'empresarial';
    if (normalized === 'rural') return 'agronegocio';
    if (normalized === 'usina') return 'usina';
    return 'indefinido';
}

// --- V10: CREATE PROPOSAL DRAFT executor ---
async function executeCreateProposalDraft(
    supabase: any,
    leadId: string | number,
    proposal: any,
    runId: string,
    anchorInteractionId: string | number | null,
    userId: string,
    orgId: string
): Promise<{ written: boolean; skippedReason: string | null; proposalId: string | null }> {
    // Basic validation
    if (!proposal || typeof proposal !== 'object') {
        return { written: false, skippedReason: 'invalid_proposal_object', proposalId: null };
    }

    const valorProjeto = normalizeMoneyBRL(proposal.valor_projeto?.value);
    const consumoKwh = normalizeKwh(proposal.consumo_kwh?.value);

    // Safety: Don't save if crucial values are missing/zero
    if (!valorProjeto || !consumoKwh) {
        console.warn(`⚠️ [${runId}] V10: Draft skipped (missing valor/consumo). val=${valorProjeto}, cons=${consumoKwh}`);
        return { written: false, skippedReason: 'missing_critical_values', proposalId: null };
    }

    // Confidence Check: Never save low confidence
    if (proposal.valor_projeto?.confidence === 'low' || proposal.consumo_kwh?.confidence === 'low') {
        return { written: false, skippedReason: 'low_confidence', proposalId: null };
    }

    // Check for EXISTING proposal
    const { data: existing } = await supabase
        .from('propostas')
        .select('id, status, valor_projeto')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    // OVERWRITE PROTECTION
    if (existing) {
        if (existing.status !== 'Rascunho') {
            // Protected status -> DO NOT OVERWRITE
            // Fallback: Create a comment with the proposed values
            const parts = [`Valor R$${valorProjeto}`, `Consumo ${consumoKwh} kWh`];
            if (proposal.potencia_kw?.value) parts.push(`Potência ${proposal.potencia_kw.value} kW`);
            if (proposal.paineis_qtd?.value) parts.push(`Painéis ${proposal.paineis_qtd.value}`);
            if (proposal.economia_mensal?.value) parts.push(`Economia R$${proposal.economia_mensal.value}/mês`);
            if (proposal.payback_anos?.value) parts.push(`Payback ${proposal.payback_anos.value} anos`);
            let fallbackComment = `[Proposta Bloqueada] Proposta existente (${existing.status}) preservada. Valores sugeridos: ${parts.join(', ')}.`;
            if (proposal.assumptions && typeof proposal.assumptions === 'string') {
                fallbackComment += ` Premissas: ${proposal.assumptions}`;
            }
            fallbackComment = fallbackComment.substring(0, 1200);
            await executeAddComment(supabase, leadId, fallbackComment, 'proposal_blocked', 'IA (Sistema)', runId, null, anchorInteractionId);
            console.log(`🛡️ [${runId}] V10: Draft overwrite blocked (Status=${existing.status}). Saved as comment.`);
            return { written: false, skippedReason: 'overwrite_blocked_status', proposalId: existing.id };
        }

        // If status IS 'Rascunho', we can update logic? 
        // User rule: "atualizar somente se confidence high/user/confirmed"
        const isHighConf = (proposal.valor_projeto?.confidence === 'high' && proposal.consumo_kwh?.confidence === 'high');
        const isUserSource = (proposal.valor_projeto?.source === 'user' || proposal.valor_projeto?.source === 'confirmed');

        if (!isHighConf && !isUserSource) {
            console.log(`🛡️ [${runId}] V10: Rascunho update skipped (confidence/source check failed)`);
            return { written: false, skippedReason: 'update_confidence_low', proposalId: existing.id };
        }
    }

    // Prepare payload
    const payload = {
        lead_id: Number(leadId),
        user_id: userId,
        valor_projeto: valorProjeto,
        consumo_kwh: consumoKwh,
        potencia_kw: Number(proposal.potencia_kw?.value || 0),
        paineis_qtd: Number(proposal.paineis_qtd?.value || 0),
        economia_mensal: Number(proposal.economia_mensal?.value || 0),
        payback_anos: Number(proposal.payback_anos?.value || 0),
        status: 'Rascunho'
    };



    try {
        let proposalId = null;
        if (existing) {
            // Update
            const { error: updErr } = await supabase.from('propostas').update(payload).eq('id', existing.id);
            if (updErr) throw updErr;
            proposalId = existing.id;
        } else {
            // Insert
            const { data: ins, error: insErr } = await supabase.from('propostas').insert(payload).select('id').single();
            if (insErr) throw insErr;
            proposalId = ins.id;
        }

        // Premium/versioned proposal snapshot (non-blocking)
        try {
            const segment = mapCustomerTypeToSegment(proposal.customer_type?.value);
            const versionStatus = existing && existing.status === 'Rascunho' ? 'draft' : 'ready';
            const premiumPayload = {
                persuasion_pillars: ['custo', 'economia', 'confianca'],
                objective: 'gerar_rascunho_ia_com_contexto',
                cta: 'confirmar_dados_para_apresentacao',
                assumptions: typeof proposal.assumptions === 'string' ? proposal.assumptions : null,
            };

            const contextSnapshot = {
                generated_at: new Date().toISOString(),
                source: 'ai',
                segment,
                lead_id: Number(leadId),
                proposal_values: {
                    valor_projeto: valorProjeto,
                    consumo_kwh: consumoKwh,
                    potencia_kw: Number(proposal.potencia_kw?.value || 0),
                    paineis_qtd: Number(proposal.paineis_qtd?.value || 0),
                    economia_mensal: Number(proposal.economia_mensal?.value || 0),
                    payback_anos: Number(proposal.payback_anos?.value || 0),
                },
            };

            let nextVersionNo = 1;
            try {
                const { data: lastVersion } = await supabase
                    .from('proposal_versions')
                    .select('version_no')
                    .eq('proposta_id', proposalId)
                    .order('version_no', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (lastVersion?.version_no && Number(lastVersion.version_no) > 0) {
                    nextVersionNo = Number(lastVersion.version_no) + 1;
                }
            } catch (versionLookupErr) {
                console.warn(`[${runId}] V10: version lookup failed (non-blocking):`, versionLookupErr);
            }

            const { data: version, error: versionErr } = await supabase
                .from('proposal_versions')
                .insert({
                    proposta_id: proposalId,
                    lead_id: Number(leadId),
                    user_id: userId,
                    org_id: orgId,
                    version_no: nextVersionNo,
                    status: versionStatus,
                    segment,
                    source: 'ai',
                    premium_payload: premiumPayload,
                    context_snapshot: contextSnapshot,
                })
                .select('id')
                .single();

            if (versionErr) {
                console.warn(`[${runId}] V10: proposal_versions insert failed (non-blocking):`, versionErr);
            } else if (version?.id) {
                const { error: deliveryErr } = await supabase.from('proposal_delivery_events').insert({
                    proposal_version_id: version.id,
                    proposta_id: proposalId,
                    lead_id: Number(leadId),
                    user_id: userId,
                    channel: 'crm',
                    event_type: 'generated',
                    metadata: {
                        generated_by: 'ai',
                        proposal_status: payload.status
                    },
                });
                if (deliveryErr) {
                    console.warn(`[${runId}] V10: proposal_delivery_events insert failed (non-blocking):`, deliveryErr);
                }
            }
        } catch (premiumErr) {
            console.warn(`[${runId}] V10: premium proposal snapshot skipped (non-blocking):`, premiumErr);
        }

        // Handle Assumptions (save as comment)
        if (proposal.assumptions && typeof proposal.assumptions === 'string') {
            await executeAddComment(supabase, leadId, `[Premissas da Proposta] ${proposal.assumptions}`, 'note', 'IA', runId, null, anchorInteractionId);
        }

        // Audit Log
        await supabase.from('ai_action_logs').insert({
            lead_id: Number(leadId),
            action_type: 'proposal_draft_created',
            details: JSON.stringify({
                runId,
                proposal_id: proposalId,
                values: payload,
                operation: existing ? 'update' : 'insert'
            }),
            success: true
        });

        console.log(`📄 [${runId}] V10: Proposal Draft ${existing ? 'updated' : 'created'} (id=${proposalId}, val=${valorProjeto})`);
        return { written: true, skippedReason: null, proposalId };

    } catch (err: any) {
        console.error(`❌ [${runId}] V10: executeCreateProposalDraft error:`, err?.message || err);
        return { written: false, skippedReason: `exception: ${err?.message}`, proposalId: null };
    }
}
