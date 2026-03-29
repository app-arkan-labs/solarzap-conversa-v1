import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  generateAvailableSlotsForType,
  isSlotWithinWindow,
  normalizeAppointmentTypeForWindow,
  normalizeAppointmentWindowConfig,
  overlapsBusyRange,
} from '../_shared/appointmentScheduling.ts';
import { resolveRequestCors } from '../_shared/cors.ts';
import {
  buildTrackingSnapshot,
  resolveOrgPrimaryUserId,
  syncInternalCrmTrackingBridge,
  syncTrackingBridgeFromDeal,
} from '../_shared/internalCrmTrackingBridge.ts';
import { validateServiceInvocationAuth } from '../_shared/invocationAuth.ts';
import { getStripeClient, resolveAppUrl } from '../_shared/stripe.ts';

type SystemRole = 'super_admin' | 'ops' | 'support' | 'billing' | 'read_only';
type CrmRole = 'none' | 'owner' | 'sales' | 'cs' | 'finance' | 'ops' | 'read_only';

type AdminIdentity = {
  user_id: string;
  system_role: SystemRole;
  crm_role: CrmRole;
};

type ActionPermission = {
  minCrmRole: Exclude<CrmRole, 'none'>;
  requireMfa: boolean;
  financeOnly?: boolean;
};

const SYSTEM_ROLE_LEVEL: Record<SystemRole, number> = {
  super_admin: 50,
  ops: 40,
  support: 30,
  billing: 20,
  read_only: 10,
};

const CRM_ROLE_LEVEL: Record<CrmRole, number> = {
  none: 0,
  read_only: 10,
  finance: 20,
  cs: 30,
  sales: 40,
  ops: 45,
  owner: 50,
};

const ACTION_PERMISSIONS: Record<string, ActionPermission> = {
  crm_whoami: { minCrmRole: 'read_only', requireMfa: true },
  list_products: { minCrmRole: 'read_only', requireMfa: true },
  list_pipeline_stages: { minCrmRole: 'read_only', requireMfa: true },
  list_dashboard_kpis: { minCrmRole: 'read_only', requireMfa: true },
  list_clients: { minCrmRole: 'read_only', requireMfa: true },
  get_client_detail: { minCrmRole: 'read_only', requireMfa: true },
  upsert_client: { minCrmRole: 'sales', requireMfa: true },
  list_deals: { minCrmRole: 'read_only', requireMfa: true },
  upsert_deal: { minCrmRole: 'sales', requireMfa: true },
  move_deal_stage: { minCrmRole: 'sales', requireMfa: true },
  create_deal_checkout_link: { minCrmRole: 'sales', requireMfa: true },
  list_tasks: { minCrmRole: 'read_only', requireMfa: true },
  upsert_task: { minCrmRole: 'sales', requireMfa: true },
  list_automation_rules: { minCrmRole: 'read_only', requireMfa: true },
  upsert_automation_rule: { minCrmRole: 'ops', requireMfa: true },
  list_automation_runs: { minCrmRole: 'read_only', requireMfa: true },
  test_automation_rule: { minCrmRole: 'ops', requireMfa: true },
  get_automation_settings: { minCrmRole: 'read_only', requireMfa: true },
  upsert_automation_settings: { minCrmRole: 'ops', requireMfa: true },
  update_deal_commercial_state: { minCrmRole: 'sales', requireMfa: true },
  intake_landing_lead: { minCrmRole: 'sales', requireMfa: true },
  list_instances: { minCrmRole: 'read_only', requireMfa: true },
  upsert_instance: { minCrmRole: 'ops', requireMfa: true },
  connect_instance: { minCrmRole: 'ops', requireMfa: true },
  list_conversations: { minCrmRole: 'read_only', requireMfa: true },
  get_conversation_detail: { minCrmRole: 'read_only', requireMfa: true },
  append_message: { minCrmRole: 'cs', requireMfa: true },
  mark_conversation_read: { minCrmRole: 'read_only', requireMfa: true },
  update_conversation_status: { minCrmRole: 'cs', requireMfa: true },
  list_campaigns: { minCrmRole: 'read_only', requireMfa: true },
  upsert_campaign: { minCrmRole: 'sales', requireMfa: true },
  update_campaign_status: { minCrmRole: 'sales', requireMfa: true },
  run_campaign_batch: { minCrmRole: 'sales', requireMfa: true },
  list_ai_settings: { minCrmRole: 'read_only', requireMfa: true },
  upsert_ai_settings: { minCrmRole: 'ops', requireMfa: true },
  enqueue_agent_job: { minCrmRole: 'sales', requireMfa: true },
  run_agent_jobs: { minCrmRole: 'ops', requireMfa: true },
  list_ai_action_logs: { minCrmRole: 'read_only', requireMfa: true },
  list_appointments: { minCrmRole: 'read_only', requireMfa: true },
  upsert_appointment: { minCrmRole: 'sales', requireMfa: true },
  get_google_calendar_status: { minCrmRole: 'read_only', requireMfa: true },
  get_google_calendar_oauth_url: { minCrmRole: 'ops', requireMfa: true },
  disconnect_google_calendar: { minCrmRole: 'ops', requireMfa: true },
  sync_appointment_google_calendar: { minCrmRole: 'sales', requireMfa: true },
  import_google_calendar_events: { minCrmRole: 'sales', requireMfa: true },
  list_finance_summary: { minCrmRole: 'finance', requireMfa: true, financeOnly: true },
  list_orders: { minCrmRole: 'finance', requireMfa: true, financeOnly: true },
  list_customer_snapshot: { minCrmRole: 'finance', requireMfa: true, financeOnly: true },
  refresh_customer_snapshot: { minCrmRole: 'ops', requireMfa: true },
  get_linked_public_org_summary: { minCrmRole: 'read_only', requireMfa: true },
  provision_customer: { minCrmRole: 'ops', requireMfa: true },
};

const INTERNAL_ONLY_ACTIONS = new Set([
  'webhook_inbound',
  'process_agent_jobs',
  'process_automation_runs',
  'lp_public_intake',
  'lp_public_list_slots',
  'lp_public_book_slot',
]);

function json(status: number, body: Record<string, unknown>, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'sim'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'nao'].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  return `${base64}${'='.repeat(padLength)}`;
}

function extractAalFromToken(token: string): string {
  try {
    const segments = token.split('.');
    if (segments.length < 2) return 'aal1';
    const payloadRaw = atob(normalizeBase64Url(segments[1]));
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    return typeof payload.aal === 'string' && payload.aal ? payload.aal : 'aal1';
  } catch {
    return 'aal1';
  }
}

function normalizePhone(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

function normalizeRemoteJid(remoteJid: string | null): string | null {
  if (!remoteJid) return null;
  const digits = normalizePhone(remoteJid.replace(/@(s\.whatsapp\.net|c\.us)$/i, '').replace(/:\d+$/, ''));
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function normalizeSearchToken(value: unknown): string {
  return String(value || '').trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveRequestIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',').map((item) => item.trim()).find(Boolean);
  return first || null;
}

const INTERNAL_CRM_AUTOMATION_SCOPE_KEY = 'default';
const LEGACY_STAGE_CODE_MAP: Record<string, string> = {
  lead_entrante: 'novo_lead',
  contato_iniciado: 'respondeu',
  qualificado: 'respondeu',
  demo_agendada: 'chamada_agendada',
  proposta_enviada: 'negociacao',
  aguardando_pagamento: 'negociacao',
  ganho: 'fechou',
  perdido: 'nao_fechou',
};
const BLUEPRINT_STAGE_DEFAULT_PROBABILITY: Record<string, number> = {
  novo_lead: 5,
  respondeu: 15,
  chamada_agendada: 35,
  chamada_realizada: 55,
  nao_compareceu: 20,
  negociacao: 75,
  fechou: 100,
  nao_fechou: 5,
};
const MENTORSHIP_SESSION_TARGET: Record<string, number> = {
  mentoria_1000_1_encontro: 1,
  mentoria_1500_4_encontros: 4,
  mentoria_2000_premium: 5,
  mentoria_3x1000_pos_software: 3,
  mentoria_4x1200_pos_trial: 4,
};

function formatPtBrDateTime(value: unknown): string {
  const raw = asString(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(parsed);
}

function formatPtBrTime(value: unknown): string {
  const raw = asString(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(parsed);
}

function humanizeToken(value: unknown): string {
  const raw = asString(value);
  if (!raw) return '';
  return raw
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function resolveBlueprintStageCode(value: unknown, fallback = 'novo_lead'): string {
  const raw = asString(value);
  if (!raw) return fallback;
  return LEGACY_STAGE_CODE_MAP[raw] || raw;
}

function resolveDealStatusForStage(stageCode: unknown, fallback = 'open'): 'open' | 'won' | 'lost' {
  const resolvedStageCode = resolveBlueprintStageCode(stageCode, 'novo_lead');
  if (resolvedStageCode === 'fechou') return 'won';
  if (resolvedStageCode === 'nao_fechou') return 'lost';
  if (fallback === 'won' || fallback === 'lost') return 'open';
  return fallback === 'lost' ? 'lost' : fallback === 'won' ? 'won' : 'open';
}

function resolveLifecycleStatusForStage(
  stageCode: unknown,
  dealStatus: unknown,
  fallback = 'lead',
): 'lead' | 'customer_onboarding' | 'active_customer' | 'churn_risk' | 'churned' {
  const resolvedStageCode = resolveBlueprintStageCode(stageCode, 'novo_lead');
  const resolvedDealStatus = resolveDealStatusForStage(resolvedStageCode, asString(dealStatus) || 'open');
  if (resolvedDealStatus === 'won') return 'customer_onboarding';
  if (resolvedStageCode === 'nao_fechou' || resolvedDealStatus === 'lost') return 'lead';
  if (['lead', 'customer_onboarding', 'active_customer', 'churn_risk', 'churned'].includes(fallback)) {
    return fallback as 'lead' | 'customer_onboarding' | 'active_customer' | 'churn_risk' | 'churned';
  }
  return 'lead';
}

function resolveStageProbability(stageCode: unknown, fallback = 0): number {
  const resolvedStageCode = resolveBlueprintStageCode(stageCode, 'novo_lead');
  return BLUEPRINT_STAGE_DEFAULT_PROBABILITY[resolvedStageCode] ?? fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function mergeRecord(base: unknown, patch: unknown): Record<string, unknown> {
  return {
    ...asRecord(base),
    ...asRecord(patch),
  };
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function buildServiceActorIdentity(userId: string | null): AdminIdentity {
  return {
    user_id: userId || '00000000-0000-0000-0000-000000000000',
    system_role: 'ops',
    crm_role: 'ops',
  };
}

function addMinutesIso(input: string, minutes: number): string {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return nowIso();
  return new Date(parsed.getTime() + (minutes * 60_000)).toISOString();
}

function normalizeTemplateValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function buildInternalCrmUrl(clientId?: string | null): string {
  const appUrl = safeAsOrigin(resolveAppUrl(), 'http://localhost:5173');
  const base = appUrl.replace(/\/$/, '');
  if (clientId) return `${base}/admin/crm/clients?client=${clientId}`;
  return `${base}/admin/crm/pipeline`;
}

function renderAutomationTemplate(template: string | null, payload: Record<string, unknown>): string | null {
  const source = asString(template);
  if (!source) return null;
  return source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, rawKey) => {
    const key = String(rawKey || '').trim();
    return normalizeTemplateValue(payload[key]);
  });
}

function conditionMatches(expected: unknown, actual: unknown): boolean {
  if (expected == null) return actual == null;
  if (Array.isArray(expected)) {
    const expectedValues = expected.map((item) => normalizeTemplateValue(item)).filter(Boolean);
    if (Array.isArray(actual)) {
      const actualValues = actual.map((item) => normalizeTemplateValue(item));
      return expectedValues.some((value) => actualValues.includes(value));
    }
    return expectedValues.includes(normalizeTemplateValue(actual));
  }

  if (typeof expected === 'boolean') return asBoolean(actual, !expected) === expected;
  if (typeof expected === 'number') return asNumber(actual, Number.NaN) === expected;

  return normalizeTemplateValue(expected).toLowerCase() === normalizeTemplateValue(actual).toLowerCase();
}

function automationConditionMatches(condition: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(condition)) {
    if (!conditionMatches(expected, payload[key])) return false;
  }
  return true;
}

function resolveAutomationScheduledAt(rule: Record<string, unknown>, payload: Record<string, unknown>): string {
  const metadata = asRecord(rule.metadata);
  const anchor = asString(metadata.schedule_anchor) || 'event_time';

  let baseAt = asString(payload.event_at) || nowIso();
  if (anchor === 'appointment_start' && asString(payload.appointment_start_at)) {
    baseAt = asString(payload.appointment_start_at) || baseAt;
  }
  if (anchor === 'trial_end_at' && asString(payload.trial_ends_at)) {
    baseAt = asString(payload.trial_ends_at) || baseAt;
  }

  const baseDate = new Date(baseAt);
  if (Number.isNaN(baseDate.getTime())) return nowIso();

  const shifted = new Date(baseDate.getTime() + (asNumber(rule.delay_minutes, 0) * 60_000));
  if (shifted.getTime() < Date.now()) return nowIso();
  return shifted.toISOString();
}

function buildAutomationEventKey(eventType: string, payload: Record<string, unknown>): string {
  const explicit = asString(payload.event_key);
  if (explicit) return explicit;

  return [
    eventType,
    asString(payload.client_id),
    asString(payload.deal_id),
    asString(payload.appointment_id),
    asString(payload.conversation_id),
    asString(payload.anchor_key),
    asString(payload.event_at),
  ].filter(Boolean).join(':');
}

function mentorshipTargetFromVariant(variant: unknown): number {
  const normalized = asString(variant);
  if (!normalized) return 0;
  return MENTORSHIP_SESSION_TARGET[normalized] || 0;
}

function getSupabaseEnv() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw new Error('missing_supabase_env');
  }

  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

function getServiceClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

function getAuthClient(userToken: string) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  });
}

async function resolveAuthenticatedUser(userToken: string) {
  const authClient = getAuthClient(userToken);
  const { data, error } = await authClient.auth.getUser(userToken);
  if (error || !data.user) {
    throw { status: 401, code: 'unauthorized' };
  }
  return data.user;
}

async function resolveAdminIdentity(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  action: string,
  aal: string,
): Promise<AdminIdentity> {
  const permission = ACTION_PERMISSIONS[action];
  if (!permission) {
    throw { status: 403, code: 'action_not_allowed' };
  }

  const { data, error } = await serviceClient
    .from('_admin_system_admins')
    .select('system_role, crm_role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw { status: 500, code: 'admin_lookup_failed' };
  }

  if (!data?.system_role) {
    throw { status: 403, code: 'not_system_admin' };
  }

  const systemRole = String(data.system_role) as SystemRole;
  const crmRole = String(data.crm_role || 'none') as CrmRole;

  if (permission.requireMfa && aal !== 'aal2') {
    throw { status: 403, code: 'mfa_required' };
  }

  if (crmRole === 'none') {
    throw { status: 403, code: 'not_crm_member' };
  }

  if (SYSTEM_ROLE_LEVEL[systemRole] < SYSTEM_ROLE_LEVEL.read_only) {
    throw { status: 403, code: 'insufficient_role' };
  }

  if (CRM_ROLE_LEVEL[crmRole] < CRM_ROLE_LEVEL[permission.minCrmRole]) {
    throw { status: 403, code: 'insufficient_role' };
  }

  if (permission.financeOnly && !['owner', 'finance'].includes(crmRole)) {
    throw { status: 403, code: 'insufficient_role' };
  }

  return {
    user_id: userId,
    system_role: systemRole,
    crm_role: crmRole,
  };
}

async function writeAuditLog(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity | null,
  action: string,
  req: Request,
  payload: {
    target_type: string;
    target_id?: string | null;
    client_id?: string | null;
    deal_id?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
) {
  try {
    await serviceClient.schema('internal_crm').from('audit_log').insert({
      actor_user_id: identity?.user_id ?? null,
      actor_system_role: identity?.system_role ?? null,
      actor_crm_role: identity?.crm_role ?? null,
      action,
      target_type: payload.target_type,
      target_id: payload.target_id ?? null,
      client_id: payload.client_id ?? null,
      deal_id: payload.deal_id ?? null,
      before: isRecord(payload.before) || Array.isArray(payload.before) ? payload.before : payload.before ?? null,
      after: isRecord(payload.after) || Array.isArray(payload.after) ? payload.after : payload.after ?? null,
      ip: resolveRequestIp(req),
      user_agent: req.headers.get('user-agent') || null,
      reason: payload.reason ?? null,
    });
  } catch (error) {
    console.warn('[internal-crm-api] writeAuditLog failed', error);
  }
}

function crmSchema(serviceClient: ReturnType<typeof createClient>) {
  return serviceClient.schema('internal_crm');
}

async function listProducts(serviceClient: ReturnType<typeof createClient>) {
  const now = nowIso();
  const schema = crmSchema(serviceClient);
  const [{ data: products, error: productsError }, { data: prices, error: pricesError }] = await Promise.all([
    schema
      .from('products')
      .select('product_code, name, billing_type, payment_method, is_active, sort_order')
      .order('sort_order', { ascending: true }),
    schema
      .from('product_prices')
      .select('product_code, price_cents, currency, stripe_price_id, valid_from, valid_until')
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order('valid_from', { ascending: false }),
  ]);

  if (productsError || pricesError) {
    throw { status: 500, code: 'products_query_failed', error: productsError || pricesError };
  }

  const priceMap = new Map<string, Record<string, unknown>>();
  for (const price of prices || []) {
    const productCode = String(price.product_code || '');
    if (!productCode || priceMap.has(productCode)) continue;
    priceMap.set(productCode, price);
  }

  return (products || []).map((product) => {
    const price = priceMap.get(String(product.product_code || ''));
    return {
      ...product,
      price_cents: asNumber(price?.price_cents, 0),
      currency: asString(price?.currency) || 'BRL',
      stripe_price_id: asString(price?.stripe_price_id),
    };
  });
}

async function listPipelineStages(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await crmSchema(serviceClient)
    .from('pipeline_stages')
    .select('stage_code, name, sort_order, is_terminal, win_probability, color_token')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    throw { status: 500, code: 'pipeline_stages_query_failed', error };
  }

  return data || [];
}

async function listDashboardKpis(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const periodDays = Math.max(1, Math.min(365, asNumber(payload.period_days, 30)));
  const requestedFromDate = asString(payload.from_date);
  const requestedToDate = asString(payload.to_date);

  const fallbackFromDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const fallbackToDate = new Date();

  const parsedFromDate = requestedFromDate ? new Date(requestedFromDate) : fallbackFromDate;
  const parsedToDate = requestedToDate ? new Date(requestedToDate) : fallbackToDate;

  const fromDate = Number.isNaN(parsedFromDate.getTime()) ? fallbackFromDate : parsedFromDate;
  const toDate = Number.isNaN(parsedToDate.getTime()) ? fallbackToDate : parsedToDate;
  toDate.setUTCHours(23, 59, 59, 999);

  const sinceIso = fromDate.toISOString();
  const untilIso = toDate.toISOString();
  const schema = crmSchema(serviceClient);

  const [
    leadsCount,
    qualifiedCount,
    demosCount,
    proposalsCount,
    wonDeals,
    lostDeals,
    wonRevenue,
    activeSubscriptions,
    onboardingPending,
    churnRisk,
    churnedInPeriod,
    stalledDeals,
    nextActions,
  ] = await Promise.all([
    schema.from('clients').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso).lte('created_at', untilIso),
    schema.from('clients').select('id', { count: 'exact', head: true }).eq('current_stage_code', 'respondeu').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('deals').select('id', { count: 'exact', head: true }).eq('stage_code', 'chamada_agendada').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('deals').select('id', { count: 'exact', head: true }).eq('stage_code', 'negociacao').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('deals').select('one_time_total_cents, mrr_cents', { count: 'exact' }).eq('status', 'won').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('deals').select('id', { count: 'exact', head: true }).eq('status', 'lost').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('deals').select('one_time_total_cents, mrr_cents').eq('status', 'won').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('subscriptions').select('mrr_cents').in('status', ['trialing', 'active']),
    schema.from('clients').select('id', { count: 'exact', head: true }).eq('lifecycle_status', 'customer_onboarding'),
    schema.from('clients').select('id', { count: 'exact', head: true }).eq('lifecycle_status', 'churn_risk'),
    schema.from('clients').select('id', { count: 'exact', head: true }).eq('lifecycle_status', 'churned').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('deals').select('id, client_id, title, stage_code, status, probability, expected_close_at, one_time_total_cents, mrr_cents, payment_method, payment_status, checkout_url, stripe_checkout_session_id, paid_at, won_at, notes, lost_reason, created_at, updated_at').eq('status', 'open').lt('updated_at', sinceIso).order('updated_at', { ascending: true }).limit(10),
    schema.from('tasks').select('id, client_id, deal_id, owner_user_id, title, notes, due_at, status, task_kind, completed_at').eq('status', 'open').order('due_at', { ascending: true, nullsFirst: false }).limit(10),
  ]);

  if (
    leadsCount.error ||
    qualifiedCount.error ||
    demosCount.error ||
    proposalsCount.error ||
    wonDeals.error ||
    lostDeals.error ||
    wonRevenue.error ||
    activeSubscriptions.error ||
    onboardingPending.error ||
    churnRisk.error ||
    churnedInPeriod.error ||
    stalledDeals.error ||
    nextActions.error
  ) {
    throw { status: 500, code: 'dashboard_query_failed' };
  }

  const wonCount = Number(wonDeals.count || 0);
  const lostCount = Number(lostDeals.count || 0);
  const wonRows = wonRevenue.data || [];
  const activeSubscriptionsRows = activeSubscriptions.data || [];
  const onboardingQueue = (await listClients(serviceClient, { lifecycle_status: 'customer_onboarding' })).slice(0, 8);
  const pendingPayments = (await listDeals(serviceClient, { status: 'won' }))
    .filter((deal) => String(deal.payment_status || '') === 'pending')
    .slice(0, 8);

  return {
    leads_in_period: Number(leadsCount.count || 0),
    qualified_leads: Number(qualifiedCount.count || 0),
    demos_scheduled: Number(demosCount.count || 0),
    proposals_sent: Number(proposalsCount.count || 0),
    win_rate: wonCount + lostCount > 0 ? Number(((wonCount / (wonCount + lostCount)) * 100).toFixed(1)) : 0,
    revenue_one_time_closed_cents: wonRows.reduce((sum, row) => sum + asNumber(row.one_time_total_cents, 0), 0),
    mrr_sold_cents: wonRows.reduce((sum, row) => sum + asNumber(row.mrr_cents, 0), 0),
    mrr_active_cents: activeSubscriptionsRows.reduce((sum, row) => sum + asNumber(row.mrr_cents, 0), 0),
    onboarding_pending: Number(onboardingPending.count || 0),
    churn_risk_count: Number(churnRisk.count || 0),
    churned_in_period: Number(churnedInPeriod.count || 0),
    stalled_deals: stalledDeals.data || [],
    next_actions: nextActions.data || [],
    onboarding_queue: onboardingQueue,
    pending_payments: pendingPayments,
  };
}

async function listClients(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const schema = crmSchema(serviceClient);
  let query = schema
    .from('clients')
    .select('id, company_name, primary_contact_name, primary_phone, primary_email, source_channel, owner_user_id, current_stage_code, lifecycle_status, last_contact_at, next_action, next_action_at, linked_public_org_id, updated_at')
    .order('updated_at', { ascending: false });

  const search = normalizeSearchToken(payload.search);
  if (search) {
    query = query.or(`company_name.ilike.%${search}%,primary_contact_name.ilike.%${search}%,primary_email.ilike.%${search}%`);
  }

  const stageCode = asString(payload.stage_code);
  if (stageCode) query = query.eq('current_stage_code', stageCode);

  const lifecycleStatus = asString(payload.lifecycle_status);
  if (lifecycleStatus) query = query.eq('lifecycle_status', lifecycleStatus);

  const { data, error } = await query.limit(200);
  if (error) throw { status: 500, code: 'clients_query_failed', error };

  const clients = data || [];
  if (clients.length === 0) return [];

  const clientIds = clients.map((client) => String(client.id));
  const { data: deals, error: dealsError } = await schema
    .from('deals')
    .select('client_id, status, one_time_total_cents, mrr_cents')
    .in('client_id', clientIds);

  if (dealsError) throw { status: 500, code: 'deals_query_failed', error: dealsError };

  const aggregateMap = new Map<string, { open_deal_count: number; total_mrr_cents: number; total_one_time_cents: number }>();
  for (const deal of deals || []) {
    const clientId = String(deal.client_id || '');
    if (!clientId) continue;
    const entry = aggregateMap.get(clientId) || {
      open_deal_count: 0,
      total_mrr_cents: 0,
      total_one_time_cents: 0,
    };
    if (String(deal.status || '') === 'open') entry.open_deal_count += 1;
    entry.total_mrr_cents += asNumber(deal.mrr_cents, 0);
    entry.total_one_time_cents += asNumber(deal.one_time_total_cents, 0);
    aggregateMap.set(clientId, entry);
  }

  return clients.map((client) => ({
    ...client,
    ...aggregateMap.get(String(client.id)),
    open_deal_count: aggregateMap.get(String(client.id))?.open_deal_count || 0,
    total_mrr_cents: aggregateMap.get(String(client.id))?.total_mrr_cents || 0,
    total_one_time_cents: aggregateMap.get(String(client.id))?.total_one_time_cents || 0,
  }));
}

async function getClientDetail(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const clientId = asString(payload.client_id);
  if (!clientId) throw { status: 400, code: 'invalid_payload' };

  const schema = crmSchema(serviceClient);
  const [
    clientResult,
    contactsResult,
    dealsResult,
    tasksResult,
    appointmentsResult,
    appLinkResult,
  ] = await Promise.all([
    schema.from('clients').select('*').eq('id', clientId).maybeSingle(),
    schema.from('client_contacts').select('*').eq('client_id', clientId).order('is_primary', { ascending: false }).order('created_at', { ascending: true }),
    schema.from('deals').select('*').eq('client_id', clientId).order('updated_at', { ascending: false }),
    schema.from('tasks').select('id, client_id, deal_id, owner_user_id, title, notes, due_at, status, task_kind, completed_at').eq('client_id', clientId).order('due_at', { ascending: true, nullsFirst: false }),
    schema.from('appointments').select('*').eq('client_id', clientId).order('start_at', { ascending: false }),
    schema.from('customer_app_links').select('*').eq('client_id', clientId).maybeSingle(),
  ]);

  if (clientResult.error) throw { status: 500, code: 'client_query_failed', error: clientResult.error };
  if (!clientResult.data?.id) throw { status: 404, code: 'not_found' };
  if (contactsResult.error || dealsResult.error || tasksResult.error || appointmentsResult.error || appLinkResult.error) {
    throw { status: 500, code: 'client_detail_query_failed' };
  }

  const { data: dealItems, error: dealItemsError } = await schema
    .from('deal_items')
    .select('*')
    .in('deal_id', (dealsResult.data || []).map((deal) => deal.id).filter(Boolean));

  if (dealItemsError) throw { status: 500, code: 'deal_items_query_failed', error: dealItemsError };

  const itemsByDealId = new Map<string, Record<string, unknown>[]>();
  for (const item of dealItems || []) {
    const dealId = String(item.deal_id || '');
    if (!dealId) continue;
    const items = itemsByDealId.get(dealId) || [];
    items.push(item);
    itemsByDealId.set(dealId, items);
  }

  let linkedPublicOrgSummary = null;
  if (appLinkResult.data?.linked_public_org_id) {
    const { data: rpcData, error: rpcError } = await serviceClient.rpc('crm_bridge_org_summary', {
      p_org_id: appLinkResult.data.linked_public_org_id,
    });
    if (!rpcError) {
      linkedPublicOrgSummary = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    }
  }

  return {
    ok: true,
    client: {
      ...clientResult.data,
      open_deal_count: (dealsResult.data || []).filter((deal) => String(deal.status || '') === 'open').length,
      total_mrr_cents: (dealsResult.data || []).reduce((sum, deal) => sum + asNumber(deal.mrr_cents, 0), 0),
      total_one_time_cents: (dealsResult.data || []).reduce((sum, deal) => sum + asNumber(deal.one_time_total_cents, 0), 0),
    },
    contacts: contactsResult.data || [],
    deals: (dealsResult.data || []).map((deal) => ({
      ...deal,
      items: itemsByDealId.get(String(deal.id)) || [],
    })),
    tasks: tasksResult.data || [],
    appointments: appointmentsResult.data || [],
    app_link: appLinkResult.data || null,
    linked_public_org_summary: linkedPublicOrgSummary,
  };
}

async function upsertClient(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const clientId = asString(payload.client_id);
  const companyName = asString(payload.company_name);
  if (!companyName) throw { status: 400, code: 'invalid_payload' };

  const clientPayload = {
    id: clientId || undefined,
    company_name: companyName,
    primary_contact_name: asString(payload.primary_contact_name),
    primary_phone: normalizePhone(payload.primary_phone) || null,
    primary_email: asString(payload.primary_email),
    source_channel: asString(payload.source_channel),
    owner_user_id: asString(payload.owner_user_id) || identity.user_id,
    current_stage_code: resolveBlueprintStageCode(payload.current_stage_code, 'novo_lead'),
    lifecycle_status: asString(payload.lifecycle_status) || 'lead',
    last_contact_at: asString(payload.last_contact_at),
    next_action: asString(payload.next_action),
    next_action_at: asString(payload.next_action_at),
    notes: asString(payload.notes),
    linked_public_org_id: asString(payload.linked_public_org_id),
    linked_public_user_id: asString(payload.linked_public_user_id),
    metadata: isRecord(payload.metadata) ? payload.metadata : {},
  };

  const before = clientId
    ? (await schema.from('clients').select('*').eq('id', clientId).maybeSingle()).data
    : null;

  const { data, error } = await schema
    .from('clients')
    .upsert(clientPayload)
    .select('*')
    .single();

  if (error || !data?.id) {
    throw { status: 500, code: 'client_upsert_failed', error };
  }

  const contactName = asString(payload.primary_contact_name);
  if (contactName || asString(payload.primary_phone) || asString(payload.primary_email)) {
    const { data: existingPrimaryContact } = await schema
      .from('client_contacts')
      .select('id')
      .eq('client_id', data.id)
      .eq('is_primary', true)
      .maybeSingle();

    await schema.from('client_contacts').upsert({
      id: existingPrimaryContact?.id || undefined,
      client_id: data.id,
      name: contactName || companyName,
      phone: normalizePhone(payload.primary_phone) || null,
      email: asString(payload.primary_email),
      role_label: 'Contato principal',
      is_primary: true,
      notes: asString(payload.notes),
    });
  }

  await writeAuditLog(serviceClient, identity, 'upsert_client', req, {
    target_type: 'client',
    target_id: String(data.id),
    client_id: String(data.id),
    before,
    after: data,
  });

  return { ok: true, client: data };
}

async function listDeals(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const schema = crmSchema(serviceClient);
  let query = schema
    .from('deals')
    .select('*')
    .order('updated_at', { ascending: false });

  const stageCode = asString(payload.stage_code);
  if (stageCode) query = query.eq('stage_code', stageCode);

  const status = asString(payload.status);
  if (status) query = query.eq('status', status);

  const { data, error } = await query.limit(250);
  if (error) throw { status: 500, code: 'deals_query_failed', error };

  const deals = data || [];
  if (deals.length === 0) return [];

  const dealIds = deals.map((deal) => deal.id).filter(Boolean);
  const clientIds = deals.map((deal) => deal.client_id).filter(Boolean);

  const [{ data: items, error: itemsError }, { data: clients, error: clientsError }] = await Promise.all([
    schema.from('deal_items').select('*').in('deal_id', dealIds),
    schema.from('clients').select('id, company_name').in('id', clientIds),
  ]);

  if (itemsError || clientsError) throw { status: 500, code: 'deal_relations_query_failed' };

  const itemsByDealId = new Map<string, Record<string, unknown>[]>();
  for (const item of items || []) {
    const key = String(item.deal_id || '');
    if (!key) continue;
    const rows = itemsByDealId.get(key) || [];
    rows.push(item);
    itemsByDealId.set(key, rows);
  }

  const clientNameById = new Map<string, string>();
  for (const client of clients || []) {
    clientNameById.set(String(client.id), String(client.company_name || ''));
  }

  const search = normalizeSearchToken(payload.search).toLowerCase();
  return deals
    .map((deal) => ({
      ...deal,
      client_company_name: clientNameById.get(String(deal.client_id || '')) || null,
      items: itemsByDealId.get(String(deal.id)) || [],
    }))
    .filter((deal) => {
      if (!search) return true;
      return (
        String(deal.title || '').toLowerCase().includes(search) ||
        String(deal.client_company_name || '').toLowerCase().includes(search)
      );
    });
}

async function upsertDeal(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const dealId = asString(payload.deal_id);
  const clientId = asString(payload.client_id);
  const title = asString(payload.title);
  if (!clientId || !title) throw { status: 400, code: 'invalid_payload' };

  const before = dealId
    ? (await schema.from('deals').select('*').eq('id', dealId).maybeSingle()).data
    : null;

  const dealPayload = {
    id: dealId || undefined,
    client_id: clientId,
    title,
    owner_user_id: asString(payload.owner_user_id) || identity.user_id,
    stage_code: resolveBlueprintStageCode(payload.stage_code, resolveBlueprintStageCode(before?.stage_code, 'novo_lead')),
    status: resolveDealStatusForStage(payload.stage_code || before?.stage_code, asString(payload.status) || before?.status || 'open'),
    probability: Math.max(0, Math.min(100, asNumber(payload.probability, resolveStageProbability(payload.stage_code || before?.stage_code, before?.probability || 0)))),
    expected_close_at: asString(payload.expected_close_at),
    notes: asString(payload.notes),
    lost_reason: asString(payload.lost_reason),
    payment_status: asString(payload.payment_status) || before?.payment_status || 'pending',
    paid_at: asString(payload.paid_at),
    won_at: asString(payload.won_at),
    closed_at: asString(payload.closed_at),
    primary_offer_code: asString(payload.primary_offer_code) || before?.primary_offer_code || null,
    closed_product_code: asString(payload.closed_product_code) || before?.closed_product_code || null,
    mentorship_variant: asString(payload.mentorship_variant) || before?.mentorship_variant || null,
    software_status: asString(payload.software_status) || before?.software_status || 'not_offered',
    landing_page_status: asString(payload.landing_page_status) || before?.landing_page_status || 'not_offered',
    traffic_status: asString(payload.traffic_status) || before?.traffic_status || 'not_offered',
    trial_status: asString(payload.trial_status) || before?.trial_status || 'not_offered',
    next_offer_code: asString(payload.next_offer_code) || before?.next_offer_code || null,
    next_offer_at: asString(payload.next_offer_at) || before?.next_offer_at || null,
    last_automation_key: asString(payload.last_automation_key) || before?.last_automation_key || null,
    commercial_context: Object.prototype.hasOwnProperty.call(payload, 'commercial_context')
      ? mergeRecord(before?.commercial_context, payload.commercial_context)
      : asRecord(before?.commercial_context),
  };

  const { data: dealData, error: dealError } = await schema
    .from('deals')
    .upsert(dealPayload)
    .select('*')
    .single();

  if (dealError || !dealData?.id) {
    throw { status: 500, code: 'deal_upsert_failed', error: dealError };
  }

  const items = Array.isArray(payload.items) ? payload.items.filter((item) => isRecord(item)) : [];
  if (items.length > 0) {
    await schema.from('deal_items').delete().eq('deal_id', dealData.id);
    const normalizedItems = items.map((item) => ({
      deal_id: dealData.id,
      product_code: asString(item.product_code),
      billing_type: asString(item.billing_type) || 'one_time',
      payment_method: asString(item.payment_method) || 'manual',
      stripe_price_id: asString(item.stripe_price_id),
      unit_price_cents: asNumber(item.unit_price_cents, 0),
      quantity: Math.max(1, asNumber(item.quantity, 1)),
      total_price_cents: Math.max(0, asNumber(item.unit_price_cents, 0) * Math.max(1, asNumber(item.quantity, 1))),
      metadata: isRecord(item.metadata) ? item.metadata : {},
    }));
    const { error: itemsInsertError } = await schema.from('deal_items').insert(normalizedItems);
    if (itemsInsertError) throw { status: 500, code: 'deal_items_upsert_failed', error: itemsInsertError };
  }

  if (!before || before.stage_code !== dealData.stage_code) {
    await schema.from('stage_history').insert({
      client_id: clientId,
      deal_id: dealData.id,
      from_stage_code: before?.stage_code ?? null,
      to_stage_code: dealData.stage_code,
      changed_by_user_id: identity.user_id,
      notes: 'deal_stage_sync',
    });
  }

  await schema
    .from('clients')
    .update({
      current_stage_code: dealData.stage_code,
      owner_user_id: dealData.owner_user_id || identity.user_id,
      updated_at: nowIso(),
    })
    .eq('id', clientId);

  if (!before || before.stage_code !== dealData.stage_code) {
    await syncTrackingBridgeFromDeal(serviceClient, {
      internalDealId: String(dealData.id),
      stageCode: asString(dealData.stage_code),
      syncedAt: nowIso(),
    });
  }

  await writeAuditLog(serviceClient, identity, 'upsert_deal', req, {
    target_type: 'deal',
    target_id: String(dealData.id),
    client_id: clientId,
    deal_id: String(dealData.id),
    before,
    after: dealData,
  });

  return { ok: true, deal: dealData };
}

async function moveDealStage(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const dealId = asString(payload.deal_id);
  const stageCode = asString(payload.stage_code);
  if (!dealId || !stageCode) throw { status: 400, code: 'invalid_payload' };

  const { data: before, error: beforeError } = await schema.from('deals').select('*').eq('id', dealId).maybeSingle();
  if (beforeError) throw { status: 500, code: 'deal_query_failed', error: beforeError };
  if (!before?.id) throw { status: 404, code: 'not_found' };
  const data = await applyDealStageChange(schema, {
    deal: before,
    stage_code: stageCode,
    probability: Math.max(0, Math.min(100, asNumber(payload.probability, resolveStageProbability(stageCode, before.probability)))),
    notes: asString(payload.notes),
    changed_by_user_id: identity.user_id,
    closed_product_code: asString(payload.closed_product_code),
    lost_reason: asString(payload.lost_reason),
  });

  await syncTrackingBridgeFromDeal(serviceClient, {
    internalDealId: dealId,
    stageCode: asString(data.stage_code),
    syncedAt: nowIso(),
  });

  if (resolveBlueprintStageCode(stageCode, 'novo_lead') === 'fechou') {
    await queueAutomationEvent(serviceClient, 'deal_closed', {
      client_id: String(before.client_id || ''),
      deal_id: dealId,
      closed_product_code: asString(payload.closed_product_code) || asString(data.closed_product_code),
      event_at: nowIso(),
      event_key: `deal_closed:${dealId}:${nowIso()}`,
    }, { processDueNow: true });
  }

  if (resolveBlueprintStageCode(stageCode, 'novo_lead') === 'nao_fechou') {
    await queueAutomationEvent(serviceClient, 'deal_not_closed', {
      client_id: String(before.client_id || ''),
      deal_id: dealId,
      event_at: nowIso(),
      event_key: `deal_not_closed:${dealId}:${nowIso()}`,
    }, { processDueNow: true });
  }

  await writeAuditLog(serviceClient, identity, 'move_deal_stage', req, {
    target_type: 'deal',
    target_id: dealId,
    client_id: String(before.client_id),
    deal_id: dealId,
    before,
    after: data,
  });

  return { ok: true, deal: data };
}

async function listTasks(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const schema = crmSchema(serviceClient);
  let query = schema
    .from('tasks')
    .select('id, client_id, deal_id, owner_user_id, title, notes, due_at, status, task_kind, completed_at')
    .order('due_at', { ascending: true, nullsFirst: false });

  const status = asString(payload.status);
  if (status) query = query.eq('status', status);
  const clientId = asString(payload.client_id);
  if (clientId) query = query.eq('client_id', clientId);
  const dueScope = asString(payload.due_scope);
  if (dueScope === 'overdue') query = query.lt('due_at', nowIso()).eq('status', 'open');
  if (dueScope === 'today') query = query.lte('due_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

  const { data, error } = await query.limit(200);
  if (error) throw { status: 500, code: 'tasks_query_failed', error };
  return data || [];
}

async function upsertTask(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const taskId = asString(payload.task_id);
  const title = asString(payload.title);
  if (!title) throw { status: 400, code: 'invalid_payload' };

  const before = taskId
    ? (await schema.from('tasks').select('*').eq('id', taskId).maybeSingle()).data
    : null;

  const taskPayload = {
    id: taskId || undefined,
    client_id: asString(payload.client_id),
    deal_id: asString(payload.deal_id),
    owner_user_id: asString(payload.owner_user_id) || identity.user_id,
    title,
    notes: asString(payload.notes),
    due_at: asString(payload.due_at),
    status: asString(payload.status) || 'open',
    task_kind: asString(payload.task_kind) || 'generic',
    completed_at: asString(payload.status) === 'done' ? nowIso() : null,
    completed_by_user_id: asString(payload.status) === 'done' ? identity.user_id : null,
    metadata: isRecord(payload.metadata) ? payload.metadata : {},
  };

  const { data, error } = await schema.from('tasks').upsert(taskPayload).select('*').single();
  if (error || !data?.id) throw { status: 500, code: 'task_upsert_failed', error };

  if (data.client_id && (data.task_kind === 'next_action' || before?.task_kind === 'next_action')) {
    await schema.from('clients').update({
      next_action: data.status === 'open' ? data.title : null,
      next_action_at: data.status === 'open' ? data.due_at : null,
      updated_at: nowIso(),
    }).eq('id', data.client_id);
  }

  await writeAuditLog(serviceClient, identity, 'upsert_task', req, {
    target_type: 'task',
    target_id: String(data.id),
    client_id: asString(data.client_id),
    deal_id: asString(data.deal_id),
    before,
    after: data,
  });

  return { ok: true, task: data };
}

async function applyDealStageChange(
  schema: ReturnType<typeof crmSchema>,
  params: {
    deal: Record<string, unknown>;
    stage_code: string;
    probability?: number;
    notes?: string | null;
    changed_by_user_id?: string | null;
    closed_product_code?: string | null;
    lost_reason?: string | null;
  },
) {
  const before = params.deal;
  const dealId = asString(before.id);
  const clientId = asString(before.client_id);
  const stageCode = resolveBlueprintStageCode(params.stage_code, resolveBlueprintStageCode(before.stage_code, 'novo_lead'));
  const status = resolveDealStatusForStage(stageCode, asString(before.status) || 'open');
  const updatePayload: Record<string, unknown> = {
    stage_code: stageCode,
    status,
    probability: Math.max(0, Math.min(100, params.probability ?? resolveStageProbability(stageCode, asNumber(before.probability, 0)))),
    updated_at: nowIso(),
  };

  if (status === 'won') {
    updatePayload.won_at = asString(before.won_at) || nowIso();
    updatePayload.closed_at = asString(before.closed_at) || nowIso();
    if (asString(before.payment_method) === 'manual') {
      updatePayload.payment_status = 'paid';
      updatePayload.paid_at = asString(before.paid_at) || nowIso();
    }
  } else if (status === 'lost') {
    updatePayload.closed_at = asString(before.closed_at) || nowIso();
  } else {
    updatePayload.closed_at = null;
  }

  if (params.closed_product_code) updatePayload.closed_product_code = params.closed_product_code;
  if (params.lost_reason) updatePayload.lost_reason = params.lost_reason;

  const { data, error } = await schema.from('deals').update(updatePayload).eq('id', dealId).select('*').single();
  if (error || !data?.id) throw { status: 500, code: 'deal_move_failed', error };

  if (clientId) {
    await schema.from('clients').update({
      current_stage_code: stageCode,
      lifecycle_status: resolveLifecycleStatusForStage(stageCode, status, asString(before.lifecycle_status) || 'lead'),
      updated_at: nowIso(),
    }).eq('id', clientId);
  }

  if (stageCode !== asString(before.stage_code)) {
    await schema.from('stage_history').insert({
      client_id: clientId,
      deal_id: dealId,
      from_stage_code: resolveBlueprintStageCode(before.stage_code, 'novo_lead'),
      to_stage_code: stageCode,
      changed_by_user_id: params.changed_by_user_id || null,
      notes: params.notes || null,
    });
  }

  return data;
}

async function getAutomationSettingsRecord(serviceClient: ReturnType<typeof createClient>) {
  const schema = crmSchema(serviceClient);
  const { data, error } = await schema
    .from('automation_settings')
    .select('*')
    .eq('scope_key', INTERNAL_CRM_AUTOMATION_SCOPE_KEY)
    .maybeSingle();

  if (error) throw { status: 500, code: 'automation_settings_query_failed', error };

  return data || {
    scope_key: INTERNAL_CRM_AUTOMATION_SCOPE_KEY,
    default_whatsapp_instance_id: null,
    admin_notification_numbers: [],
    notification_cooldown_minutes: 60,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

async function resolveAutomationContextEntities(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const schema = crmSchema(serviceClient);
  const dealId = asString(payload.deal_id);
  const appointmentId = asString(payload.appointment_id);
  const conversationId = asString(payload.conversation_id);

  const [dealResult, appointmentResult, conversationResult] = await Promise.all([
    dealId ? schema.from('deals').select('*').eq('id', dealId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    appointmentId ? schema.from('appointments').select('*').eq('id', appointmentId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    conversationId ? schema.from('conversations').select('*').eq('id', conversationId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  if (dealResult.error || appointmentResult.error || conversationResult.error) {
    throw { status: 500, code: 'automation_context_query_failed' };
  }

  const effectiveClientId =
    asString(payload.client_id) ||
    asString(dealResult.data?.client_id) ||
    asString(appointmentResult.data?.client_id) ||
    asString(conversationResult.data?.client_id);

  const clientResult = effectiveClientId
    ? await schema.from('clients').select('*').eq('id', effectiveClientId).maybeSingle()
    : { data: null, error: null };

  if (clientResult.error) throw { status: 500, code: 'automation_context_client_query_failed', error: clientResult.error };

  return {
    client: clientResult.data || null,
    deal: dealResult.data || null,
    appointment: appointmentResult.data || null,
    conversation: conversationResult.data || null,
  };
}

function buildAutomationTemplatePayload(
  context: {
    client: Record<string, unknown> | null;
    deal: Record<string, unknown> | null;
    appointment: Record<string, unknown> | null;
    conversation: Record<string, unknown> | null;
  },
  payload: Record<string, unknown>,
  eventType: string,
) {
  const client = context.client || {};
  const deal = context.deal || {};
  const appointment = context.appointment || {};
  const conversation = context.conversation || {};
  const commercialContext = asRecord(deal.commercial_context);
  const appointmentMetadata = asRecord(appointment.metadata);
  const stageCode = resolveBlueprintStageCode(
    payload.stage_code || deal.stage_code || client.current_stage_code,
    'novo_lead',
  );
  const appointmentStartAt = asString(payload.appointment_start_at) || asString(appointment.start_at);
  const effectiveOfferCode = asString(payload.offer_code) || asString(deal.next_offer_code);
  const closedProductCode = asString(payload.closed_product_code) || asString(deal.closed_product_code) || asString(deal.primary_offer_code);

  return {
    client_id: asString(payload.client_id) || asString(client.id),
    deal_id: asString(payload.deal_id) || asString(deal.id),
    appointment_id: asString(payload.appointment_id) || asString(appointment.id),
    conversation_id: asString(payload.conversation_id) || asString(conversation.id),
    event_type: eventType,
    event_at: asString(payload.event_at) || nowIso(),
    appointment_start_at: appointmentStartAt,
    appointment_type: asString(payload.appointment_type) || asString(appointment.appointment_type),
    whatsapp_instance_id:
      asString(payload.whatsapp_instance_id) ||
      asString(conversation.whatsapp_instance_id) ||
      asString(appointmentMetadata.whatsapp_instance_id),
    nome:
      asString(payload.nome) ||
      asString(client.primary_contact_name) ||
      asString(client.company_name) ||
      'Lead',
    empresa: asString(payload.empresa) || asString(client.company_name) || '',
    etapa: asString(payload.etapa) || humanizeToken(stageCode),
    stage_code: stageCode,
    crm_url: asString(payload.crm_url) || buildInternalCrmUrl(asString(client.id)),
    link_agendamento:
      asString(payload.link_agendamento) ||
      asString(commercialContext.scheduling_link) ||
      asString(appointmentMetadata.scheduling_link) ||
      buildInternalCrmUrl(asString(client.id)),
    link_reuniao:
      asString(payload.link_reuniao) ||
      asString(appointmentMetadata.meeting_link) ||
      asString(commercialContext.meeting_link),
    data_hora: asString(payload.data_hora) || formatPtBrDateTime(appointmentStartAt),
    hora: asString(payload.hora) || formatPtBrTime(appointmentStartAt),
    produto_fechado: asString(payload.produto_fechado) || humanizeToken(closedProductCode),
    closed_product_code: closedProductCode,
    offer_code: effectiveOfferCode,
    trial_ends_at: asString(payload.trial_ends_at) || asString(commercialContext.trial_ends_at),
    has_scheduled_call: asBoolean(
      payload.has_scheduled_call,
      Boolean(asString(appointment.id) && ['scheduled', 'confirmed'].includes(asString(appointment.status) || 'scheduled')),
    ),
    primary_phone: asString(payload.primary_phone) || asString(client.primary_phone),
    primary_email: asString(payload.primary_email) || asString(client.primary_email),
    commercial_context: commercialContext,
    appointment_metadata: appointmentMetadata,
    ...commercialContext,
    ...appointmentMetadata,
    ...payload,
  };
}

async function cancelPendingAutomationRunsForEvent(
  serviceClient: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown>,
) {
  const schema = crmSchema(serviceClient);
  const appointmentId = asString(payload.appointment_id);
  const dealId = asString(payload.deal_id);
  const conversationId = asString(payload.conversation_id);
  const clientId = asString(payload.client_id);

  if (!appointmentId && !dealId && !conversationId && !clientId) return 0;

  let query = schema
    .from('automation_runs')
    .select('id, automation_id, client_id, deal_id, appointment_id, conversation_id')
    .in('status', ['pending', 'processing'])
    .order('scheduled_at', { ascending: true })
    .limit(200);

  if (appointmentId) query = query.eq('appointment_id', appointmentId);
  else if (dealId) query = query.eq('deal_id', dealId);
  else if (conversationId) query = query.eq('conversation_id', conversationId);
  else if (clientId) query = query.eq('client_id', clientId);

  const { data: runs, error } = await query;
  if (error) throw { status: 500, code: 'automation_runs_query_failed', error };
  if (!runs || runs.length === 0) return 0;

  const automationIds = Array.from(new Set(runs.map((run) => asString(run.automation_id)).filter((id): id is string => Boolean(id))));
  if (automationIds.length === 0) return 0;

  const { data: rules, error: rulesError } = await schema
    .from('automation_rules')
    .select('id, cancel_on_event_types')
    .in('id', automationIds);

  if (rulesError) throw { status: 500, code: 'automation_rules_query_failed', error: rulesError };

  const cancelableRuleIds = new Set(
    (rules || [])
      .filter((rule) => normalizeTextArray(rule.cancel_on_event_types).includes(eventType))
      .map((rule) => String(rule.id)),
  );

  const cancelIds = runs
    .filter((run) => cancelableRuleIds.has(String(run.automation_id || '')))
    .map((run) => String(run.id));

  if (cancelIds.length === 0) return 0;

  const { error: cancelError } = await schema
    .from('automation_runs')
    .update({
      status: 'canceled',
      processed_at: nowIso(),
      result_payload: { canceled_by_event: eventType },
      updated_at: nowIso(),
    })
    .in('id', cancelIds);

  if (cancelError) throw { status: 500, code: 'automation_runs_cancel_failed', error: cancelError };
  return cancelIds.length;
}

async function queueAutomationEvent(
  serviceClient: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown>,
  options: { processDueNow?: boolean } = {},
) {
  const schema = crmSchema(serviceClient);
  const context = await resolveAutomationContextEntities(serviceClient, payload);
  const eventPayload = buildAutomationTemplatePayload(context, payload, eventType);

  await cancelPendingAutomationRunsForEvent(serviceClient, eventType, eventPayload);

  const { data: rules, error } = await schema
    .from('automation_rules')
    .select('*')
    .eq('trigger_event', eventType)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw { status: 500, code: 'automation_rules_query_failed', error };

  const queuedRunIds: string[] = [];
  const dueRunIds: string[] = [];
  const skippedAutomationKeys: string[] = [];

  for (const rule of rules || []) {
    if (!automationConditionMatches(asRecord(rule.condition), eventPayload)) {
      skippedAutomationKeys.push(String(rule.automation_key || ''));
      continue;
    }

    const scheduledAt = resolveAutomationScheduledAt(rule, eventPayload);
    const eventKey = buildAutomationEventKey(eventType, {
      ...eventPayload,
      anchor_key: asString(payload.anchor_key) || asString(eventPayload.offer_code) || asString(rule.automation_key),
    });
    const dedupeKey = `${asString(rule.automation_key) || String(rule.id)}:${eventKey}`;

    const { data: run, error: runError } = await schema
      .from('automation_runs')
      .insert({
        automation_id: rule.id,
        automation_key: rule.automation_key,
        client_id: asString(eventPayload.client_id),
        deal_id: asString(eventPayload.deal_id),
        appointment_id: asString(eventPayload.appointment_id),
        conversation_id: asString(eventPayload.conversation_id),
        trigger_event: eventType,
        channel: rule.channel,
        scheduled_at: scheduledAt,
        dedupe_key: dedupeKey,
        payload: mergeRecord(eventPayload, {
          automation_name: asString(rule.name),
          automation_key: asString(rule.automation_key),
          template_body: renderAutomationTemplate(asString(rule.template), eventPayload),
          rule_metadata: asRecord(rule.metadata),
          event_key: eventKey,
        }),
      })
      .select('*')
      .single();

    if (runError) {
      if (String((runError as { code?: unknown }).code || '') === '23505') {
        skippedAutomationKeys.push(String(rule.automation_key || ''));
        continue;
      }
      throw { status: 500, code: 'automation_run_insert_failed', error: runError };
    }

    queuedRunIds.push(String(run.id));
    await schema
      .from('automation_rules')
      .update({ last_run_at: nowIso(), last_run_status: 'pending', updated_at: nowIso() })
      .eq('id', rule.id);

    if (asString(eventPayload.deal_id)) {
      await schema
        .from('deals')
        .update({ last_automation_key: asString(rule.automation_key), updated_at: nowIso() })
        .eq('id', asString(eventPayload.deal_id));
    }

    if (new Date(scheduledAt).getTime() <= Date.now()) {
      dueRunIds.push(String(run.id));
    }
  }

  const processed = dueRunIds.length > 0 && options.processDueNow !== false
    ? await processAutomationRunsWithOptions(serviceClient, { runIds: dueRunIds, limit: dueRunIds.length })
    : null;

  return {
    queued_run_ids: queuedRunIds,
    skipped_automation_keys: skippedAutomationKeys,
    processed,
  };
}

function getEvolutionEnv() {
  const baseUrl = String(Deno.env.get('EVOLUTION_API_URL') || '').trim().replace(/\/+$/, '');
  const apiKey = String(Deno.env.get('EVOLUTION_API_KEY') || '').trim();
  if (!baseUrl || !apiKey) {
    throw new Error('missing_evolution_env');
  }
  return { baseUrl, apiKey };
}

async function evolutionRequest(endpoint: string, options: RequestInit = {}) {
  const { baseUrl, apiKey } = getEvolutionEnv();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`evolution_request_failed:${response.status}:${JSON.stringify(payload)}`);
  }
  return payload;
}

function buildInternalWebhookHeaders() {
  const internalApiKey = String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim();
  return internalApiKey ? { 'x-internal-api-key': internalApiKey } : {};
}

function resolveInternalWebhookUrl() {
  const { supabaseUrl } = getSupabaseEnv();
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/internal-crm-api?action=webhook_inbound`;
}

async function invokeInternalEdgeFunction(functionName: string, payload: Record<string, unknown>) {
  const { supabaseUrl, supabaseServiceRoleKey } = getSupabaseEnv();
  const internalApiKey = String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim();

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      ...(internalApiKey ? { 'x-internal-api-key': internalApiKey } : {}),
    },
    body: JSON.stringify(payload),
  });

  const responsePayload = await response.json().catch(() => null);
  if (!response.ok) {
    throw {
      status: 502,
      code: 'internal_edge_function_failed',
      details: responsePayload,
    };
  }

  if (isRecord(responsePayload) && responsePayload.ok === false) {
    throw {
      status: 502,
      code: 'internal_edge_function_failed',
      details: responsePayload,
    };
  }

  return isRecord(responsePayload) ? responsePayload : { ok: true };
}

type GoogleCalendarConnection = {
  user_id: string;
  account_email: string | null;
  account_name: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
  calendar_id: string;
  connected_at: string | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeAsOrigin(value: string | null, fallbackOrigin: string): string {
  if (!value) return fallbackOrigin;
  try {
    return new URL(value).origin;
  } catch {
    return fallbackOrigin;
  }
}

function resolveGoogleProviderConfigRecord(input: unknown): Record<string, unknown> {
  if (Array.isArray(input)) {
    const first = input.find((entry) => isRecord(entry));
    return isRecord(first) ? first : {};
  }

  return isRecord(input) ? input : {};
}

async function resolveGoogleOAuthConfig(serviceClient: ReturnType<typeof createClient>) {
  const envClientId = asString(Deno.env.get('GOOGLE_CLIENT_ID')) || asString(Deno.env.get('GOOGLE_ADS_CLIENT_ID'));
  const envClientSecret =
    asString(Deno.env.get('GOOGLE_CLIENT_SECRET')) || asString(Deno.env.get('GOOGLE_ADS_CLIENT_SECRET'));

  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
    };
  }

  const { data, error } = await serviceClient.rpc('get_provider_config', { p_provider: 'google' });
  if (error) {
    throw { status: 500, code: 'google_oauth_config_failed', error };
  }

  const config = resolveGoogleProviderConfigRecord(data);
  const clientId = envClientId || asString(config.client_id) || asString(config.app_id);
  const clientSecret = envClientSecret || asString(config.client_secret) || asString(config.app_secret);

  if (!clientId || !clientSecret) {
    throw { status: 500, code: 'google_oauth_config_missing' };
  }

  return { clientId, clientSecret };
}

function normalizeGoogleCalendarConnection(row: Record<string, unknown>): GoogleCalendarConnection {
  return {
    user_id: String(row.user_id || ''),
    account_email: asString(row.account_email),
    account_name: asString(row.account_name),
    access_token: asString(row.access_token) || '',
    refresh_token: asString(row.refresh_token),
    token_expires_at: asString(row.token_expires_at),
    scope: asString(row.scope),
    calendar_id: asString(row.calendar_id) || 'primary',
    connected_at: asString(row.connected_at),
  };
}

async function getGoogleCalendarConnection(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<GoogleCalendarConnection | null> {
  const { data, error } = await crmSchema(serviceClient)
    .from('google_calendar_connections')
    .select('user_id, account_email, account_name, access_token, refresh_token, token_expires_at, scope, calendar_id, connected_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw { status: 500, code: 'google_calendar_connection_query_failed', error };
  }

  if (!isRecord(data)) return null;
  return normalizeGoogleCalendarConnection(data);
}

async function refreshGoogleCalendarAccessToken(
  serviceClient: ReturnType<typeof createClient>,
  connection: GoogleCalendarConnection,
): Promise<GoogleCalendarConnection> {
  const now = Date.now();
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (connection.access_token && expiresAt > now + 120_000) {
    return connection;
  }

  if (!connection.refresh_token) {
    throw { status: 409, code: 'google_calendar_reauth_required' };
  }

  const { clientId, clientSecret } = await resolveGoogleOAuthConfig(serviceClient);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  const refreshedAccessToken = isRecord(tokenPayload) ? asString(tokenPayload.access_token) : null;
  if (!tokenResponse.ok || !refreshedAccessToken) {
    throw {
      status: 502,
      code: 'google_calendar_token_refresh_failed',
      details: tokenPayload,
    };
  }

  const refreshedRefreshToken = isRecord(tokenPayload) ? asString(tokenPayload.refresh_token) : null;
  const expiresInSeconds = isRecord(tokenPayload) ? clamp(asNumber(tokenPayload.expires_in, 3600), 60, 86_400) : 3600;
  const nextExpiresAtIso = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const { data, error } = await crmSchema(serviceClient)
    .from('google_calendar_connections')
    .update({
      access_token: refreshedAccessToken,
      refresh_token: refreshedRefreshToken || connection.refresh_token,
      token_expires_at: nextExpiresAtIso,
      scope: isRecord(tokenPayload) ? asString(tokenPayload.scope) || connection.scope : connection.scope,
      updated_at: nowIso(),
    })
    .eq('user_id', connection.user_id)
    .select('user_id, account_email, account_name, access_token, refresh_token, token_expires_at, scope, calendar_id, connected_at')
    .single();

  if (error || !isRecord(data)) {
    throw { status: 500, code: 'google_calendar_connection_update_failed', error };
  }

  return normalizeGoogleCalendarConnection(data);
}

async function googleCalendarRequest(
  accessToken: string,
  path: string,
  options: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw {
      status: 502,
      code: 'google_calendar_request_failed',
      details: payload,
    };
  }

  return isRecord(payload) ? payload : {};
}

function mapGoogleEventStatusToAppointmentStatus(
  googleStatus: string,
  endAtIso: string | null,
): 'scheduled' | 'confirmed' | 'done' | 'canceled' | 'no_show' {
  if (googleStatus === 'cancelled') return 'canceled';
  if (endAtIso) {
    const parsedEnd = new Date(endAtIso);
    if (!Number.isNaN(parsedEnd.getTime()) && parsedEnd.getTime() < Date.now()) {
      return 'done';
    }
  }
  return googleStatus === 'confirmed' ? 'confirmed' : 'scheduled';
}

function buildGoogleEventDescription(
  appointment: Record<string, unknown>,
  client: Record<string, unknown> | null,
): string {
  const chunks: string[] = [];
  const clientName = asString(client?.company_name) || asString(appointment.client_company_name);
  const contactName = asString(client?.primary_contact_name);
  const contactEmail = asString(client?.primary_email);
  const notes = asString(appointment.notes);

  if (clientName) chunks.push(`Cliente: ${clientName}`);
  if (contactName) chunks.push(`Contato: ${contactName}`);
  if (contactEmail) chunks.push(`Email: ${contactEmail}`);
  if (notes) chunks.push(`\nNotas internas:\n${notes}`);

  return chunks.join('\n').trim();
}

async function listInstances(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await crmSchema(serviceClient)
    .from('whatsapp_instances')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw { status: 500, code: 'instances_query_failed', error };
  return data || [];
}

async function upsertInstance(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const instanceId = asString(payload.instance_id);
  const rawInstanceName = asString(payload.instance_name);
  const displayName = asString(payload.display_name);
  if (!rawInstanceName || !displayName) throw { status: 400, code: 'invalid_payload' };

  const instanceName = rawInstanceName.startsWith('sz_internal_') ? rawInstanceName : `sz_internal_${rawInstanceName}`;
  const before = instanceId
    ? (await crmSchema(serviceClient).from('whatsapp_instances').select('*').eq('id', instanceId).maybeSingle()).data
    : null;

  const { data, error } = await crmSchema(serviceClient)
    .from('whatsapp_instances')
    .upsert({
      id: instanceId || undefined,
      instance_name: instanceName,
      display_name: displayName,
      ai_enabled: asBoolean(payload.ai_enabled, false),
      assistant_identity_name: asString(payload.assistant_identity_name),
      assistant_prompt_override: asString(payload.assistant_prompt_override),
      metadata: isRecord(payload.metadata) ? payload.metadata : {},
    })
    .select('*')
    .single();

  if (error || !data?.id) throw { status: 500, code: 'instance_upsert_failed', error };

  await writeAuditLog(serviceClient, identity, 'upsert_instance', req, {
    target_type: 'whatsapp_instance',
    target_id: String(data.id),
    before,
    after: data,
  });

  return { ok: true, instance: data };
}

async function connectInstance(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const instanceId = asString(payload.instance_id);
  if (!instanceId) throw { status: 400, code: 'invalid_payload' };

  const schema = crmSchema(serviceClient);
  const { data: instance, error } = await schema.from('whatsapp_instances').select('*').eq('id', instanceId).maybeSingle();
  if (error) throw { status: 500, code: 'instance_query_failed', error };
  if (!instance?.id) throw { status: 404, code: 'not_found' };

  await evolutionRequest('/instance/create', {
    method: 'POST',
    body: JSON.stringify({ instanceName: instance.instance_name }),
  }).catch(() => null);

  const qrPayload = await evolutionRequest(`/instance/connect/${instance.instance_name}`, { method: 'GET' }).catch(() => null);
  await evolutionRequest(`/webhook/set/${instance.instance_name}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        url: resolveInternalWebhookUrl(),
        enabled: true,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CONNECTION_UPDATE'],
        headers: buildInternalWebhookHeaders(),
      },
    }),
  }).catch(() => null);

  const statusPayload = await evolutionRequest(`/instance/connectionState/${instance.instance_name}`, {
    method: 'GET',
  }).catch(() => null);

  const nextStatus = String(statusPayload?.instance?.state || '').toLowerCase() === 'open' ? 'connected' : 'connecting';
  const qrCode = asString(qrPayload?.base64) || asString(qrPayload?.qrcode?.base64);

  const { data, error: updateError } = await schema
    .from('whatsapp_instances')
    .update({
      status: nextStatus,
      qr_code_base64: qrCode,
      webhook_url: resolveInternalWebhookUrl(),
      updated_at: nowIso(),
    })
    .eq('id', instanceId)
    .select('*')
    .single();

  if (updateError) throw { status: 500, code: 'instance_connect_failed', error: updateError };

  await writeAuditLog(serviceClient, identity, 'connect_instance', req, {
    target_type: 'whatsapp_instance',
    target_id: instanceId,
    after: data,
  });

  return { ok: true, instance: data, qr_code_base64: qrCode };
}

async function listConversations(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const schema = crmSchema(serviceClient);
  let query = schema
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false });

  const status = asString(payload.status);
  if (status) query = query.eq('status', status);
  const assignedToUserId = asString(payload.assigned_to_user_id);
  if (assignedToUserId) query = query.eq('assigned_to_user_id', assignedToUserId);

  const { data, error } = await query.limit(200);
  if (error) throw { status: 500, code: 'conversations_query_failed', error };

  const rows = data || [];
  if (rows.length === 0) return [];
  const clientIds = rows.map((row) => row.client_id).filter(Boolean);
  const conversationIds = rows.map((row) => String(row.id)).filter(Boolean);

  const [{ data: clients }, { data: unreadMessages, error: unreadError }] = await Promise.all([
    schema
      .from('clients')
      .select('id, company_name, primary_contact_name, primary_phone, primary_email, current_stage_code, lifecycle_status, source_channel, next_action, next_action_at')
      .in('id', clientIds),
    conversationIds.length > 0
      ? schema
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', conversationIds)
          .eq('direction', 'inbound')
          .is('read_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (unreadError) throw { status: 500, code: 'conversation_unread_query_failed', error: unreadError };

  const clientMap = new Map<string, Record<string, unknown>>();
  for (const client of clients || []) clientMap.set(String(client.id), client);
  const unreadCountByConversationId = new Map<string, number>();
  for (const unreadMessage of unreadMessages || []) {
    const conversationId = String(unreadMessage.conversation_id || '');
    if (!conversationId) continue;
    unreadCountByConversationId.set(conversationId, (unreadCountByConversationId.get(conversationId) || 0) + 1);
  }

  return rows.map((row) => {
    const client = clientMap.get(String(row.client_id || ''));
    return {
      ...row,
      client_company_name: asString(client?.company_name),
      primary_contact_name: asString(client?.primary_contact_name),
      primary_phone: asString(client?.primary_phone),
      primary_email: asString(client?.primary_email),
      current_stage_code: asString(client?.current_stage_code),
      lifecycle_status: asString(client?.lifecycle_status),
      source_channel: asString(client?.source_channel),
      next_action: asString(client?.next_action),
      next_action_at: asString(client?.next_action_at),
      unread_count: unreadCountByConversationId.get(String(row.id || '')) || 0,
    };
  });
}

async function getConversationDetail(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const conversationId = asString(payload.conversation_id);
  if (!conversationId) throw { status: 400, code: 'invalid_payload' };
  const schema = crmSchema(serviceClient);

  const { data: conversation, error: conversationError } = await schema.from('conversations').select('*').eq('id', conversationId).maybeSingle();
  if (conversationError) throw { status: 500, code: 'conversation_query_failed', error: conversationError };
  if (!conversation?.id) throw { status: 404, code: 'not_found' };

  const [{ data: messages, error: messagesError }, { data: client }, { data: instance }] = await Promise.all([
    schema.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
    schema.from('clients').select('id, company_name, primary_contact_name, primary_phone, primary_email, source_channel, owner_user_id, current_stage_code, lifecycle_status, last_contact_at, next_action, next_action_at, linked_public_org_id, updated_at').eq('id', conversation.client_id).maybeSingle(),
    conversation.whatsapp_instance_id ? schema.from('whatsapp_instances').select('*').eq('id', conversation.whatsapp_instance_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  if (messagesError) throw { status: 500, code: 'messages_query_failed', error: messagesError };

  return {
    ok: true,
    conversation,
    messages: messages || [],
    client: client || null,
    whatsapp_instance: instance || null,
  };
}

async function appendMessage(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const conversationId = asString(payload.conversation_id);
  if (!conversationId) throw { status: 400, code: 'invalid_payload' };

  const schema = crmSchema(serviceClient);
  const { data: conversation, error: conversationError } = await schema.from('conversations').select('*').eq('id', conversationId).maybeSingle();
  if (conversationError) throw { status: 500, code: 'conversation_query_failed', error: conversationError };
  if (!conversation?.id) throw { status: 404, code: 'not_found' };

  const body = asString(payload.body);
  const messageType = asString(payload.message_type) || 'text';
  const internalOnlyNote = conversation.channel === 'manual_note' || messageType === 'note';

  let waMessageId: string | null = null;
  let deliveryStatus = internalOnlyNote ? 'sent' : 'pending';
  if (!internalOnlyNote) {
    const [{ data: instance }, { data: client }] = await Promise.all([
      conversation.whatsapp_instance_id
        ? schema.from('whatsapp_instances').select('*').eq('id', conversation.whatsapp_instance_id).maybeSingle()
        : Promise.resolve({ data: null }),
      schema.from('clients').select('primary_phone').eq('id', conversation.client_id).maybeSingle(),
    ]);

    if (!instance?.instance_name || !client?.primary_phone || !body) {
      throw { status: 400, code: 'invalid_payload', message: 'Conversa sem instancia, telefone ou corpo para envio.' };
    }

    const phone = normalizePhone(client.primary_phone);
    const sendResponse = await evolutionRequest(`/message/sendText/${instance.instance_name}`, {
      method: 'POST',
      body: JSON.stringify({ number: phone, text: body }),
    }).catch(() => null);

    waMessageId = asString(sendResponse?.key?.id);
    deliveryStatus = sendResponse ? 'sent' : 'failed';
  }

  const insertPayload = {
    conversation_id: conversationId,
    whatsapp_instance_id: conversation.whatsapp_instance_id,
    direction: 'outbound',
    body,
    message_type: messageType,
    attachment_url: asString(payload.attachment_url),
    wa_message_id: waMessageId,
    remote_jid: asString(payload.remote_jid),
    sent_by_user_id: identity.user_id,
    delivery_status: deliveryStatus,
    metadata: isRecord(payload.metadata) ? payload.metadata : {},
  };

  const { data, error } = await schema.from('messages').insert(insertPayload).select('*').single();
  if (error || !data?.id) throw { status: 500, code: 'message_insert_failed', error };

  await schema.from('conversations').update({
    last_message_at: data.created_at,
    last_message_preview: body,
    updated_at: nowIso(),
  }).eq('id', conversationId);

  await schema.from('clients').update({
    last_contact_at: data.created_at,
    updated_at: nowIso(),
  }).eq('id', conversation.client_id);

  await writeAuditLog(serviceClient, identity, 'append_message', req, {
    target_type: 'conversation',
    target_id: conversationId,
    client_id: String(conversation.client_id),
    after: data,
  });

  return { ok: true, message: data };
}

async function markConversationRead(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const conversationId = asString(payload.conversation_id);
  if (!conversationId) throw { status: 400, code: 'invalid_payload' };

  const schema = crmSchema(serviceClient);
  const readAt = nowIso();
  const { data, error } = await schema
    .from('messages')
    .update({ read_at: readAt, delivery_status: 'read' })
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .is('read_at', null)
    .select('id');

  if (error) throw { status: 500, code: 'conversation_mark_read_failed', error };

  await writeAuditLog(serviceClient, identity, 'mark_conversation_read', req, {
    target_type: 'conversation',
    target_id: conversationId,
    after: {
      read_count: (data || []).length,
      read_at: readAt,
    },
  });

  return {
    ok: true,
    read_count: (data || []).length,
    read_at: readAt,
  };
}

async function updateConversationStatus(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const conversationId = asString(payload.conversation_id);
  if (!conversationId) throw { status: 400, code: 'invalid_payload' };

  const schema = crmSchema(serviceClient);
  const { data: before, error: beforeError } = await schema
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (beforeError) throw { status: 500, code: 'conversation_query_failed', error: beforeError };
  if (!before?.id) throw { status: 404, code: 'not_found' };

  const updatePayload: Record<string, unknown> = {
    updated_at: nowIso(),
  };

  const status = asString(payload.status);
  if (status) {
    if (!['open', 'resolved', 'archived'].includes(status)) throw { status: 400, code: 'invalid_payload' };
    updatePayload.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'assigned_to_user_id')) {
    updatePayload.assigned_to_user_id = asString(payload.assigned_to_user_id);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'subject')) {
    updatePayload.subject = asString(payload.subject);
  }

  const { data, error } = await schema
    .from('conversations')
    .update(updatePayload)
    .eq('id', conversationId)
    .select('*')
    .single();

  if (error || !data?.id) throw { status: 500, code: 'conversation_update_failed', error };

  await writeAuditLog(serviceClient, identity, 'update_conversation_status', req, {
    target_type: 'conversation',
    target_id: conversationId,
    client_id: asString(data.client_id),
    before,
    after: data,
  });

  return {
    ok: true,
    conversation: data,
  };
}

async function listCampaigns(serviceClient: ReturnType<typeof createClient>) {
  const schema = crmSchema(serviceClient);
  const { data, error } = await schema
    .from('broadcast_campaigns')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw { status: 500, code: 'campaigns_query_failed', error };

  const campaigns = data || [];
  if (campaigns.length === 0) return [];

  const campaignIds = campaigns.map((campaign) => String(campaign.id));
  const { data: recipients, error: recipientsError } = await schema
    .from('broadcast_recipients')
    .select('campaign_id, status')
    .in('campaign_id', campaignIds);

  if (recipientsError) throw { status: 500, code: 'campaign_recipients_query_failed', error: recipientsError };

  const counters = new Map<string, { total: number; pending: number; sent: number; failed: number }>();
  for (const row of recipients || []) {
    const campaignId = String(row.campaign_id || '');
    if (!campaignId) continue;
    const current = counters.get(campaignId) || { total: 0, pending: 0, sent: 0, failed: 0 };
    current.total += 1;
    const status = String(row.status || 'pending');
    if (status === 'pending') current.pending += 1;
    if (status === 'sent') current.sent += 1;
    if (status === 'failed') current.failed += 1;
    counters.set(campaignId, current);
  }

  return campaigns.map((campaign) => {
    const count = counters.get(String(campaign.id)) || { total: 0, pending: 0, sent: 0, failed: 0 };
    return {
      ...campaign,
      messages: Array.isArray(campaign.messages) ? campaign.messages : [],
      recipients_total: count.total,
      recipients_pending: count.pending,
      recipients_sent: count.sent,
      recipients_failed: count.failed,
    };
  });
}

async function upsertCampaign(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const campaignId = asString(payload.campaign_id);
  const name = asString(payload.name);
  if (!name) throw { status: 400, code: 'invalid_payload' };
  const before = campaignId
    ? (await crmSchema(serviceClient).from('broadcast_campaigns').select('*').eq('id', campaignId).maybeSingle()).data
    : null;

  const messages = Array.isArray(payload.messages)
    ? payload.messages.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const { data, error } = await crmSchema(serviceClient)
    .from('broadcast_campaigns')
    .upsert({
      id: campaignId || undefined,
      name,
      whatsapp_instance_id: asString(payload.whatsapp_instance_id),
      owner_user_id: asString(payload.owner_user_id) || identity.user_id,
      target_filters: isRecord(payload.target_filters) ? payload.target_filters : {},
      messages,
      status: asString(payload.status) || 'draft',
    })
    .select('*')
    .single();

  if (error || !data?.id) throw { status: 500, code: 'campaign_upsert_failed', error };

  const recipients = Array.isArray(payload.recipients) ? payload.recipients.filter((item) => isRecord(item)) : [];
  if (recipients.length > 0) {
    await crmSchema(serviceClient).from('broadcast_recipients').delete().eq('campaign_id', data.id);
    await crmSchema(serviceClient).from('broadcast_recipients').insert(
      recipients.map((recipient) => ({
        campaign_id: data.id,
        client_id: asString(recipient.client_id),
        contact_id: asString(recipient.contact_id),
        recipient_name: asString(recipient.recipient_name),
        recipient_phone: normalizePhone(recipient.recipient_phone),
        payload: isRecord(recipient.payload) ? recipient.payload : {},
      })),
    );
  }

  await writeAuditLog(serviceClient, identity, 'upsert_campaign', req, {
    target_type: 'campaign',
    target_id: String(data.id),
    before,
    after: data,
  });

  return { ok: true, campaign: data };
}

async function updateCampaignStatus(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const campaignId = asString(payload.campaign_id);
  const status = asString(payload.status);
  if (!campaignId || !status) throw { status: 400, code: 'invalid_payload' };

  const before = (await crmSchema(serviceClient).from('broadcast_campaigns').select('*').eq('id', campaignId).maybeSingle()).data;
  const { data, error } = await crmSchema(serviceClient)
    .from('broadcast_campaigns')
    .update({
      status,
      started_at: status === 'running' ? nowIso() : before?.started_at,
      finished_at: ['completed', 'canceled'].includes(status) ? nowIso() : null,
      updated_at: nowIso(),
    })
    .eq('id', campaignId)
    .select('*')
    .single();

  if (error || !data?.id) throw { status: 500, code: 'campaign_status_update_failed', error };

  await writeAuditLog(serviceClient, identity, 'update_campaign_status', req, {
    target_type: 'campaign',
    target_id: campaignId,
    before,
    after: data,
  });

  return { ok: true, campaign: data };
}

async function runCampaignBatch(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const campaignId = asString(payload.campaign_id);
  const batchSize = Math.max(1, Math.min(50, asNumber(payload.batch_size, 20)));

  let campaignBefore: Record<string, unknown> | null = null;
  let effectiveCampaignId = campaignId;

  if (campaignId) {
    const { data: existingCampaign, error: campaignError } = await schema
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();

    if (campaignError) throw { status: 500, code: 'campaign_query_failed', error: campaignError };
    if (!existingCampaign?.id) throw { status: 404, code: 'not_found' };

    campaignBefore = existingCampaign;
    if (String(existingCampaign.status || '') !== 'running') {
      const { data: updatedCampaign, error: updateError } = await schema
        .from('broadcast_campaigns')
        .update({
          status: 'running',
          started_at: existingCampaign.started_at || nowIso(),
          finished_at: null,
          updated_at: nowIso(),
        })
        .eq('id', campaignId)
        .select('*')
        .single();

      if (updateError || !updatedCampaign?.id) {
        throw { status: 500, code: 'campaign_status_update_failed', error: updateError };
      }
      effectiveCampaignId = String(updatedCampaign.id);
    }
  }

  const workerResult = await invokeInternalEdgeFunction('internal-crm-broadcast-worker', {
    campaign_id: effectiveCampaignId,
    batch_size: batchSize,
  });

  await writeAuditLog(serviceClient, identity, 'run_campaign_batch', req, {
    target_type: 'campaign',
    target_id: effectiveCampaignId,
    before: campaignBefore,
    after: {
      campaign_id: effectiveCampaignId,
      batch_size: batchSize,
      worker_result: workerResult,
    },
  });

  return {
    ok: true,
    campaign_id: effectiveCampaignId,
    batch_size: batchSize,
    worker_result: workerResult,
  };
}

async function listAppointments(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const schema = crmSchema(serviceClient);
  const dateFrom = asString(payload.date_from);
  const dateTo = asString(payload.date_to);

  let query = schema.from('appointments').select('*').order('start_at', { ascending: true });

  if (dateFrom) {
    const parsedFrom = new Date(dateFrom);
    if (Number.isNaN(parsedFrom.getTime())) throw { status: 400, code: 'invalid_payload' };
    query = query.gte('start_at', parsedFrom.toISOString());
  }

  if (dateTo) {
    const parsedTo = new Date(dateTo);
    if (Number.isNaN(parsedTo.getTime())) throw { status: 400, code: 'invalid_payload' };
    parsedTo.setUTCHours(23, 59, 59, 999);
    query = query.lte('start_at', parsedTo.toISOString());
  }

  const status = asString(payload.status);
  if (status) query = query.eq('status', status);

  const ownerUserId = asString(payload.owner_user_id);
  if (ownerUserId) query = query.eq('owner_user_id', ownerUserId);

  const clientId = asString(payload.client_id);
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query.limit(500);
  if (error) throw { status: 500, code: 'appointments_query_failed', error };

  const appointments = data || [];
  if (appointments.length === 0) return [];

  const clientIds = Array.from(
    new Set(
      appointments
        .map((appointment) => asString(appointment.client_id))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (clientIds.length === 0) return appointments;

  const { data: clients, error: clientsError } = await schema
    .from('clients')
    .select('id, company_name')
    .in('id', clientIds);

  if (clientsError) throw { status: 500, code: 'appointment_clients_query_failed', error: clientsError };

  const clientMap = new Map<string, string>();
  for (const client of clients || []) {
    clientMap.set(String(client.id), String(client.company_name || ''));
  }

  return appointments.map((appointment) => ({
    ...appointment,
    client_company_name: clientMap.get(String(appointment.client_id || '')) || null,
  }));
}

async function resolveLandingFormFunnel(
  serviceClient: ReturnType<typeof createClient>,
  funnelSlug: string | null,
) {
  if (!funnelSlug) throw { status: 400, code: 'invalid_payload' };

  const { data, error } = await crmSchema(serviceClient)
    .from('landing_form_funnels')
    .select('*')
    .eq('funnel_slug', funnelSlug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw { status: 500, code: 'landing_funnel_query_failed', error };
  if (!data?.funnel_slug) throw { status: 404, code: 'landing_funnel_not_found' };
  return data as Record<string, unknown>;
}

async function resolveLandingFunnelOwnerUserId(
  serviceClient: ReturnType<typeof createClient>,
  funnel: Record<string, unknown>,
) {
  const directOwnerUserId =
    asString(funnel.owner_user_id) ||
    asString(funnel.linked_public_user_id);
  if (directOwnerUserId) return directOwnerUserId;

  const orgId = asString(funnel.linked_public_org_id);
  if (!orgId) return null;

  return resolveOrgPrimaryUserId(serviceClient, orgId);
}

async function listPublicLandingSlots(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const funnel = await resolveLandingFormFunnel(serviceClient, asString(payload.funnel_slug));
  const ownerUserId = await resolveLandingFunnelOwnerUserId(serviceClient, funnel);
  if (!ownerUserId) throw { status: 409, code: 'landing_funnel_incomplete' };

  const timezone = asString(payload.timezone) || asString(funnel.timezone) || 'America/Sao_Paulo';
  const appointmentType = normalizeAppointmentTypeForWindow(payload.appointment_type || funnel.appointment_type);
  const slotDurationMinutes = clamp(
    asNumber(payload.duration_minutes, asNumber(funnel.slot_duration_minutes, 30)),
    5,
    240,
  );
  const slotLimit = clamp(asNumber(payload.limit, asNumber(funnel.slot_limit, 8)), 1, 48);
  const slotLookaheadDays = clamp(
    asNumber(payload.lookahead_days, asNumber(funnel.slot_lookahead_days, 14)),
    1,
    90,
  );
  const slotConfig = normalizeAppointmentWindowConfig(funnel.slot_config);

  const busyRanges: Array<{ startMs: number; endMs: number }> = [];
  const now = new Date();
  const queryFrom = new Date(now.getTime() - (4 * 60 * 60 * 1000)).toISOString();

  const { data: appointments, error: appointmentsError } = await crmSchema(serviceClient)
    .from('appointments')
    .select('id, start_at, end_at, status')
    .eq('owner_user_id', ownerUserId)
    .in('status', ['scheduled', 'confirmed'])
    .gte('start_at', queryFrom)
    .order('start_at', { ascending: true })
    .limit(500);

  if (appointmentsError) throw { status: 500, code: 'landing_slots_query_failed', error: appointmentsError };

  for (const appointment of appointments || []) {
    const start = new Date(String(appointment.start_at || ''));
    const endRaw = asString(appointment.end_at);
    const end = endRaw
      ? new Date(endRaw)
      : new Date(start.getTime() + (slotDurationMinutes * 60_000));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    busyRanges.push({ startMs: start.getTime(), endMs: end.getTime() });
  }

  return {
    ok: true,
    funnel_slug: asString(funnel.funnel_slug),
    owner_user_id: ownerUserId,
    timezone,
    appointment_type: appointmentType,
    duration_minutes: slotDurationMinutes,
    slots: generateAvailableSlotsForType({
      now,
      timeZone: timezone,
      windowRule: slotConfig[appointmentType],
      busyRanges,
      slotMinutes: slotDurationMinutes,
      limit: slotLimit,
      lookaheadDays: slotLookaheadDays,
    }),
  };
}

async function handlePublicLpIntake(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  req: Request,
) {
  const funnel = await resolveLandingFormFunnel(serviceClient, asString(payload.funnel_slug));
  const ownerUserId = await resolveLandingFunnelOwnerUserId(serviceClient, funnel);
  if (!ownerUserId) throw { status: 409, code: 'landing_funnel_incomplete' };

  const linkedPublicOrgId = asString(payload.linked_public_org_id) || asString(funnel.linked_public_org_id);
  const linkedPublicUserId =
    asString(payload.linked_public_user_id) ||
    asString(funnel.linked_public_user_id) ||
    ownerUserId;

  const identity = buildServiceActorIdentity(ownerUserId);
  const trackingSnapshot = buildTrackingSnapshot(isRecord(payload.tracking) ? payload.tracking : null);
  const intakeResult = await intakeLandingLead(serviceClient, identity, {
    ...payload,
    owner_user_id: ownerUserId,
    linked_public_org_id: linkedPublicOrgId,
    linked_public_user_id: linkedPublicUserId,
    tracking: trackingSnapshot,
    form_payload: mergeRecord(payload.form_payload, {
      form_session_id: asString(payload.form_session_id),
      funnel_slug: asString(payload.funnel_slug),
    }),
  }, req);

  const bridge = linkedPublicOrgId && intakeResult.client?.id
    ? await syncInternalCrmTrackingBridge({
        supabase: serviceClient,
        internalClientId: String(intakeResult.client.id),
        internalDealId: asString(intakeResult.deal?.id),
        stageCode: asString(intakeResult.deal?.stage_code) || 'novo_lead',
        linkedPublicOrgId,
        linkedPublicUserId,
        ownerUserId,
        attributionSnapshot: trackingSnapshot,
      })
    : { ok: true, bridge: null, publicLeadId: null, skippedReason: 'missing_linked_org' };

  return {
    ...intakeResult,
    bridge,
    linked_public_org_id: linkedPublicOrgId,
    linked_public_user_id: linkedPublicUserId,
  };
}

async function handlePublicLpBookSlot(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  req: Request,
) {
  const funnel = await resolveLandingFormFunnel(serviceClient, asString(payload.funnel_slug));
  const ownerUserId = await resolveLandingFunnelOwnerUserId(serviceClient, funnel);
  if (!ownerUserId) throw { status: 409, code: 'landing_funnel_incomplete' };

  const clientId = asString(payload.client_id);
  const dealId = asString(payload.deal_id);
  const appointmentStartAtRaw = asString(payload.appointment_start_at);
  if (!clientId || !dealId || !appointmentStartAtRaw) throw { status: 400, code: 'invalid_payload' };

  const appointmentStartAt = new Date(appointmentStartAtRaw);
  if (Number.isNaN(appointmentStartAt.getTime()) || appointmentStartAt.getTime() <= Date.now()) {
    throw { status: 400, code: 'invalid_payload' };
  }

  const timezone = asString(payload.timezone) || asString(funnel.timezone) || 'America/Sao_Paulo';
  const appointmentTypeRaw = asString(payload.appointment_type) || asString(funnel.appointment_type) || 'call';
  const appointmentWindowType = normalizeAppointmentTypeForWindow(appointmentTypeRaw);
  const durationMinutes = clamp(
    asNumber(payload.duration_minutes, asNumber(funnel.slot_duration_minutes, 30)),
    5,
    240,
  );
  const slotConfig = normalizeAppointmentWindowConfig(funnel.slot_config);

  if (!isSlotWithinWindow(appointmentStartAt.toISOString(), appointmentWindowType, slotConfig, timezone, durationMinutes)) {
    throw { status: 409, code: 'slot_unavailable' };
  }

  const appointmentEndAt = new Date(appointmentStartAt.getTime() + (durationMinutes * 60_000));
  const queryFrom = new Date(Date.now() - (4 * 60 * 60 * 1000)).toISOString();
  const { data: appointments, error: appointmentsError } = await crmSchema(serviceClient)
    .from('appointments')
    .select('id, start_at, end_at, status')
    .eq('owner_user_id', ownerUserId)
    .in('status', ['scheduled', 'confirmed'])
    .gte('start_at', queryFrom)
    .order('start_at', { ascending: true })
    .limit(500);

  if (appointmentsError) throw { status: 500, code: 'landing_slots_query_failed', error: appointmentsError };

  const busyRanges = (appointments || []).map((appointment) => {
    const start = new Date(String(appointment.start_at || ''));
    const endRaw = asString(appointment.end_at);
    const end = endRaw
      ? new Date(endRaw)
      : new Date(start.getTime() + (durationMinutes * 60_000));
    return { startMs: start.getTime(), endMs: end.getTime() };
  }).filter((range) => Number.isFinite(range.startMs) && Number.isFinite(range.endMs));

  if (overlapsBusyRange(appointmentStartAt.getTime(), appointmentEndAt.getTime(), busyRanges)) {
    throw { status: 409, code: 'slot_unavailable' };
  }

  const identity = buildServiceActorIdentity(ownerUserId);
  const trackingSnapshot = buildTrackingSnapshot(isRecord(payload.tracking) ? payload.tracking : null);
  const client = (await crmSchema(serviceClient)
    .from('clients')
    .select('company_name, primary_contact_name')
    .eq('id', clientId)
    .maybeSingle()).data;

  const title = asString(payload.title) || `Chamada ARKAN - ${asString(client?.company_name) || asString(client?.primary_contact_name) || 'Lead LP'}`;
  const meetingLink = asString(payload.meeting_link) || asString(funnel.meeting_link);
  const appointmentResult = await upsertAppointment(serviceClient, identity, {
    client_id: clientId,
    deal_id: dealId,
    owner_user_id: ownerUserId,
    title,
    appointment_type: appointmentTypeRaw,
    status: 'scheduled',
    start_at: appointmentStartAt.toISOString(),
    end_at: appointmentEndAt.toISOString(),
    location: meetingLink,
    metadata: {
      meeting_link: meetingLink,
      form_session_id: asString(payload.form_session_id),
      funnel_slug: asString(payload.funnel_slug),
      timezone,
    },
  }, req);

  let syncedAppointment = appointmentResult.appointment;
  let syncedEventLink: string | null = null;
  try {
    const connection = await getGoogleCalendarConnection(serviceClient, ownerUserId);
    if (connection) {
      const syncResult = await syncAppointmentGoogleCalendar(serviceClient, identity, {
        appointment_id: String(appointmentResult.appointment.id),
      }, req);
      syncedAppointment = syncResult.appointment;
      syncedEventLink = asString(syncResult.event?.html_link);
    }
  } catch {
    // Best-effort sync: the internal appointment remains valid even if Google sync fails.
  }

  const linkedPublicOrgId = asString(payload.linked_public_org_id) || asString(funnel.linked_public_org_id);
  const linkedPublicUserId =
    asString(payload.linked_public_user_id) ||
    asString(funnel.linked_public_user_id) ||
    ownerUserId;

  const bridge = linkedPublicOrgId
    ? await syncInternalCrmTrackingBridge({
        supabase: serviceClient,
        internalClientId: clientId,
        internalDealId: dealId,
        stageCode: 'chamada_agendada',
        linkedPublicOrgId,
        linkedPublicUserId,
        ownerUserId,
        attributionSnapshot: trackingSnapshot,
      })
    : { ok: true, bridge: null, publicLeadId: null, skippedReason: 'missing_linked_org' };

  return {
    ok: true,
    appointment: syncedAppointment,
    stage_code: 'chamada_agendada',
    meeting_link: syncedEventLink || meetingLink,
    bridge,
  };
}

async function upsertAppointment(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const appointmentId = asString(payload.appointment_id);
  const clientId = asString(payload.client_id);
  const title = asString(payload.title);
  const startAtRaw = asString(payload.start_at);
  const endAtRaw = asString(payload.end_at);

  if (!clientId || !title || !startAtRaw) throw { status: 400, code: 'invalid_payload' };

  const parsedStartAt = new Date(startAtRaw);
  if (Number.isNaN(parsedStartAt.getTime())) throw { status: 400, code: 'invalid_payload' };

  let parsedEndAt: Date | null = null;
  if (endAtRaw) {
    parsedEndAt = new Date(endAtRaw);
    if (Number.isNaN(parsedEndAt.getTime())) throw { status: 400, code: 'invalid_payload' };
  }

  const before = appointmentId
    ? (await schema.from('appointments').select('*').eq('id', appointmentId).maybeSingle()).data
    : null;

  const { data, error } = await schema.from('appointments').upsert({
    id: appointmentId || undefined,
    client_id: clientId,
    deal_id: asString(payload.deal_id),
    owner_user_id: asString(payload.owner_user_id) || identity.user_id,
    title,
    appointment_type: asString(payload.appointment_type) || 'meeting',
    status: asString(payload.status) || 'scheduled',
    start_at: parsedStartAt.toISOString(),
    end_at: parsedEndAt ? parsedEndAt.toISOString() : null,
    location: asString(payload.location),
    notes: asString(payload.notes),
    metadata: isRecord(payload.metadata) ? payload.metadata : {},
  }).select('*').single();

  if (error || !data?.id) throw { status: 500, code: 'appointment_upsert_failed', error };

  await schema.from('clients').update({ updated_at: nowIso() }).eq('id', clientId);

  const dealForAppointment = data.deal_id
    ? (await schema.from('deals').select('*').eq('id', data.deal_id).maybeSingle()).data
    : null;

  const appointmentStageCode =
    data.status === 'no_show' ? 'nao_compareceu' :
    data.status === 'done' ? 'chamada_realizada' :
    ['scheduled', 'confirmed'].includes(String(data.status || '')) ? 'chamada_agendada' : null;

  if (dealForAppointment?.id && appointmentStageCode) {
    await applyDealStageChange(schema, {
      deal: dealForAppointment,
      stage_code: appointmentStageCode,
      notes: `appointment_status:${String(data.status || '')}`,
      changed_by_user_id: identity.user_id,
    });

    await syncTrackingBridgeFromDeal(serviceClient, {
      internalDealId: String(dealForAppointment.id),
      stageCode: appointmentStageCode,
      syncedAt: nowIso(),
    });
  }

  const appointmentEventAt = asString(data.start_at) || nowIso();
  const appointmentEventBase = {
    client_id: clientId,
    deal_id: asString(data.deal_id),
    appointment_id: String(data.id),
    appointment_type: asString(data.appointment_type) || 'call',
    appointment_start_at: asString(data.start_at),
    link_reuniao: asString(asRecord(data.metadata).meeting_link),
    link_agendamento: asString(asRecord(data.metadata).scheduling_link),
  };

  const beforeStartAt = asString(before?.start_at);
  const isRescheduled = Boolean(before?.id) && beforeStartAt !== asString(data.start_at);
  const statusChanged = Boolean(before?.id) && asString(before?.status) !== asString(data.status);

  if (!before?.id || isRescheduled || (statusChanged && ['scheduled', 'confirmed'].includes(String(data.status || '')))) {
    if (isRescheduled) {
      await queueAutomationEvent(serviceClient, 'appointment_rescheduled', {
        ...appointmentEventBase,
        event_at: appointmentEventAt,
        event_key: `appointment_rescheduled:${String(data.id)}:${appointmentEventAt}`,
      }, { processDueNow: true });
    }

    await queueAutomationEvent(serviceClient, 'appointment_scheduled', {
      ...appointmentEventBase,
      event_at: appointmentEventAt,
      event_key: `appointment_scheduled:${String(data.id)}:${appointmentEventAt}`,
    }, { processDueNow: true });
  }

  if (statusChanged && String(data.status || '') === 'canceled') {
    await queueAutomationEvent(serviceClient, 'appointment_canceled', {
      ...appointmentEventBase,
      event_at: nowIso(),
      event_key: `appointment_canceled:${String(data.id)}:${nowIso()}`,
    }, { processDueNow: true });
  }

  if (statusChanged && String(data.status || '') === 'done') {
    await queueAutomationEvent(serviceClient, 'appointment_done', {
      ...appointmentEventBase,
      event_at: nowIso(),
      event_key: `appointment_done:${String(data.id)}:${nowIso()}`,
    }, { processDueNow: true });
  }

  if (statusChanged && String(data.status || '') === 'no_show') {
    await queueAutomationEvent(serviceClient, 'appointment_no_show', {
      ...appointmentEventBase,
      event_at: nowIso(),
      event_key: `appointment_no_show:${String(data.id)}:${nowIso()}`,
    }, { processDueNow: true });
  }

  await writeAuditLog(serviceClient, identity, 'upsert_appointment', req, {
    target_type: 'appointment',
    target_id: String(data.id),
    client_id: clientId,
    deal_id: asString(data.deal_id),
    before,
    after: data,
  });

  return { ok: true, appointment: data };
}

async function getGoogleCalendarStatus(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
) {
  const connection = await getGoogleCalendarConnection(serviceClient, identity.user_id);
  return {
    ok: true,
    connected: Boolean(connection),
    connection: connection
      ? {
          account_email: connection.account_email,
          account_name: connection.account_name,
          calendar_id: connection.calendar_id,
          token_expires_at: connection.token_expires_at,
          connected_at: connection.connected_at,
        }
      : null,
  };
}

async function getGoogleCalendarOAuthUrl(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
) {
  const { clientId } = await resolveGoogleOAuthConfig(serviceClient);
  const { supabaseUrl } = getSupabaseEnv();
  const appOriginFallback = safeAsOrigin(resolveAppUrl(), 'http://localhost:5173');
  const redirectOrigin = safeAsOrigin(asString(payload.redirect_url), appOriginFallback);
  const redirectUri = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/internal-crm-google-callback`;

  const scope = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid',
  ].join(' ');

  const state = btoa(
    JSON.stringify({
      source: 'internal_crm_google_calendar',
      user_id: identity.user_id,
      redirect_url: redirectOrigin,
      nonce: crypto.randomUUID(),
      issued_at: nowIso(),
    }),
  );

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${encodeURIComponent(state)}`;

  return {
    ok: true,
    auth_url: authUrl,
    redirect_uri: redirectUri,
  };
}

async function disconnectGoogleCalendar(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const before = await getGoogleCalendarConnection(serviceClient, identity.user_id);

  const { error } = await schema
    .from('google_calendar_connections')
    .delete()
    .eq('user_id', identity.user_id);

  if (error) throw { status: 500, code: 'google_calendar_disconnect_failed', error };

  await schema
    .from('appointments')
    .update({
      google_sync_status: 'disconnected',
      google_sync_error: 'calendar_disconnected',
      google_last_synced_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('owner_user_id', identity.user_id)
    .not('google_event_id', 'is', null);

  await writeAuditLog(serviceClient, identity, 'disconnect_google_calendar', req, {
    target_type: 'google_calendar_connection',
    target_id: identity.user_id,
    after: { disconnected: Boolean(before) },
  });

  return {
    ok: true,
    disconnected: Boolean(before),
  };
}

async function syncAppointmentGoogleCalendar(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const appointmentId = asString(payload.appointment_id);
  if (!appointmentId) throw { status: 400, code: 'invalid_payload' };

  const { data: appointment, error: appointmentError } = await schema
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .maybeSingle();

  if (appointmentError) throw { status: 500, code: 'appointment_query_failed', error: appointmentError };
  if (!appointment?.id) throw { status: 404, code: 'not_found' };

  const connection = await getGoogleCalendarConnection(serviceClient, identity.user_id);
  if (!connection) throw { status: 409, code: 'google_calendar_not_connected' };

  let refreshedConnection = connection;
  try {
    refreshedConnection = await refreshGoogleCalendarAccessToken(serviceClient, connection);
  } catch (error) {
    await schema
      .from('appointments')
      .update({
        google_sync_status: 'error',
        google_sync_error: 'google_calendar_reauth_required',
        google_last_synced_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', appointmentId);
    throw error;
  }

  const { data: client } = await schema
    .from('clients')
    .select('id, company_name, primary_contact_name, primary_email')
    .eq('id', appointment.client_id)
    .maybeSingle();

  const calendarId = asString(payload.calendar_id) || refreshedConnection.calendar_id || 'primary';
  const notifyAttendees = asBoolean(payload.notify_attendees, false);
  const createMeet = asBoolean(payload.create_meet, false);
  const summary = asString(payload.summary) || asString(appointment.title) || 'Compromisso CRM Interno';
  const startAtIso = asString(appointment.start_at);
  const endAtIso = asString(appointment.end_at) ||
    (startAtIso ? new Date(new Date(startAtIso).getTime() + 60 * 60 * 1000).toISOString() : null);

  if (!startAtIso || !endAtIso) throw { status: 400, code: 'invalid_payload' };

  const eventPayload: Record<string, unknown> = {
    summary,
    description: buildGoogleEventDescription(appointment, isRecord(client) ? client : null),
    location: asString(appointment.location),
    start: {
      dateTime: startAtIso,
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: endAtIso,
      timeZone: 'America/Sao_Paulo',
    },
    attendees: asString(client?.primary_email) ? [{ email: asString(client?.primary_email) }] : [],
    extendedProperties: {
      private: {
        internal_crm_appointment_id: String(appointment.id),
        internal_crm_client_id: String(appointment.client_id),
      },
    },
  };

  if (createMeet) {
    eventPayload.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const sendUpdates = notifyAttendees ? 'all' : 'none';
  const conferenceParam = createMeet ? '&conferenceDataVersion=1' : '';

  try {
    const existingEventId = asString(appointment.google_event_id);
    const eventResponse = existingEventId
      ? await googleCalendarRequest(
          refreshedConnection.access_token,
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}?sendUpdates=${sendUpdates}${conferenceParam}`,
          {
            method: 'PATCH',
            body: JSON.stringify(eventPayload),
          },
        )
      : await googleCalendarRequest(
          refreshedConnection.access_token,
          `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}${conferenceParam}`,
          {
            method: 'POST',
            body: JSON.stringify(eventPayload),
          },
        );

    const googleEventId = asString(eventResponse.id);
    if (!googleEventId) {
      throw { status: 502, code: 'google_calendar_event_id_missing', details: eventResponse };
    }

    const { data: updatedAppointment, error: updateError } = await schema
      .from('appointments')
      .update({
        owner_user_id: asString(appointment.owner_user_id) || identity.user_id,
        source: asString(appointment.source) || 'internal',
        google_event_id: googleEventId,
        google_calendar_id: calendarId,
        google_sync_status: 'synced',
        google_last_synced_at: nowIso(),
        google_sync_error: null,
        updated_at: nowIso(),
      })
      .eq('id', appointmentId)
      .select('*')
      .single();

    if (updateError || !updatedAppointment?.id) {
      throw { status: 500, code: 'appointment_google_sync_update_failed', error: updateError };
    }

    await writeAuditLog(serviceClient, identity, 'sync_appointment_google_calendar', req, {
      target_type: 'appointment',
      target_id: appointmentId,
      client_id: asString(updatedAppointment.client_id),
      deal_id: asString(updatedAppointment.deal_id),
      after: {
        google_event_id: googleEventId,
        google_calendar_id: calendarId,
        html_link: asString(eventResponse.htmlLink),
      },
    });

    return {
      ok: true,
      appointment: updatedAppointment,
      event: {
        id: googleEventId,
        html_link: asString(eventResponse.htmlLink),
        status: asString(eventResponse.status),
      },
    };
  } catch (error) {
    const syncError = asString((error as Record<string, unknown>)?.message) || 'google_calendar_sync_failed';
    await schema
      .from('appointments')
      .update({
        google_sync_status: 'error',
        google_sync_error: syncError,
        google_last_synced_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', appointmentId);

    throw error;
  }
}

async function importGoogleCalendarEvents(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const connection = await getGoogleCalendarConnection(serviceClient, identity.user_id);
  if (!connection) throw { status: 409, code: 'google_calendar_not_connected' };

  const refreshedConnection = await refreshGoogleCalendarAccessToken(serviceClient, connection);
  const calendarId = asString(payload.calendar_id) || refreshedConnection.calendar_id || 'primary';

  const now = new Date();
  const fallbackFrom = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const fallbackTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const fromDate = asString(payload.date_from) ? new Date(String(payload.date_from)) : fallbackFrom;
  const toDate = asString(payload.date_to) ? new Date(String(payload.date_to)) : fallbackTo;
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw { status: 400, code: 'invalid_payload' };
  }

  const maxResults = clamp(asNumber(payload.max_results, 100), 10, 250);
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: fromDate.toISOString(),
    timeMax: toDate.toISOString(),
    maxResults: String(maxResults),
  });

  const googleEventsPayload = await googleCalendarRequest(
    refreshedConnection.access_token,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { method: 'GET' },
  );

  const eventItems = Array.isArray(googleEventsPayload.items)
    ? googleEventsPayload.items.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];

  const defaultClientId = asString(payload.default_client_id);
  const { data: clientsByEmail } = await schema
    .from('clients')
    .select('id, primary_email')
    .not('primary_email', 'is', null)
    .limit(1000);

  const emailToClientId = new Map<string, string>();
  for (const client of clientsByEmail || []) {
    const email = asString(client.primary_email);
    if (!email) continue;
    emailToClientId.set(email.toLowerCase(), String(client.id));
  }

  let importedCount = 0;
  let updatedCount = 0;
  let canceledCount = 0;
  let skippedCount = 0;

  for (const event of eventItems) {
    const eventId = asString(event.id);
    if (!eventId) {
      skippedCount += 1;
      continue;
    }

    const { data: existingAppointment } = await schema
      .from('appointments')
      .select('*')
      .eq('owner_user_id', identity.user_id)
      .eq('google_calendar_id', calendarId)
      .eq('google_event_id', eventId)
      .maybeSingle();

    const eventStatus = asString(event.status) || 'confirmed';
    if (eventStatus === 'cancelled') {
      if (existingAppointment?.id) {
        await schema
          .from('appointments')
          .update({
            status: 'canceled',
            google_sync_status: 'synced',
            google_last_synced_at: nowIso(),
            google_sync_error: null,
            updated_at: nowIso(),
          })
          .eq('id', existingAppointment.id);
        canceledCount += 1;
      } else {
        skippedCount += 1;
      }
      continue;
    }

    const start = isRecord(event.start) ? event.start : {};
    const end = isRecord(event.end) ? event.end : {};
    const startAt = asString(start.dateTime);
    const endAt = asString(end.dateTime);
    if (!startAt) {
      skippedCount += 1;
      continue;
    }

    let clientId = defaultClientId || asString(existingAppointment?.client_id);
    if (!clientId) {
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      for (const attendee of attendees) {
        if (!isRecord(attendee)) continue;
        const attendeeEmail = asString(attendee.email);
        if (!attendeeEmail) continue;
        const matchedClientId = emailToClientId.get(attendeeEmail.toLowerCase());
        if (matchedClientId) {
          clientId = matchedClientId;
          break;
        }
      }
    }

    if (!clientId) {
      skippedCount += 1;
      continue;
    }

    const normalizedEndAt = endAt || new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
    const appointmentStatus = mapGoogleEventStatusToAppointmentStatus(eventStatus, normalizedEndAt);

    const upsertPayload = {
      id: asString(existingAppointment?.id) || undefined,
      client_id: clientId,
      deal_id: asString(existingAppointment?.deal_id),
      owner_user_id: identity.user_id,
      title: asString(event.summary) || 'Compromisso Google Calendar',
      appointment_type: asString(payload.default_appointment_type) || asString(existingAppointment?.appointment_type) || 'meeting',
      status: appointmentStatus,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(normalizedEndAt).toISOString(),
      location: asString(event.location),
      notes: asString(event.description),
      source: 'google',
      google_event_id: eventId,
      google_calendar_id: calendarId,
      google_sync_status: 'synced',
      google_last_synced_at: nowIso(),
      google_sync_error: null,
    };

    const { data: appointment, error: upsertError } = await schema
      .from('appointments')
      .upsert(upsertPayload)
      .select('*')
      .single();

    if (upsertError || !appointment?.id) {
      skippedCount += 1;
      continue;
    }

    if (existingAppointment?.id) {
      updatedCount += 1;
    } else {
      importedCount += 1;
    }
  }

  await writeAuditLog(serviceClient, identity, 'import_google_calendar_events', req, {
    target_type: 'google_calendar_connection',
    target_id: identity.user_id,
    after: {
      calendar_id: calendarId,
      imported_count: importedCount,
      updated_count: updatedCount,
      canceled_count: canceledCount,
      skipped_count: skippedCount,
    },
  });

  return {
    ok: true,
    calendar_id: calendarId,
    total_events: eventItems.length,
    imported_count: importedCount,
    updated_count: updatedCount,
    canceled_count: canceledCount,
    skipped_count: skippedCount,
  };
}

async function enqueueAgentJob(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const jobType = asString(payload.job_type);
  const allowedJobTypes = new Set(['qualification', 'follow_up', 'broadcast_assistant', 'onboarding']);
  if (!jobType || !allowedJobTypes.has(jobType)) throw { status: 400, code: 'invalid_payload' };

  const scheduledAtRaw = asString(payload.scheduled_at) || nowIso();
  const parsedScheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(parsedScheduledAt.getTime())) throw { status: 400, code: 'invalid_payload' };

  const { data, error } = await schema.from('scheduled_agent_jobs').insert({
    job_type: jobType,
    client_id: asString(payload.client_id),
    conversation_id: asString(payload.conversation_id),
    deal_id: asString(payload.deal_id),
    status: 'pending',
    scheduled_at: parsedScheduledAt.toISOString(),
    payload: isRecord(payload.payload) ? payload.payload : {},
  }).select('*').single();

  if (error || !data?.id) throw { status: 500, code: 'agent_job_insert_failed', error };

  await writeAuditLog(serviceClient, identity, 'enqueue_agent_job', req, {
    target_type: 'agent_job',
    target_id: String(data.id),
    client_id: asString(data.client_id),
    deal_id: asString(data.deal_id),
    after: data,
  });

  return { ok: true, job: data };
}

async function listAiSettings(serviceClient: ReturnType<typeof createClient>) {
  const schema = crmSchema(serviceClient);
  const [{ data: settings }, { data: stageConfigs }, { data: pendingJobs }] = await Promise.all([
    schema.from('ai_settings').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    schema.from('ai_stage_config').select('*').order('stage_code', { ascending: true }),
    schema.from('scheduled_agent_jobs').select('id, job_type, status, scheduled_at, client_id').eq('status', 'pending').order('scheduled_at', { ascending: true }).limit(20),
  ]);

  return {
    ...(settings || {
      id: 'default',
      is_enabled: false,
      qualification_enabled: false,
      follow_up_enabled: false,
      broadcast_assistant_enabled: false,
      onboarding_assistant_enabled: false,
      model: null,
      timezone: 'America/Sao_Paulo',
      default_prompt: null,
      metadata: {},
    }),
    stage_configs: stageConfigs || [],
    pending_jobs: pendingJobs || [],
  };
}

async function listAiActionLogs(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const schema = crmSchema(serviceClient);
  const limit = clamp(asNumber(payload.limit, 50), 1, 200);

  const { data, error } = await schema
    .from('ai_action_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw { status: 500, code: 'ai_action_logs_query_failed', error };

  const rows = data || [];
  if (rows.length === 0) return [];

  const clientIds = Array.from(
    new Set(rows.map((row) => asString(row.client_id)).filter((id): id is string => Boolean(id))),
  );

  let clientNameById = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await schema.from('clients').select('id, company_name').in('id', clientIds);
    clientNameById = new Map((clients || []).map((client) => [String(client.id), String(client.company_name || '')]));
  }

  return rows.map((row) => ({
    ...row,
    client_company_name: asString(row.client_id) ? clientNameById.get(String(row.client_id)) || null : null,
  }));
}

async function upsertAiSettings(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const existing = await schema.from('ai_settings').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
  const settingsId = asString(payload.id) || existing.data?.id;

  const { data, error } = await schema.from('ai_settings').upsert({
    id: settingsId || undefined,
    is_enabled: asBoolean(payload.is_enabled, false),
    qualification_enabled: asBoolean(payload.qualification_enabled, false),
    follow_up_enabled: asBoolean(payload.follow_up_enabled, false),
    broadcast_assistant_enabled: asBoolean(payload.broadcast_assistant_enabled, false),
    onboarding_assistant_enabled: asBoolean(payload.onboarding_assistant_enabled, false),
    model: asString(payload.model),
    timezone: asString(payload.timezone) || 'America/Sao_Paulo',
    default_prompt: asString(payload.default_prompt),
    metadata: isRecord(payload.metadata) ? payload.metadata : {},
  }).select('*').single();

  if (error || !data?.id) throw { status: 500, code: 'ai_settings_upsert_failed', error };

  if (Array.isArray(payload.stage_configs)) {
    await schema.from('ai_stage_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const stageConfigs = payload.stage_configs.filter((item) => isRecord(item));
    if (stageConfigs.length > 0) {
      await schema.from('ai_stage_config').insert(stageConfigs.map((item) => ({
        stage_code: asString(item.stage_code),
        is_enabled: asBoolean(item.is_enabled, true),
        system_prompt: asString(item.system_prompt),
        prompt_version: Math.max(1, asNumber(item.prompt_version, 1)),
        metadata: isRecord(item.metadata) ? item.metadata : {},
      })));
    }
  }

  await writeAuditLog(serviceClient, identity, 'upsert_ai_settings', req, {
    target_type: 'ai_settings',
    target_id: String(data.id),
    after: data,
  });

  return { ok: true, settings: await listAiSettings(serviceClient) };
}

function deriveOfferReadyEvents(
  beforeDeal: Record<string, unknown>,
  afterDeal: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const events: Array<{ offer_code: string; event_at: string }> = [];
  const beforeContext = asRecord(beforeDeal.commercial_context);
  const afterContext = asRecord(afterDeal.commercial_context);
  const now = nowIso();

  const explicitOfferCode = asString(payload.offer_code) || asString(payload.next_offer_code);
  if (explicitOfferCode) {
    events.push({
      offer_code: explicitOfferCode,
      event_at: asString(payload.offer_at) || asString(payload.next_offer_at) || now,
    });
  }

  const beforeSessions = asNumber(beforeContext.mentorship_sessions_completed, 0);
  const afterSessions = asNumber(afterContext.mentorship_sessions_completed, 0);
  const mentorshipVariant = asString(afterDeal.mentorship_variant);
  const targetSessions = mentorshipTargetFromVariant(mentorshipVariant);
  if (mentorshipVariant === 'mentoria_1000_1_encontro' && afterSessions >= 1 && beforeSessions < 1) {
    events.push({ offer_code: 'upgrade_mentoria_500', event_at: now });
  }
  if (targetSessions > 0 && afterSessions >= targetSessions && beforeSessions < targetSessions) {
    events.push({ offer_code: 'solarzap_plan', event_at: now });
  }

  const beforeSoftware = asString(beforeDeal.software_status) || 'not_offered';
  const afterSoftware = asString(afterDeal.software_status) || beforeSoftware;
  if (['accepted', 'signed'].includes(afterSoftware) && !['accepted', 'signed'].includes(beforeSoftware)) {
    events.push({ offer_code: 'landing_page', event_at: now });
    events.push({ offer_code: 'mentoria_3x1000', event_at: addMinutesIso(now, 7 * 24 * 60) });
  }

  const beforeLanding = asString(beforeDeal.landing_page_status) || 'not_offered';
  const afterLanding = asString(afterDeal.landing_page_status) || beforeLanding;
  if (afterLanding === 'delivered' && beforeLanding !== 'delivered') {
    events.push({ offer_code: 'trafego_pago', event_at: now });
  }
  if (afterLanding === 'declined' && beforeLanding !== 'declined') {
    events.push({ offer_code: 'trafego_after_lp_declined', event_at: addMinutesIso(now, 7 * 24 * 60) });
  }

  const beforeTrial = asString(beforeDeal.trial_status) || 'not_offered';
  const afterTrial = asString(afterDeal.trial_status) || beforeTrial;
  if (afterTrial === 'accepted' && beforeTrial !== 'accepted') {
    events.push({
      offer_code: 'mentoria_4x1200',
      event_at: asString(afterContext.trial_ends_at) || addMinutesIso(now, 7 * 24 * 60),
    });
  }

  const beforeDeclinedOffer = asString(beforeContext.last_declined_offer_code);
  const afterDeclinedOffer = asString(afterContext.last_declined_offer_code);
  if (afterDeclinedOffer === 'mentoria_3x1000' && beforeDeclinedOffer !== 'mentoria_3x1000') {
    events.push({
      offer_code: 'landing_page_after_mentoria_declined',
      event_at: addMinutesIso(now, 3 * 24 * 60),
    });
  }

  const unique = new Map<string, { offer_code: string; event_at: string }>();
  for (const event of events) {
    unique.set(`${event.offer_code}:${event.event_at}`, event);
  }

  return Array.from(unique.values()).sort((left, right) => {
    const leftTime = new Date(left.event_at).getTime();
    const rightTime = new Date(right.event_at).getTime();
    return leftTime - rightTime;
  });
}

async function listAutomationRules(serviceClient: ReturnType<typeof createClient>) {
  const { data, error } = await crmSchema(serviceClient)
    .from('automation_rules')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw { status: 500, code: 'automation_rules_query_failed', error };
  return data || [];
}

async function upsertAutomationRule(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const automationId = asString(payload.automation_id) || asString(payload.id);
  const automationKey = asString(payload.automation_key);
  const before = automationId
    ? (await schema.from('automation_rules').select('*').eq('id', automationId).maybeSingle()).data
    : automationKey
      ? (await schema.from('automation_rules').select('*').eq('automation_key', automationKey).maybeSingle()).data
      : null;

  const effectiveAutomationKey = automationKey || asString(before?.automation_key) || `custom_${crypto.randomUUID()}`;
  const triggerEvent = asString(payload.trigger_event) || asString(before?.trigger_event);
  const channel = asString(payload.channel) || asString(before?.channel);
  const name = asString(payload.name) || asString(before?.name);
  if (!effectiveAutomationKey || !triggerEvent || !channel || !name) throw { status: 400, code: 'invalid_payload' };

  const { data, error } = await schema.from('automation_rules').upsert({
    id: automationId || asString(before?.id) || undefined,
    automation_key: effectiveAutomationKey,
    name,
    description: Object.prototype.hasOwnProperty.call(payload, 'description') ? asString(payload.description) : asString(before?.description),
    trigger_event: triggerEvent,
    condition: Object.prototype.hasOwnProperty.call(payload, 'condition') ? asRecord(payload.condition) : asRecord(before?.condition),
    channel,
    delay_minutes: Object.prototype.hasOwnProperty.call(payload, 'delay_minutes') ? asNumber(payload.delay_minutes, 0) : asNumber(before?.delay_minutes, 0),
    template: Object.prototype.hasOwnProperty.call(payload, 'template') ? asString(payload.template) : asString(before?.template),
    is_active: Object.prototype.hasOwnProperty.call(payload, 'is_active') ? asBoolean(payload.is_active, true) : asBoolean(before?.is_active, true),
    is_system: Object.prototype.hasOwnProperty.call(payload, 'is_system') ? asBoolean(payload.is_system, false) : asBoolean(before?.is_system, false),
    sort_order: Object.prototype.hasOwnProperty.call(payload, 'sort_order') ? asNumber(payload.sort_order, 0) : asNumber(before?.sort_order, 0),
    cancel_on_event_types: Object.prototype.hasOwnProperty.call(payload, 'cancel_on_event_types')
      ? normalizeTextArray(payload.cancel_on_event_types)
      : normalizeTextArray(before?.cancel_on_event_types),
    metadata: Object.prototype.hasOwnProperty.call(payload, 'metadata') ? asRecord(payload.metadata) : asRecord(before?.metadata),
  }).select('*').single();

  if (error || !data?.id) throw { status: 500, code: 'automation_rule_upsert_failed', error };

  await writeAuditLog(serviceClient, identity, 'upsert_automation_rule', req, {
    target_type: 'automation_rule',
    target_id: String(data.id),
    before,
    after: data,
  });

  return { ok: true, rule: data };
}

async function listAutomationRuns(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const schema = crmSchema(serviceClient);
  let query = schema
    .from('automation_runs')
    .select('*')
    .order('created_at', { ascending: false });

  const status = asString(payload.status);
  if (status) query = query.eq('status', status);
  const clientId = asString(payload.client_id);
  if (clientId) query = query.eq('client_id', clientId);
  const dealId = asString(payload.deal_id);
  if (dealId) query = query.eq('deal_id', dealId);

  const limit = clamp(asNumber(payload.limit, 100), 1, 200);
  const { data, error } = await query.limit(limit);
  if (error) throw { status: 500, code: 'automation_runs_query_failed', error };

  const rows = data || [];
  if (rows.length === 0) return [];

  const automationIds = Array.from(new Set(rows.map((row) => asString(row.automation_id)).filter((id): id is string => Boolean(id))));
  const clientIds = Array.from(new Set(rows.map((row) => asString(row.client_id)).filter((id): id is string => Boolean(id))));
  const [{ data: rules }, { data: clients }] = await Promise.all([
    automationIds.length > 0
      ? schema.from('automation_rules').select('id, name').in('id', automationIds)
      : Promise.resolve({ data: [], error: null }),
    clientIds.length > 0
      ? schema.from('clients').select('id, company_name').in('id', clientIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const ruleNameById = new Map((rules || []).map((rule) => [String(rule.id), asString(rule.name)]));
  const clientNameById = new Map((clients || []).map((client) => [String(client.id), asString(client.company_name)]));

  return rows.map((row) => ({
    ...row,
    automation_name: ruleNameById.get(String(row.automation_id || '')) || null,
    client_company_name: clientNameById.get(String(row.client_id || '')) || null,
  }));
}

async function getAutomationSettings(serviceClient: ReturnType<typeof createClient>) {
  return getAutomationSettingsRecord(serviceClient);
}

async function upsertAutomationSettings(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const before = await getAutomationSettingsRecord(serviceClient);
  const { data, error } = await schema.from('automation_settings').upsert({
    scope_key: INTERNAL_CRM_AUTOMATION_SCOPE_KEY,
    default_whatsapp_instance_id: Object.prototype.hasOwnProperty.call(payload, 'default_whatsapp_instance_id')
      ? asString(payload.default_whatsapp_instance_id)
      : asString(before.default_whatsapp_instance_id),
    admin_notification_numbers: Object.prototype.hasOwnProperty.call(payload, 'admin_notification_numbers')
      ? normalizeTextArray(payload.admin_notification_numbers).map((value) => normalizePhone(value)).filter(Boolean)
      : normalizeTextArray(before.admin_notification_numbers),
    notification_cooldown_minutes: Object.prototype.hasOwnProperty.call(payload, 'notification_cooldown_minutes')
      ? clamp(asNumber(payload.notification_cooldown_minutes, 60), 1, 1440)
      : clamp(asNumber(before.notification_cooldown_minutes, 60), 1, 1440),
  }).select('*').single();

  if (error || !data?.scope_key) throw { status: 500, code: 'automation_settings_upsert_failed', error };

  await writeAuditLog(serviceClient, identity, 'upsert_automation_settings', req, {
    target_type: 'automation_settings',
    target_id: String(data.scope_key),
    before,
    after: data,
  });

  return { ok: true, settings: data };
}

async function updateDealCommercialState(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const dealId = asString(payload.deal_id);
  if (!dealId) throw { status: 400, code: 'invalid_payload' };

  const { data: before, error: beforeError } = await schema.from('deals').select('*').eq('id', dealId).maybeSingle();
  if (beforeError) throw { status: 500, code: 'deal_query_failed', error: beforeError };
  if (!before?.id) throw { status: 404, code: 'not_found' };

  const commercialContext = Object.prototype.hasOwnProperty.call(payload, 'commercial_context')
    ? mergeRecord(before.commercial_context, payload.commercial_context)
    : asRecord(before.commercial_context);

  const patch: Record<string, unknown> = {
    updated_at: nowIso(),
    commercial_context: commercialContext,
  };
  if (Object.prototype.hasOwnProperty.call(payload, 'primary_offer_code')) patch.primary_offer_code = asString(payload.primary_offer_code);
  if (Object.prototype.hasOwnProperty.call(payload, 'closed_product_code')) patch.closed_product_code = asString(payload.closed_product_code);
  if (Object.prototype.hasOwnProperty.call(payload, 'mentorship_variant')) patch.mentorship_variant = asString(payload.mentorship_variant);
  if (Object.prototype.hasOwnProperty.call(payload, 'software_status')) patch.software_status = asString(payload.software_status) || 'not_offered';
  if (Object.prototype.hasOwnProperty.call(payload, 'landing_page_status')) patch.landing_page_status = asString(payload.landing_page_status) || 'not_offered';
  if (Object.prototype.hasOwnProperty.call(payload, 'traffic_status')) patch.traffic_status = asString(payload.traffic_status) || 'not_offered';
  if (Object.prototype.hasOwnProperty.call(payload, 'trial_status')) patch.trial_status = asString(payload.trial_status) || 'not_offered';
  if (Object.prototype.hasOwnProperty.call(payload, 'last_automation_key')) patch.last_automation_key = asString(payload.last_automation_key);

  if (Object.prototype.hasOwnProperty.call(payload, 'next_offer_code')) {
    patch.next_offer_code = asString(payload.next_offer_code);
    patch.next_offer_at = asString(payload.next_offer_at);
  }

  const { data: updatedDeal, error } = await schema.from('deals').update(patch).eq('id', dealId).select('*').single();
  if (error || !updatedDeal?.id) throw { status: 500, code: 'deal_commercial_update_failed', error };

  const derivedOffers = deriveOfferReadyEvents(before, updatedDeal, payload);
  let finalDeal = updatedDeal;

  if (!Object.prototype.hasOwnProperty.call(payload, 'next_offer_code') && derivedOffers.length > 0) {
    const nextOffer = derivedOffers[0];
    const { data: nextOfferDeal, error: nextOfferError } = await schema
      .from('deals')
      .update({
        next_offer_code: nextOffer.offer_code,
        next_offer_at: nextOffer.event_at,
        updated_at: nowIso(),
      })
      .eq('id', dealId)
      .select('*')
      .single();

    if (nextOfferError || !nextOfferDeal?.id) throw { status: 500, code: 'deal_next_offer_update_failed', error: nextOfferError };
    finalDeal = nextOfferDeal;
  }

  const automationResults = [];
  for (const offer of derivedOffers) {
    automationResults.push(await queueAutomationEvent(serviceClient, 'offer_ready', {
      client_id: asString(finalDeal.client_id),
      deal_id: String(finalDeal.id),
      offer_code: offer.offer_code,
      event_at: offer.event_at,
      event_key: `offer_ready:${dealId}:${offer.offer_code}:${offer.event_at}`,
      anchor_key: offer.offer_code,
    }, { processDueNow: true }));
  }

  await writeAuditLog(serviceClient, identity, 'update_deal_commercial_state', req, {
    target_type: 'deal',
    target_id: dealId,
    client_id: String(finalDeal.client_id || ''),
    deal_id: dealId,
    before,
    after: finalDeal,
  });

  return {
    ok: true,
    deal: finalDeal,
    automation: automationResults,
  };
}

async function testAutomationRule(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const automationId = asString(payload.automation_id);
  const automationKey = asString(payload.automation_key);

  const { data: rule, error: ruleError } = automationId
    ? await schema.from('automation_rules').select('*').eq('id', automationId).maybeSingle()
    : await schema.from('automation_rules').select('*').eq('automation_key', automationKey).maybeSingle();

  if (ruleError) throw { status: 500, code: 'automation_rule_query_failed', error: ruleError };
  if (!rule?.id) throw { status: 404, code: 'not_found' };

  const context = await resolveAutomationContextEntities(serviceClient, payload);
  const templatePayload = buildAutomationTemplatePayload(context, payload, asString(rule.trigger_event) || 'manual_test');

  const { data: run, error } = await schema.from('automation_runs').insert({
    automation_id: rule.id,
    automation_key: rule.automation_key,
    client_id: asString(templatePayload.client_id),
    deal_id: asString(templatePayload.deal_id),
    appointment_id: asString(templatePayload.appointment_id),
    conversation_id: asString(templatePayload.conversation_id),
    trigger_event: rule.trigger_event,
    channel: rule.channel,
    scheduled_at: nowIso(),
    dedupe_key: `test:${String(rule.id)}:${crypto.randomUUID()}`,
    payload: mergeRecord(templatePayload, {
      automation_name: asString(rule.name),
      automation_key: asString(rule.automation_key),
      template_body: renderAutomationTemplate(asString(rule.template), templatePayload),
      event_key: `test:${String(rule.id)}`,
      rule_metadata: asRecord(rule.metadata),
    }),
  }).select('*').single();

  if (error || !run?.id) throw { status: 500, code: 'automation_test_insert_failed', error };

  const processed = await processAutomationRunsWithOptions(serviceClient, { runIds: [String(run.id)], limit: 1 });
  const { data: finalRun } = await schema.from('automation_runs').select('*').eq('id', run.id).maybeSingle();

  await writeAuditLog(serviceClient, identity, 'test_automation_rule', req, {
    target_type: 'automation_rule',
    target_id: String(rule.id),
    client_id: asString(finalRun?.client_id),
    deal_id: asString(finalRun?.deal_id),
    after: finalRun,
  });

  return {
    ok: true,
    rule,
    run: finalRun || run,
    processed,
  };
}

async function intakeLandingLead(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const companyName = asString(payload.company_name) || asString(payload.nome_empresa) || asString(payload.nome) || 'Lead LP';
  const primaryContactName = asString(payload.primary_contact_name) || asString(payload.nome) || companyName;
  const primaryPhone = normalizePhone(payload.primary_phone || payload.phone || payload.whatsapp);
  const primaryEmail = asString(payload.primary_email) || asString(payload.email);
  const linkedPublicOrgId = asString(payload.linked_public_org_id);
  const linkedPublicUserId = asString(payload.linked_public_user_id);
  const trackingSnapshot = buildTrackingSnapshot(isRecord(payload.tracking) ? payload.tracking : null);
  const suppressAutomation = asBoolean(payload.suppress_automation, false);
  if (!companyName || !primaryPhone) throw { status: 400, code: 'invalid_payload' };

  const hasScheduledCall = asBoolean(payload.has_scheduled_call, Boolean(asString(payload.scheduled_at) || asString(payload.appointment_start_at)));
  const appointmentStartAt = asString(payload.scheduled_at) || asString(payload.appointment_start_at);

  let client = null;
  const contactLookup = await schema.from('client_contacts').select('*').eq('phone', primaryPhone).maybeSingle();
  if (contactLookup.data?.client_id) {
    client = (await schema.from('clients').select('*').eq('id', contactLookup.data.client_id).maybeSingle()).data;
  }
  if (!client?.id && primaryEmail) {
    client = (await schema.from('clients').select('*').eq('primary_email', primaryEmail).maybeSingle()).data;
  }
  if (!client?.id) {
    client = (await schema.from('clients').insert({
      company_name: companyName,
      primary_contact_name: primaryContactName,
      primary_phone: primaryPhone,
      primary_email: primaryEmail,
      source_channel: 'landing_page',
      owner_user_id: asString(payload.owner_user_id) || identity.user_id,
      current_stage_code: hasScheduledCall ? 'chamada_agendada' : 'novo_lead',
      lifecycle_status: 'lead',
      last_contact_at: nowIso(),
      linked_public_org_id: linkedPublicOrgId,
      linked_public_user_id: linkedPublicUserId,
      metadata: asRecord(payload.client_metadata),
    }).select('*').single()).data;
  } else {
    client = (await schema.from('clients').update({
      company_name: companyName,
      primary_contact_name: primaryContactName,
      primary_phone: primaryPhone,
      primary_email: primaryEmail,
      source_channel: 'landing_page',
      owner_user_id: asString(payload.owner_user_id) || asString(client.owner_user_id) || identity.user_id,
      current_stage_code: hasScheduledCall ? 'chamada_agendada' : resolveBlueprintStageCode(client.current_stage_code, 'novo_lead'),
      linked_public_org_id: linkedPublicOrgId || asString(client.linked_public_org_id),
      linked_public_user_id: linkedPublicUserId || asString(client.linked_public_user_id),
      updated_at: nowIso(),
      metadata: mergeRecord(client.metadata, payload.client_metadata),
    }).eq('id', client.id).select('*').single()).data;
  }

  if (!client?.id) throw { status: 500, code: 'landing_lead_client_upsert_failed' };

  await ensurePrimaryContactForClient(schema, client);

  const existingDeal = (await schema
    .from('deals')
    .select('*')
    .eq('client_id', client.id)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()).data;

  const dealCommercialContext = mergeRecord(existingDeal?.commercial_context, {
    source: 'landing_page',
    scheduling_link: asString(payload.link_agendamento) || asString(payload.scheduling_link),
    meeting_link: asString(payload.link_reuniao) || asString(payload.meeting_link),
    form_payload: asRecord(payload.form_payload),
    attribution: trackingSnapshot,
  });

  const dealStageCode = hasScheduledCall ? 'chamada_agendada' : 'novo_lead';
  const { data: deal, error: dealError } = await schema.from('deals').upsert({
    id: asString(payload.deal_id) || asString(existingDeal?.id) || undefined,
    client_id: client.id,
    title: asString(payload.deal_title) || `Oportunidade ARKAN - ${companyName}`,
    owner_user_id: asString(payload.owner_user_id) || asString(existingDeal?.owner_user_id) || identity.user_id,
    stage_code: dealStageCode,
    status: resolveDealStatusForStage(dealStageCode, asString(existingDeal?.status) || 'open'),
    probability: resolveStageProbability(dealStageCode, asNumber(existingDeal?.probability, 0)),
    expected_close_at: appointmentStartAt,
    primary_offer_code: asString(payload.primary_offer_code) || asString(existingDeal?.primary_offer_code) || 'landing_page',
    commercial_context: dealCommercialContext,
    updated_at: nowIso(),
  }).select('*').single();

  if (dealError || !deal?.id) throw { status: 500, code: 'landing_lead_deal_upsert_failed', error: dealError };

  await schema.from('clients').update({
    current_stage_code: dealStageCode,
    updated_at: nowIso(),
  }).eq('id', client.id);

  let appointment = null;
  if (hasScheduledCall && appointmentStartAt) {
    const parsedAppointmentAt = new Date(appointmentStartAt);
    if (Number.isNaN(parsedAppointmentAt.getTime())) throw { status: 400, code: 'invalid_payload' };

    const { data: appointmentData, error: appointmentError } = await schema.from('appointments').insert({
      client_id: client.id,
      deal_id: deal.id,
      owner_user_id: asString(payload.owner_user_id) || identity.user_id,
      title: asString(payload.appointment_title) || `Chamada ARKAN - ${companyName}`,
      appointment_type: asString(payload.appointment_type) || 'call',
      status: 'scheduled',
      start_at: parsedAppointmentAt.toISOString(),
      location: asString(payload.link_reuniao) || asString(payload.meeting_link),
      metadata: {
        meeting_link: asString(payload.link_reuniao) || asString(payload.meeting_link),
        scheduling_link: asString(payload.link_agendamento) || asString(payload.scheduling_link),
      },
    }).select('*').single();

    if (appointmentError || !appointmentData?.id) throw { status: 500, code: 'landing_lead_appointment_insert_failed', error: appointmentError };
    appointment = appointmentData;
  }

  const intakePayload = {
    client_id: String(client.id),
    deal_id: String(deal.id),
    appointment_id: asString(appointment?.id),
    nome: primaryContactName,
    empresa: companyName,
    primary_phone: primaryPhone,
    primary_email: primaryEmail,
    has_scheduled_call: hasScheduledCall,
    link_agendamento: asString(payload.link_agendamento) || asString(payload.scheduling_link),
    link_reuniao: asString(payload.link_reuniao) || asString(payload.meeting_link),
    appointment_start_at: appointment?.start_at,
    event_at: nowIso(),
    event_key: `lp_form_submitted:${String(client.id)}:${nowIso()}`,
  };

  const automation = suppressAutomation
    ? []
    : [
        await queueAutomationEvent(serviceClient, 'lp_form_submitted', intakePayload, { processDueNow: true }),
      ];

  if (!suppressAutomation && appointment?.id) {
    automation.push(await queueAutomationEvent(serviceClient, 'appointment_scheduled', {
      ...intakePayload,
      appointment_id: String(appointment.id),
      appointment_type: asString(appointment.appointment_type) || 'call',
      appointment_start_at: appointment.start_at,
      event_at: appointment.start_at,
      event_key: `appointment_scheduled:${String(appointment.id)}:${appointment.start_at}`,
    }, { processDueNow: true }));
  }

  await writeAuditLog(serviceClient, identity, 'intake_landing_lead', req, {
    target_type: 'client',
    target_id: String(client.id),
    client_id: String(client.id),
    deal_id: String(deal.id),
    after: {
      client,
      deal,
      appointment,
    },
  });

  return {
    ok: true,
    client,
    deal,
    appointment,
    automation,
  };
}

async function listFinanceSummary(serviceClient: ReturnType<typeof createClient>) {
  const schema = crmSchema(serviceClient);
  const [ordersResult, subscriptionsResult, paymentEventsResult, dealsResult] = await Promise.all([
    schema.from('orders').select('*').order('created_at', { ascending: false }).limit(50),
    schema.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(50),
    schema.from('payment_events').select('*').order('created_at', { ascending: false }).limit(100),
    schema.from('deals').select('status, payment_status, one_time_total_cents, mrr_cents'),
  ]);

  if (ordersResult.error || subscriptionsResult.error || paymentEventsResult.error || dealsResult.error) {
    throw { status: 500, code: 'finance_query_failed' };
  }

  const orders = ordersResult.data || [];
  const subscriptions = subscriptionsResult.data || [];
  const paymentEvents = paymentEventsResult.data || [];
  const deals = dealsResult.data || [];

  return {
    revenue_one_time_cents:
      orders.reduce((sum, row) => sum + (String(row.status) === 'paid' ? asNumber(row.total_cents, 0) : 0), 0) ||
      deals.reduce((sum, row) => sum + (String(row.status) === 'won' ? asNumber(row.one_time_total_cents, 0) : 0), 0),
    mrr_sold_cents: deals.reduce((sum, row) => sum + (String(row.status) === 'won' ? asNumber(row.mrr_cents, 0) : 0), 0),
    mrr_active_cents: subscriptions.reduce((sum, row) => sum + (['active', 'trialing'].includes(String(row.status)) ? asNumber(row.mrr_cents, 0) : 0), 0),
    pending_payments_count: deals.filter((row) => String(row.payment_status || '') === 'pending').length,
    churned_count: subscriptions.filter((row) => String(row.status || '') === 'canceled').length,
    orders,
    subscriptions,
    payment_events: paymentEvents,
  };
}

async function listCustomerSnapshot(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  const schema = crmSchema(serviceClient);
  const clientId = asString(payload.client_id);

  let query = schema
    .from('customer_app_snapshot')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data: snapshots, error } = await query;
  if (error) throw { status: 500, code: 'snapshot_query_failed', error };

  const rows = snapshots || [];
  const clientIds = rows.map((row) => asString(row.client_id)).filter(Boolean) as string[];

  let companyByClientId = new Map<string, string | null>();
  if (clientIds.length > 0) {
    const { data: clients } = await schema
      .from('clients')
      .select('id, company_name')
      .in('id', clientIds);

    companyByClientId = new Map((clients || []).map((row) => [String(row.id), asString(row.company_name)]));
  }

  return rows.map((row) => ({
    ...row,
    company_name: companyByClientId.get(String(row.client_id)) || null,
  }));
}

async function refreshCustomerSnapshot(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const schema = crmSchema(serviceClient);
  const clientId = asString(payload.client_id);

  let linksQuery = schema
    .from('customer_app_links')
    .select('client_id, linked_public_org_id')
    .not('linked_public_org_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (clientId) {
    linksQuery = linksQuery.eq('client_id', clientId);
  }

  const { data: links, error: linksError } = await linksQuery;
  if (linksError) throw { status: 500, code: 'snapshot_links_query_failed', error: linksError };

  const failures: Array<{ client_id: string; reason: string }> = [];
  const updatedClientIds: string[] = [];

  for (const link of links || []) {
    const linkedOrgId = asString(link.linked_public_org_id);
    const linkedClientId = asString(link.client_id);
    if (!linkedOrgId || !linkedClientId) continue;

    try {
      const { data, error } = await serviceClient.rpc('crm_bridge_org_summary', { p_org_id: linkedOrgId });
      if (error) {
        failures.push({ client_id: linkedClientId, reason: 'bridge_query_failed' });
        continue;
      }

      const payloadData = Array.isArray(data) ? data[0] : data;
      const found = isRecord(payloadData) && asBoolean(payloadData.found, false);
      const org = isRecord(payloadData) && isRecord(payloadData.org) ? payloadData.org : {};
      const stats = isRecord(payloadData) && isRecord(payloadData.stats) ? payloadData.stats : {};

      const { error: upsertError } = await schema.from('customer_app_snapshot').upsert({
        client_id: linkedClientId,
        plan_key: found ? asString(org.plan) : null,
        subscription_status: found ? asString(org.subscription_status) : null,
        trial_ends_at: found ? asString(org.trial_ends_at) : null,
        grace_ends_at: found ? asString(org.grace_ends_at) : null,
        current_period_end: found ? asString(org.current_period_end) : null,
        member_count: found ? asNumber(stats.member_count, 0) : 0,
        whatsapp_instance_count: found ? asNumber(stats.instance_count, 0) : 0,
        lead_count: found ? asNumber(stats.lead_count, 0) : 0,
        proposal_count: found ? asNumber(stats.proposal_count, 0) : 0,
        last_synced_at: nowIso(),
        payload: isRecord(payloadData) ? payloadData : {},
      }, { onConflict: 'client_id' });

      if (upsertError) {
        failures.push({ client_id: linkedClientId, reason: 'snapshot_upsert_failed' });
        continue;
      }

      updatedClientIds.push(linkedClientId);
    } catch {
      failures.push({ client_id: linkedClientId, reason: 'snapshot_refresh_failed' });
    }
  }

  await writeAuditLog(serviceClient, identity, 'refresh_customer_snapshot', req, {
    target_type: 'snapshot',
    target_id: clientId || null,
    client_id: clientId || null,
    after: {
      updated_count: updatedClientIds.length,
      failed_count: failures.length,
    },
  });

  return {
    ok: true,
    updated_count: updatedClientIds.length,
    failed_count: failures.length,
    failures,
  };
}

async function getLinkedPublicOrgSummary(serviceClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const orgId = asString(payload.org_id);
  const clientId = asString(payload.client_id);
  let resolvedOrgId = orgId;

  if (!resolvedOrgId && clientId) {
    const { data: appLink } = await crmSchema(serviceClient).from('customer_app_links').select('linked_public_org_id').eq('client_id', clientId).maybeSingle();
    resolvedOrgId = asString(appLink?.linked_public_org_id);
  }

  if (!resolvedOrgId) throw { status: 400, code: 'invalid_payload' };
  const { data, error } = await serviceClient.rpc('crm_bridge_org_summary', { p_org_id: resolvedOrgId });
  if (error) throw { status: 500, code: 'bridge_query_failed', error };
  return Array.isArray(data) ? data[0] : data;
}

async function createDealCheckoutLink(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const dealId = asString(payload.deal_id);
  if (!dealId) throw { status: 400, code: 'invalid_payload' };
  const schema = crmSchema(serviceClient);
  const stripe = getStripeClient();

  const requestedClientId = asString(payload.client_id);
  const [{ data: deal }, { data: items }, { data: client }] = await Promise.all([
    schema.from('deals').select('*').eq('id', dealId).maybeSingle(),
    schema.from('deal_items').select('*').eq('deal_id', dealId),
    requestedClientId
      ? schema.from('clients').select('*').eq('id', requestedClientId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const effectiveDeal = deal;
  if (!effectiveDeal?.id) throw { status: 404, code: 'not_found' };
  const effectiveClient = client?.id
    ? client
    : (await schema.from('clients').select('*').eq('id', effectiveDeal.client_id).maybeSingle()).data;
  if (!effectiveClient?.id) throw { status: 404, code: 'not_found' };

  const lineItems = (items || []).filter((item) => ['stripe', 'hybrid'].includes(String(item.payment_method || '')));
  if (lineItems.length === 0) {
    throw { status: 400, code: 'invalid_payload', message: 'Deal sem itens Stripe para gerar checkout.' };
  }

  const customer = await stripe.customers.create({
    name: String(effectiveClient.company_name || effectiveClient.primary_contact_name || 'Cliente CRM'),
    email: asString(effectiveClient.primary_email) || undefined,
    phone: normalizePhone(effectiveClient.primary_phone || '') || undefined,
    metadata: {
      internal_crm_client_id: String(effectiveClient.id),
      internal_crm_deal_id: String(effectiveDeal.id),
    },
  });

  const mode = lineItems.some((item) => String(item.billing_type || '') === 'recurring') ? 'subscription' : 'payment';
  const stripeLineItems = lineItems.map((item) => {
    const stripePriceId = asString(item.stripe_price_id);
    if (stripePriceId) {
      return { price: stripePriceId, quantity: Math.max(1, asNumber(item.quantity, 1)) };
    }

    return {
      price_data: {
        currency: 'brl',
        unit_amount: asNumber(item.unit_price_cents, 0),
        ...(String(item.billing_type || '') === 'recurring' ? { recurring: { interval: 'month' } } : {}),
        product_data: {
          name: String(item.product_code || 'Produto CRM'),
        },
      },
      quantity: Math.max(1, asNumber(item.quantity, 1)),
    };
  });

  const appUrl = resolveAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode,
    customer: customer.id,
    success_url: `${appUrl}/admin/crm/clients?checkout=success&deal=${effectiveDeal.id}`,
    cancel_url: `${appUrl}/admin/crm/clients?checkout=cancel&deal=${effectiveDeal.id}`,
    line_items: stripeLineItems as never,
    metadata: {
      internal_crm_client_id: String(effectiveClient.id),
      internal_crm_deal_id: String(effectiveDeal.id),
      internal_crm_actor_user_id: identity.user_id,
    },
    ...(mode === 'subscription'
      ? {
          subscription_data: {
            metadata: {
              internal_crm_client_id: String(effectiveClient.id),
              internal_crm_deal_id: String(effectiveDeal.id),
            },
          },
        }
      : {}),
  });

  const { data, error } = await schema.from('deals').update({
    payment_method: 'stripe',
    checkout_url: session.url,
    stripe_checkout_session_id: session.id,
    payment_status: 'pending',
    updated_at: nowIso(),
  }).eq('id', effectiveDeal.id).select('*').single();

  if (error || !data?.id) throw { status: 500, code: 'deal_checkout_update_failed', error };

  await writeAuditLog(serviceClient, identity, 'create_deal_checkout_link', req, {
    target_type: 'deal',
    target_id: String(data.id),
    client_id: String(effectiveClient.id),
    deal_id: String(data.id),
    after: { stripe_checkout_session_id: session.id, checkout_url: session.url },
  });

  return {
    ok: true,
    checkout_url: session.url,
    stripe_checkout_session_id: session.id,
    deal: data,
  };
}

async function provisionCustomer(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
  userToken: string,
) {
  const clientId = asString(payload.client_id);
  if (!clientId) throw { status: 400, code: 'invalid_payload' };
  const schema = crmSchema(serviceClient);

  const [{ data: client }, { data: existingLink }, { data: deal }] = await Promise.all([
    schema.from('clients').select('*').eq('id', clientId).maybeSingle(),
    schema.from('customer_app_links').select('*').eq('client_id', clientId).maybeSingle(),
    payload.deal_id ? schema.from('deals').select('*').eq('id', asString(payload.deal_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (!client?.id) throw { status: 404, code: 'not_found' };

  const recurringPlanCode = deal?.mrr_cents > 0
    ? (await schema.from('deal_items').select('product_code').eq('deal_id', deal.id).eq('billing_type', 'recurring').limit(1).maybeSingle()).data?.product_code
    : null;

  const requestedPlan =
    String(payload.plan || recurringPlanCode || '').trim() ||
    (deal?.mrr_cents > 0 ? 'start' : 'free');

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const adminApiResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/admin-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      action: 'create_org_with_user',
      _admin_access_token: userToken,
      email: client.primary_email,
      org_name: client.company_name,
      plan: requestedPlan,
      start_trial: requestedPlan !== 'free',
    }),
  });

  const adminApiPayload = await adminApiResponse.json().catch(() => null);
  if (!adminApiResponse.ok || !isRecord(adminApiPayload) || adminApiPayload.ok === false) {
    await schema.from('customer_app_links').upsert({
      id: existingLink?.id || undefined,
      client_id: clientId,
      provisioning_status: 'failed',
      last_error: isRecord(adminApiPayload) ? String(adminApiPayload.error || adminApiPayload.message || 'admin_api_failed') : 'admin_api_failed',
    }, { onConflict: 'client_id' });
    throw { status: 500, code: 'provisioning_failed', details: adminApiPayload };
  }

  const orgId = asString(adminApiPayload.org_id);
  const ownerUserId = asString(adminApiPayload.user_id);

  const { data: linkData, error: linkError } = await schema.from('customer_app_links').upsert({
    id: existingLink?.id || undefined,
    client_id: clientId,
    linked_public_org_id: orgId,
    linked_public_owner_user_id: ownerUserId,
    provisioned_at: nowIso(),
    provisioning_status: 'provisioned',
    last_error: null,
    metadata: {
      requested_plan: requestedPlan,
      provisioned_by: identity.user_id,
    },
  }, { onConflict: 'client_id' }).select('*').single();

  if (linkError || !linkData?.id) throw { status: 500, code: 'customer_link_upsert_failed', error: linkError };

  await schema.from('clients').update({
    linked_public_org_id: orgId,
    linked_public_user_id: ownerUserId,
    lifecycle_status: 'customer_onboarding',
    updated_at: nowIso(),
  }).eq('id', clientId);

  if (deal?.id) {
    await schema.from('deals').update({
      status: 'won',
      won_at: deal.won_at || nowIso(),
      closed_at: deal.closed_at || nowIso(),
      payment_status: deal.payment_method === 'manual' ? 'paid' : deal.payment_status,
      paid_at: deal.payment_method === 'manual' && !deal.paid_at ? nowIso() : deal.paid_at,
      updated_at: nowIso(),
    }).eq('id', deal.id);
  }

  await writeAuditLog(serviceClient, identity, 'provision_customer', req, {
    target_type: 'client',
    target_id: clientId,
    client_id: clientId,
    deal_id: deal?.id ? String(deal.id) : null,
    after: linkData,
  });

  return {
    ok: true,
    app_link: linkData,
    linked_public_org_summary: orgId ? await getLinkedPublicOrgSummary(serviceClient, { org_id: orgId }) : null,
  };
}

async function handleWebhookInbound(serviceClient: ReturnType<typeof createClient>, body: Record<string, unknown>) {
  const schema = crmSchema(serviceClient);
  const instanceName =
    asString(body.instance) ||
    asString(body.instanceName) ||
    asString((body.data as Record<string, unknown> | undefined)?.instance) ||
    asString((body.data as Record<string, unknown> | undefined)?.instanceName);

  if (!instanceName) {
    return { ok: true, ignored: true, reason: 'missing_instance_name' };
  }

  const { data: instance } = await schema.from('whatsapp_instances').select('*').eq('instance_name', instanceName).maybeSingle();
  if (!instance?.id) {
    return { ok: true, ignored: true, reason: 'instance_not_found' };
  }

  const messageNode = isRecord(body.data) ? body.data : body;
  const rawRemoteJid =
    asString(messageNode.remoteJid) ||
    asString((messageNode.key as Record<string, unknown> | undefined)?.remoteJid) ||
    asString(messageNode.number);
  const remoteJid = normalizeRemoteJid(rawRemoteJid);
  const phone = normalizePhone(remoteJid || rawRemoteJid || '');
  const waMessageId =
    asString((messageNode.key as Record<string, unknown> | undefined)?.id) ||
    asString(messageNode.id);
  const bodyText =
    asString((messageNode.message as Record<string, unknown> | undefined)?.conversation) ||
    asString(((messageNode.message as Record<string, unknown> | undefined)?.extendedTextMessage as Record<string, unknown> | undefined)?.text) ||
    asString(messageNode.text) ||
    asString(messageNode.body);

  if (!phone || !bodyText) {
    return { ok: true, ignored: true, reason: 'missing_phone_or_body' };
  }

  const contactLookup = await schema.from('client_contacts').select('*').eq('phone', phone).maybeSingle();
  let client = null;
  let contact = contactLookup.data;
  if (contact?.client_id) {
    client = (await schema.from('clients').select('*').eq('id', contact.client_id).maybeSingle()).data;
  }

  if (!client?.id) {
    const directClient = await schema.from('clients').select('*').eq('primary_phone', phone).maybeSingle();
    client = directClient.data;
  }

  if (!client?.id) {
    const createdClient = await schema.from('clients').insert({
      company_name: `Lead ${phone}`,
      primary_contact_name: `Contato ${phone}`,
      primary_phone: phone,
      source_channel: 'whatsapp',
      owner_user_id: null,
      current_stage_code: 'novo_lead',
      lifecycle_status: 'lead',
      last_contact_at: nowIso(),
    }).select('*').single();
    client = createdClient.data;
  }

  if (!contact?.id) {
    const createdContact = await schema.from('client_contacts').insert({
      client_id: client.id,
      name: client.primary_contact_name || `Contato ${phone}`,
      phone,
      email: client.primary_email,
      role_label: 'Contato principal',
      is_primary: true,
    }).select('*').single();
    contact = createdContact.data;
  }

  let conversation = (await schema
    .from('conversations')
    .select('*')
    .eq('client_id', client.id)
    .eq('whatsapp_instance_id', instance.id)
    .eq('status', 'open')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()).data;

  if (!conversation?.id) {
    conversation = (await schema.from('conversations').insert({
      client_id: client.id,
      contact_id: contact?.id || null,
      whatsapp_instance_id: instance.id,
      channel: 'whatsapp',
      status: 'open',
      subject: client.company_name,
      last_message_at: nowIso(),
      last_message_preview: bodyText,
    }).select('*').single()).data;
  }

  if (waMessageId) {
    const existingMessage = await schema.from('messages').select('id').eq('wa_message_id', waMessageId).maybeSingle();
    if (existingMessage.data?.id) {
      return { ok: true, duplicate: true };
    }
  }

  const { data: message, error: messageError } = await schema.from('messages').insert({
    conversation_id: conversation.id,
    whatsapp_instance_id: instance.id,
    direction: 'inbound',
    body: bodyText,
    message_type: 'text',
    wa_message_id: waMessageId,
    remote_jid: remoteJid,
    delivery_status: 'delivered',
    metadata: body,
  }).select('*').single();

  if (messageError || !message?.id) {
    throw { status: 500, code: 'webhook_message_insert_failed', error: messageError };
  }

  await schema.from('conversations').update({
    last_message_at: message.created_at,
    last_message_preview: bodyText,
    updated_at: nowIso(),
  }).eq('id', conversation.id);

  await schema.from('clients').update({
    primary_phone: client.primary_phone || phone,
    last_contact_at: message.created_at,
    current_stage_code: resolveBlueprintStageCode(client.current_stage_code, 'novo_lead') === 'novo_lead' ? 'respondeu' : resolveBlueprintStageCode(client.current_stage_code, 'novo_lead'),
    updated_at: nowIso(),
  }).eq('id', client.id);

  return { ok: true, message };
}

async function processAgentJobs(serviceClient: ReturnType<typeof createClient>) {
  return processAgentJobsWithOptions(serviceClient, {});
}

async function resolveConnectedInternalCrmInstance(
  schema: ReturnType<typeof crmSchema>,
  preferredInstanceId: string | null,
) {
  if (preferredInstanceId) {
    const { data: preferred } = await schema
      .from('whatsapp_instances')
      .select('id, instance_name, status')
      .eq('id', preferredInstanceId)
      .eq('status', 'connected')
      .maybeSingle();

    if (preferred?.id) return preferred;
  }

  const { data: fallback } = await schema
    .from('whatsapp_instances')
    .select('id, instance_name, status')
    .eq('status', 'connected')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback || null;
}

async function ensurePrimaryContactForClient(
  schema: ReturnType<typeof crmSchema>,
  client: Record<string, unknown>,
) {
  const clientId = asString(client.id);
  if (!clientId) return null;

  const { data: existing } = await schema
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_primary', true)
    .maybeSingle();

  if (existing?.id) return existing;

  const { data } = await schema
    .from('client_contacts')
    .insert({
      client_id: clientId,
      name: asString(client.primary_contact_name) || asString(client.company_name) || 'Contato principal',
      phone: normalizePhone(client.primary_phone) || null,
      email: asString(client.primary_email),
      role_label: 'Contato principal',
      is_primary: true,
    })
    .select('*')
    .single();

  return data || null;
}

async function ensureWhatsappConversationForClient(
  schema: ReturnType<typeof crmSchema>,
  client: Record<string, unknown>,
  instanceId: string,
) {
  const clientId = asString(client.id);
  if (!clientId) return null;

  const { data: existing } = await schema
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .eq('channel', 'whatsapp')
    .eq('whatsapp_instance_id', instanceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing;

  const contact = await ensurePrimaryContactForClient(schema, client);
  const { data } = await schema
    .from('conversations')
    .insert({
      client_id: clientId,
      contact_id: asString(contact?.id),
      whatsapp_instance_id: instanceId,
      channel: 'whatsapp',
      status: 'open',
      subject: asString(client.company_name) || asString(client.primary_contact_name) || 'CRM interno',
      last_message_at: nowIso(),
      last_message_preview: null,
    })
    .select('*')
    .single();

  return data || null;
}

async function isAutomationRunInCooldown(
  schema: ReturnType<typeof crmSchema>,
  settings: Record<string, unknown>,
  run: Record<string, unknown>,
) {
  if (asString(run.channel) !== 'whatsapp_admin') return false;

  const cooldownMinutes = clamp(asNumber(settings.notification_cooldown_minutes, 60), 1, 1440);
  const threshold = new Date(Date.now() - (cooldownMinutes * 60_000)).toISOString();

  let query = schema
    .from('automation_runs')
    .select('id')
    .eq('automation_key', asString(run.automation_key) || '')
    .eq('status', 'completed')
    .gte('processed_at', threshold)
    .neq('id', asString(run.id) || '');

  if (asString(run.client_id)) query = query.eq('client_id', asString(run.client_id));
  else if (asString(run.deal_id)) query = query.eq('deal_id', asString(run.deal_id));
  else return false;

  const { data } = await query.limit(1).maybeSingle();
  return Boolean(data?.id);
}

async function createAutomationTaskFromRule(
  schema: ReturnType<typeof crmSchema>,
  rule: Record<string, unknown>,
  run: Record<string, unknown>,
  templatePayload: Record<string, unknown>,
) {
  const metadata = mergeRecord(asRecord(rule.metadata), asRecord(asRecord(run.payload).rule_metadata));
  const shouldCreateTask = asBoolean(metadata.create_task, asString(rule.channel) === 'internal_task');
  if (!shouldCreateTask) return null;

  const titleSource =
    asString(metadata.task_title) ||
    asString(templatePayload.task_title) ||
    asString(rule.name) ||
    'Acompanhar automacao';
  const notesSource =
    asString(metadata.task_notes) ||
    asString(templatePayload.task_notes) ||
    asString(asRecord(run.payload).template_body) ||
    asString(rule.description);

  const title = renderAutomationTemplate(titleSource, templatePayload) || titleSource;
  const notes = notesSource ? renderAutomationTemplate(notesSource, templatePayload) || notesSource : null;

  const { data, error } = await schema
    .from('tasks')
    .insert({
      client_id: asString(run.client_id),
      deal_id: asString(run.deal_id),
      owner_user_id: null,
      title,
      notes,
      due_at: asString(templatePayload.task_due_at) || asString(run.scheduled_at) || nowIso(),
      status: 'open',
      task_kind: asString(metadata.task_kind) || (asString(rule.channel) === 'internal_task' ? 'system' : 'next_action'),
      metadata: {
        automation_run_id: asString(run.id),
        automation_key: asString(run.automation_key),
        trigger_event: asString(run.trigger_event),
      },
    })
    .select('*')
    .single();

  if (error || !data?.id) throw { status: 500, code: 'automation_task_insert_failed', error };

  if (data.client_id && String(data.task_kind || '') === 'next_action') {
    await schema.from('clients').update({
      next_action: data.title,
      next_action_at: data.due_at,
      updated_at: nowIso(),
    }).eq('id', data.client_id);
  }

  return data;
}

async function dispatchAutomationWhatsappLead(
  schema: ReturnType<typeof crmSchema>,
  settings: Record<string, unknown>,
  run: Record<string, unknown>,
  context: {
    client: Record<string, unknown> | null;
  },
  bodyText: string | null,
  templatePayload: Record<string, unknown>,
) {
  const phone = normalizePhone(templatePayload.primary_phone || context.client?.primary_phone);
  if (!phone) {
    return { status: 'failed', reason: 'missing_client_phone' };
  }

  const connectedInstance = await resolveConnectedInternalCrmInstance(
    schema,
    asString(templatePayload.whatsapp_instance_id) || asString(settings.default_whatsapp_instance_id),
  );

  if (!connectedInstance?.id || !connectedInstance.instance_name) {
    return { status: 'failed', reason: 'no_connected_whatsapp_instance' };
  }

  if (!bodyText) {
    return { status: 'skipped', reason: 'missing_message_body' };
  }

  const sendResponse = await evolutionRequest(`/message/sendText/${connectedInstance.instance_name}`, {
    method: 'POST',
    body: JSON.stringify({ number: phone, text: bodyText }),
  });

  const conversation = context.client
    ? await ensureWhatsappConversationForClient(schema, context.client, String(connectedInstance.id))
    : null;

  if (conversation?.id) {
    const { data: message, error: messageError } = await schema.from('messages').insert({
      conversation_id: conversation.id,
      whatsapp_instance_id: connectedInstance.id,
      direction: 'outbound',
      body: bodyText,
      message_type: 'text',
      wa_message_id: asString(sendResponse?.key?.id),
      remote_jid: normalizeRemoteJid(phone),
      delivery_status: 'sent',
      metadata: {
        source: 'automation',
        automation_run_id: asString(run.id),
        automation_key: asString(run.automation_key),
      },
    }).select('*').single();

    if (messageError || !message?.id) throw { status: 500, code: 'automation_message_insert_failed', error: messageError };

    await schema.from('conversations').update({
      last_message_at: message.created_at,
      last_message_preview: bodyText,
      updated_at: nowIso(),
    }).eq('id', conversation.id);

    if (context.client?.id) {
      await schema.from('clients').update({
        last_contact_at: message.created_at,
        updated_at: nowIso(),
      }).eq('id', context.client.id);
    }
  }

  return {
    status: 'completed',
    delivered_count: 1,
    instance_id: String(connectedInstance.id),
    wa_message_id: asString(sendResponse?.key?.id),
  };
}

async function dispatchAutomationWhatsappAdmin(
  schema: ReturnType<typeof crmSchema>,
  settings: Record<string, unknown>,
  run: Record<string, unknown>,
  bodyText: string | null,
  templatePayload: Record<string, unknown>,
) {
  const numbers = normalizeTextArray(settings.admin_notification_numbers)
    .map((value) => normalizePhone(value))
    .filter(Boolean);

  if (numbers.length === 0) {
    return { status: 'skipped', reason: 'admin_numbers_not_configured' };
  }

  const connectedInstance = await resolveConnectedInternalCrmInstance(
    schema,
    asString(templatePayload.whatsapp_instance_id) || asString(settings.default_whatsapp_instance_id),
  );

  if (!connectedInstance?.id || !connectedInstance.instance_name) {
    return { status: 'failed', reason: 'no_connected_whatsapp_instance' };
  }

  if (!bodyText) {
    return { status: 'skipped', reason: 'missing_message_body' };
  }

  const deliveries: Array<Record<string, unknown>> = [];
  const failures: Array<Record<string, unknown>> = [];

  for (const number of numbers) {
    try {
      const sendResponse = await evolutionRequest(`/message/sendText/${connectedInstance.instance_name}`, {
        method: 'POST',
        body: JSON.stringify({ number, text: bodyText }),
      });
      deliveries.push({ number, wa_message_id: asString(sendResponse?.key?.id) });
    } catch (error) {
      failures.push({
        number,
        reason: asString((error as { message?: unknown }).message) || 'admin_whatsapp_send_failed',
      });
    }
  }

  if (deliveries.length === 0) {
    return {
      status: 'failed',
      reason: asString(failures[0]?.reason) || 'admin_whatsapp_send_failed',
      failures,
    };
  }

  return {
    status: 'completed',
    delivered_count: deliveries.length,
    failed_count: failures.length,
    deliveries,
    failures,
    instance_id: String(connectedInstance.id),
  };
}

async function executeAutomationRun(
  serviceClient: ReturnType<typeof createClient>,
  run: Record<string, unknown>,
  rule: Record<string, unknown>,
  settings: Record<string, unknown>,
) {
  const schema = crmSchema(serviceClient);
  const runPayload = asRecord(run.payload);
  const context = await resolveAutomationContextEntities(serviceClient, runPayload);
  const templatePayload = buildAutomationTemplatePayload(
    context,
    mergeRecord(runPayload, {
      automation_name: asString(rule.name),
      event_at: asString(runPayload.event_at) || asString(run.scheduled_at) || nowIso(),
    }),
    asString(run.trigger_event) || asString(rule.trigger_event) || 'automation',
  );

  if (await isAutomationRunInCooldown(schema, settings, run)) {
    return {
      status: 'skipped',
      reason: 'notification_cooldown',
    };
  }

  const bodyText =
    asString(runPayload.template_body) ||
    renderAutomationTemplate(asString(rule.template), templatePayload) ||
    asString(rule.description);

  let dispatchResult: Record<string, unknown> = { status: 'skipped', reason: 'no_dispatch_channel' };
  if (asString(rule.channel) === 'whatsapp_lead') {
    dispatchResult = await dispatchAutomationWhatsappLead(schema, settings, run, { client: context.client }, bodyText, templatePayload);
  } else if (asString(rule.channel) === 'whatsapp_admin') {
    dispatchResult = await dispatchAutomationWhatsappAdmin(schema, settings, run, bodyText, templatePayload);
  } else if (asString(rule.channel) === 'internal_task') {
    dispatchResult = { status: 'completed', reason: 'task_only_rule' };
  }

  const task = await createAutomationTaskFromRule(schema, rule, run, templatePayload);

  if (asString(dispatchResult.status) === 'failed') {
    return {
      status: 'failed',
      reason: asString(dispatchResult.reason) || 'automation_dispatch_failed',
      dispatch: dispatchResult,
      task_id: asString(task?.id),
    };
  }

  return {
    status: asString(dispatchResult.status) === 'skipped' && !task?.id ? 'skipped' : 'completed',
    body_text: bodyText,
    dispatch: dispatchResult,
    task_id: asString(task?.id),
  };
}

async function processAutomationRunsWithOptions(
  serviceClient: ReturnType<typeof createClient>,
  options: { limit?: number; runIds?: string[] },
) {
  const schema = crmSchema(serviceClient);
  const limit = clamp(asNumber(options.limit, 20), 1, 100);
  const explicitRunIds = Array.isArray(options.runIds)
    ? options.runIds.map((value) => asString(value)).filter((value): value is string => Boolean(value))
    : [];

  let runs: Record<string, unknown>[] = [];

  if (explicitRunIds.length > 0) {
    const { data, error } = await schema
      .from('automation_runs')
      .select('*')
      .in('id', explicitRunIds)
      .order('scheduled_at', { ascending: true });

    if (error) throw { status: 500, code: 'automation_runs_query_failed', error };
    runs = (data || []).map((row) => ({ ...row }));

    if (runs.length > 0) {
      await schema
        .from('automation_runs')
        .update({ status: 'processing', updated_at: nowIso() })
        .in('id', runs.map((run) => String(run.id || '')))
        .in('status', ['pending', 'processing']);
      runs = runs.map((run) => ({ ...run, status: 'processing' }));
    }
  } else {
    const { data, error } = await serviceClient.rpc('claim_due_automation_runs', { p_limit: limit });
    if (error) throw { status: 500, code: 'automation_runs_claim_failed', error };
    runs = Array.isArray(data) ? data.map((row) => ({ ...row })) : [];
  }

  if (runs.length === 0) {
    return {
      ok: true,
      processed_run_ids: [],
      failed_runs: [],
      processed_count: 0,
      failed_count: 0,
    };
  }

  const settings = await getAutomationSettingsRecord(serviceClient);
  const automationIds = Array.from(new Set(runs.map((run) => asString(run.automation_id)).filter((id): id is string => Boolean(id))));
  const { data: rules, error: rulesError } = await schema.from('automation_rules').select('*').in('id', automationIds);
  if (rulesError) throw { status: 500, code: 'automation_rules_query_failed', error: rulesError };

  const ruleById = new Map((rules || []).map((rule) => [String(rule.id), rule]));
  const processedRunIds: string[] = [];
  const failedRuns: Array<{ run_id: string; reason: string }> = [];

  for (const run of runs) {
    const runId = String(run.id || '');
    const rule = ruleById.get(String(run.automation_id || ''));

    try {
      if (!rule?.id) throw new Error('automation_rule_not_found');

      const outcome = await executeAutomationRun(serviceClient, run, rule, settings);
      const finalStatus = asString(outcome.status) === 'failed'
        ? 'failed'
        : asString(outcome.status) === 'skipped'
          ? 'skipped'
          : 'completed';
      const processedAt = nowIso();
      const errorReason = asString(outcome.reason);

      await schema
        .from('automation_runs')
        .update({
          status: finalStatus,
          processed_at: processedAt,
          attempt_count: asNumber(run.attempt_count, 0) + 1,
          last_error: finalStatus === 'failed' ? errorReason : null,
          result_payload: outcome,
          updated_at: processedAt,
        })
        .eq('id', run.id);

      await schema
        .from('automation_rules')
        .update({
          last_run_at: processedAt,
          last_run_status: finalStatus,
          updated_at: processedAt,
        })
        .eq('id', rule.id);

      if (finalStatus === 'failed') {
        failedRuns.push({ run_id: runId, reason: errorReason || 'automation_dispatch_failed' });

        if (
          asString(run.trigger_event) !== 'automation_failed' &&
          asString(run.automation_key) !== 'admin_critical_automation_failure'
        ) {
          await queueAutomationEvent(serviceClient, 'automation_failed', {
            client_id: asString(run.client_id),
            deal_id: asString(run.deal_id),
            appointment_id: asString(run.appointment_id),
            conversation_id: asString(run.conversation_id),
            automation_name: asString(rule.name),
            event_at: processedAt,
            event_key: `automation_failed:${runId}`,
            nome: asString(asRecord(run.payload).nome),
          }, { processDueNow: true });
        }
      } else {
        processedRunIds.push(runId);
      }
    } catch (error) {
      const processedAt = nowIso();
      const reason = asString((error as { message?: unknown }).message) || 'automation_run_failed';

      await schema
        .from('automation_runs')
        .update({
          status: 'failed',
          processed_at: processedAt,
          attempt_count: asNumber(run.attempt_count, 0) + 1,
          last_error: reason,
          result_payload: { error: reason },
          updated_at: processedAt,
        })
        .eq('id', run.id);

      if (rule?.id) {
        await schema
          .from('automation_rules')
          .update({
            last_run_at: processedAt,
            last_run_status: 'failed',
            updated_at: processedAt,
          })
          .eq('id', rule.id);
      }

      failedRuns.push({ run_id: runId, reason });

      if (
        asString(run.trigger_event) !== 'automation_failed' &&
        asString(run.automation_key) !== 'admin_critical_automation_failure'
      ) {
        await queueAutomationEvent(serviceClient, 'automation_failed', {
          client_id: asString(run.client_id),
          deal_id: asString(run.deal_id),
          appointment_id: asString(run.appointment_id),
          conversation_id: asString(run.conversation_id),
          automation_name: asString(rule?.name) || asString(run.automation_key),
          event_at: processedAt,
          event_key: `automation_failed:${runId}`,
          nome: asString(asRecord(run.payload).nome),
        }, { processDueNow: true });
      }
    }
  }

  return {
    ok: true,
    processed_run_ids: processedRunIds,
    failed_runs: failedRuns,
    processed_count: processedRunIds.length,
    failed_count: failedRuns.length,
  };
}

async function processAutomationRuns(serviceClient: ReturnType<typeof createClient>) {
  return processAutomationRunsWithOptions(serviceClient, {});
}

async function executeBroadcastAssistantJob(
  serviceClient: ReturnType<typeof createClient>,
  job: Record<string, unknown>,
  aiSettings: Record<string, unknown>,
) {
  const schema = crmSchema(serviceClient);
  const payload = isRecord(job.payload) ? job.payload : {};

  if (!asBoolean(aiSettings.is_enabled, false) || !asBoolean(aiSettings.broadcast_assistant_enabled, false)) {
    return {
      status: 'completed',
      skipped: true,
      reason: 'broadcast_assistant_disabled',
    };
  }

  const targetFilters = isRecord(payload.target_filters) ? payload.target_filters : {};
  const explicitClientIds = Array.isArray(payload.client_ids)
    ? payload.client_ids.map((value) => asString(value)).filter((value): value is string => Boolean(value))
    : [];

  const maxRecipients = clamp(
    asNumber(payload.max_recipients, asNumber(targetFilters.max_recipients, 100)),
    1,
    500,
  );

  const connectedInstance = await resolveConnectedInternalCrmInstance(
    schema,
    asString(payload.whatsapp_instance_id),
  );

  if (!connectedInstance?.id) {
    return {
      status: 'failed',
      reason: 'no_connected_whatsapp_instance',
    };
  }

  let clientsQuery = schema
    .from('clients')
    .select('id, company_name, primary_phone, current_stage_code, lifecycle_status, owner_user_id')
    .order('updated_at', { ascending: false });

  if (explicitClientIds.length > 0) {
    clientsQuery = clientsQuery.in('id', explicitClientIds);
  } else {
    const stageCode = asString(targetFilters.stage_code);
    if (stageCode) clientsQuery = clientsQuery.eq('current_stage_code', stageCode);

    const lifecycleStatus = asString(targetFilters.lifecycle_status);
    if (lifecycleStatus) clientsQuery = clientsQuery.eq('lifecycle_status', lifecycleStatus);

    const ownerUserId = asString(targetFilters.owner_user_id);
    if (ownerUserId) clientsQuery = clientsQuery.eq('owner_user_id', ownerUserId);

    const sourceChannel = asString(targetFilters.source_channel);
    if (sourceChannel) clientsQuery = clientsQuery.eq('source_channel', sourceChannel);
  }

  const { data: clients, error: clientsError } = await clientsQuery.limit(maxRecipients);
  if (clientsError) {
    return {
      status: 'failed',
      reason: 'clients_query_failed',
    };
  }

  const uniquePhoneSet = new Set<string>();
  const recipients = (clients || [])
    .map((client) => ({
      client_id: String(client.id),
      recipient_name: asString(client.company_name),
      recipient_phone: normalizePhone(client.primary_phone),
    }))
    .filter((recipient) => {
      if (!recipient.recipient_phone) return false;
      if (uniquePhoneSet.has(recipient.recipient_phone)) return false;
      uniquePhoneSet.add(recipient.recipient_phone);
      return true;
    });

  if (recipients.length === 0) {
    return {
      status: 'completed',
      skipped: true,
      reason: 'no_recipients_after_filters',
    };
  }

  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item))
    : [];

  const fallbackMessage =
    asString(payload.message_template) ||
    asString(payload.message) ||
    'Ola {{name}}, temos uma oportunidade para acelerar seus resultados com o SolarZap.';

  if (messages.length === 0 && fallbackMessage) {
    messages.push(fallbackMessage);
  }

  if (messages.length === 0) {
    return {
      status: 'failed',
      reason: 'missing_campaign_message',
    };
  }

  const { data: campaign, error: campaignError } = await schema
    .from('broadcast_campaigns')
    .insert({
      name: asString(payload.campaign_name) || `IA campaign ${new Date().toISOString()}`,
      whatsapp_instance_id: connectedInstance.id,
      owner_user_id: asString(job.client_id) ? null : asString(payload.owner_user_id),
      target_filters: targetFilters,
      messages,
      status: 'running',
      started_at: nowIso(),
      updated_at: nowIso(),
    })
    .select('*')
    .single();

  if (campaignError || !campaign?.id) {
    return {
      status: 'failed',
      reason: 'campaign_insert_failed',
    };
  }

  const { error: recipientsError } = await schema.from('broadcast_recipients').insert(
    recipients.map((recipient) => ({
      campaign_id: campaign.id,
      client_id: recipient.client_id,
      recipient_name: recipient.recipient_name,
      recipient_phone: recipient.recipient_phone,
      status: 'pending',
      payload: {
        source: 'ai_broadcast_assistant',
        scheduled_agent_job_id: String(job.id || ''),
      },
    })),
  );

  if (recipientsError) {
    return {
      status: 'failed',
      reason: 'campaign_recipients_insert_failed',
    };
  }

  const workerResult = await invokeInternalEdgeFunction('internal-crm-broadcast-worker', {
    campaign_id: campaign.id,
    batch_size: clamp(asNumber(payload.batch_size, 20), 1, 50),
  });

  return {
    status: 'completed',
    campaign_id: String(campaign.id),
    recipients_count: recipients.length,
    worker_result: workerResult,
  };
}

async function executeStandardAgentJob(
  serviceClient: ReturnType<typeof createClient>,
  job: Record<string, unknown>,
  aiSettings: Record<string, unknown>,
) {
  const schema = crmSchema(serviceClient);
  const payload = isRecord(job.payload) ? job.payload : {};
  const clientId = asString(job.client_id);
  const jobType = asString(job.job_type) || 'unknown';

  if (jobType === 'qualification' && (!asBoolean(aiSettings.is_enabled, false) || !asBoolean(aiSettings.qualification_enabled, false))) {
    return { status: 'completed', skipped: true, reason: 'qualification_disabled' };
  }

  if (jobType === 'follow_up' && (!asBoolean(aiSettings.is_enabled, false) || !asBoolean(aiSettings.follow_up_enabled, false))) {
    return { status: 'completed', skipped: true, reason: 'follow_up_disabled' };
  }

  if (jobType === 'onboarding' && (!asBoolean(aiSettings.is_enabled, false) || !asBoolean(aiSettings.onboarding_assistant_enabled, false))) {
    return { status: 'completed', skipped: true, reason: 'onboarding_disabled' };
  }

  if (clientId && jobType === 'qualification') {
    await schema
      .from('clients')
      .update({
        current_stage_code: resolveBlueprintStageCode(payload.target_stage_code, 'respondeu'),
        updated_at: nowIso(),
      })
      .eq('id', clientId);
  }

  if (clientId && jobType === 'onboarding') {
    await schema
      .from('clients')
      .update({
        lifecycle_status: 'customer_onboarding',
        updated_at: nowIso(),
      })
      .eq('id', clientId);
  }

  if (clientId) {
    const taskTitle =
      asString(payload.task_title) ||
      (jobType === 'qualification'
        ? 'Revisar cliente qualificado automaticamente'
        : jobType === 'follow_up'
          ? 'Executar follow-up sugerido por IA'
          : 'Acompanhar onboarding sugerido por IA');

    const taskNotes =
      asString(payload.task_notes) ||
      `Job ${jobType} processado em ${nowIso()} com automacao interna do CRM.`;

    await schema.from('tasks').insert({
      client_id: clientId,
      deal_id: asString(job.deal_id),
      owner_user_id: null,
      title: taskTitle,
      notes: taskNotes,
      due_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      status: 'open',
      task_kind: jobType === 'onboarding' ? 'onboarding' : 'follow_up',
    });
  }

  return {
    status: 'completed',
    job_type: jobType,
    client_id: clientId,
  };
}

async function processAgentJobsWithOptions(
  serviceClient: ReturnType<typeof createClient>,
  options: { limit?: number },
) {
  const schema = crmSchema(serviceClient);
  const limit = clamp(asNumber(options.limit, 20), 1, 50);
  const aiSettings = await listAiSettings(serviceClient);

  const { data: jobs, error } = await schema
    .from('scheduled_agent_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso())
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) throw { status: 500, code: 'agent_jobs_query_failed', error };

  const processedIds: string[] = [];
  const failedJobs: Array<{ job_id: string; reason: string }> = [];

  for (const job of jobs || []) {
    const jobId = String(job.id || '');
    const inputPayload = isRecord(job.payload) ? job.payload : {};

    try {
      await schema
        .from('scheduled_agent_jobs')
        .update({ status: 'processing', updated_at: nowIso() })
        .eq('id', job.id);

      const outcome = asString(job.job_type) === 'broadcast_assistant'
        ? await executeBroadcastAssistantJob(serviceClient, job, aiSettings)
        : await executeStandardAgentJob(serviceClient, job, aiSettings);

      const finalStatus = asString(outcome.status) === 'failed' ? 'failed' : 'completed';
      const failureReason = asString(outcome.reason) || asString(outcome.error) || null;

      await schema
        .from('scheduled_agent_jobs')
        .update({
          status: finalStatus,
          processed_at: nowIso(),
          attempts: asNumber(job.attempts, 0) + 1,
          last_error: finalStatus === 'failed' ? failureReason : null,
          payload: {
            ...inputPayload,
            last_result: outcome,
            last_processed_at: nowIso(),
          },
          updated_at: nowIso(),
        })
        .eq('id', job.id);

      await schema.from('ai_action_logs').insert({
        job_id: job.id,
        client_id: job.client_id,
        action_type: job.job_type,
        status: finalStatus === 'completed' ? 'completed' : 'failed',
        input_payload: inputPayload,
        output_payload: outcome,
      });

      if (finalStatus === 'completed') {
        processedIds.push(jobId);
      } else {
        failedJobs.push({ job_id: jobId, reason: failureReason || 'agent_job_failed' });
      }
    } catch (error) {
      const reason = asString((error as { message?: unknown }).message) || 'agent_job_failed';

      await schema
        .from('scheduled_agent_jobs')
        .update({
          status: 'failed',
          processed_at: nowIso(),
          attempts: asNumber(job.attempts, 0) + 1,
          last_error: reason,
          updated_at: nowIso(),
        })
        .eq('id', job.id);

      await schema.from('ai_action_logs').insert({
        job_id: job.id,
        client_id: job.client_id,
        action_type: job.job_type,
        status: 'failed',
        input_payload: inputPayload,
        output_payload: { error: reason },
      });

      failedJobs.push({ job_id: jobId, reason });
    }
  }

  return {
    ok: true,
    processed_job_ids: processedIds,
    failed_jobs: failedJobs,
    processed_count: processedIds.length,
    failed_count: failedJobs.length,
  };
}

async function runAgentJobs(
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const result = await processAgentJobsWithOptions(serviceClient, {
    limit: asNumber(payload.limit, 20),
  });

  await writeAuditLog(serviceClient, identity, 'run_agent_jobs', req, {
    target_type: 'agent_job_batch',
    target_id: identity.user_id,
    after: {
      processed_count: result.processed_count,
      failed_count: result.failed_count,
    },
  });

  return result;
}

async function dispatchUserAction(
  action: string,
  serviceClient: ReturnType<typeof createClient>,
  identity: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
  userToken: string,
) {
  switch (action) {
    case 'crm_whoami':
      return {
        ok: true,
        user_id: identity.user_id,
        system_role: identity.system_role,
        crm_role: identity.crm_role,
        aal: extractAalFromToken(userToken),
      };
    case 'list_products':
      return { ok: true, products: await listProducts(serviceClient) };
    case 'list_pipeline_stages':
      return { ok: true, stages: await listPipelineStages(serviceClient) };
    case 'list_dashboard_kpis':
      return { ok: true, kpis: await listDashboardKpis(serviceClient, payload) };
    case 'list_clients':
      return { ok: true, clients: await listClients(serviceClient, payload) };
    case 'get_client_detail':
      return await getClientDetail(serviceClient, payload);
    case 'upsert_client':
      return await upsertClient(serviceClient, identity, payload, req);
    case 'list_deals':
      return { ok: true, deals: await listDeals(serviceClient, payload) };
    case 'upsert_deal':
      return await upsertDeal(serviceClient, identity, payload, req);
    case 'move_deal_stage':
      return await moveDealStage(serviceClient, identity, payload, req);
    case 'create_deal_checkout_link':
      return await createDealCheckoutLink(serviceClient, identity, payload, req);
    case 'list_tasks':
      return { ok: true, tasks: await listTasks(serviceClient, payload) };
    case 'upsert_task':
      return await upsertTask(serviceClient, identity, payload, req);
    case 'list_automation_rules':
      return { ok: true, rules: await listAutomationRules(serviceClient) };
    case 'upsert_automation_rule':
      return await upsertAutomationRule(serviceClient, identity, payload, req);
    case 'list_automation_runs':
      return { ok: true, runs: await listAutomationRuns(serviceClient, payload) };
    case 'test_automation_rule':
      return await testAutomationRule(serviceClient, identity, payload, req);
    case 'get_automation_settings':
      return { ok: true, settings: await getAutomationSettings(serviceClient) };
    case 'upsert_automation_settings':
      return await upsertAutomationSettings(serviceClient, identity, payload, req);
    case 'update_deal_commercial_state':
      return await updateDealCommercialState(serviceClient, identity, payload, req);
    case 'intake_landing_lead':
      return await intakeLandingLead(serviceClient, identity, payload, req);
    case 'list_instances':
      return { ok: true, instances: await listInstances(serviceClient) };
    case 'upsert_instance':
      return await upsertInstance(serviceClient, identity, payload, req);
    case 'connect_instance':
      return await connectInstance(serviceClient, identity, payload, req);
    case 'list_conversations':
      return { ok: true, conversations: await listConversations(serviceClient, payload) };
    case 'get_conversation_detail':
      return await getConversationDetail(serviceClient, payload);
    case 'append_message':
      return await appendMessage(serviceClient, identity, payload, req);
    case 'mark_conversation_read':
      return await markConversationRead(serviceClient, identity, payload, req);
    case 'update_conversation_status':
      return await updateConversationStatus(serviceClient, identity, payload, req);
    case 'list_campaigns':
      return { ok: true, campaigns: await listCampaigns(serviceClient) };
    case 'upsert_campaign':
      return await upsertCampaign(serviceClient, identity, payload, req);
    case 'update_campaign_status':
      return await updateCampaignStatus(serviceClient, identity, payload, req);
    case 'run_campaign_batch':
      return await runCampaignBatch(serviceClient, identity, payload, req);
    case 'list_ai_settings':
      return { ok: true, settings: await listAiSettings(serviceClient) };
    case 'upsert_ai_settings':
      return await upsertAiSettings(serviceClient, identity, payload, req);
    case 'enqueue_agent_job':
      return await enqueueAgentJob(serviceClient, identity, payload, req);
    case 'run_agent_jobs':
      return await runAgentJobs(serviceClient, identity, payload, req);
    case 'list_ai_action_logs':
      return { ok: true, logs: await listAiActionLogs(serviceClient, payload) };
    case 'list_appointments':
      return { ok: true, appointments: await listAppointments(serviceClient, payload) };
    case 'upsert_appointment':
      return await upsertAppointment(serviceClient, identity, payload, req);
    case 'get_google_calendar_status':
      return await getGoogleCalendarStatus(serviceClient, identity);
    case 'get_google_calendar_oauth_url':
      return await getGoogleCalendarOAuthUrl(serviceClient, identity, payload);
    case 'disconnect_google_calendar':
      return await disconnectGoogleCalendar(serviceClient, identity, req);
    case 'sync_appointment_google_calendar':
      return await syncAppointmentGoogleCalendar(serviceClient, identity, payload, req);
    case 'import_google_calendar_events':
      return await importGoogleCalendarEvents(serviceClient, identity, payload, req);
    case 'list_finance_summary':
      return { ok: true, summary: await listFinanceSummary(serviceClient) };
    case 'list_orders':
      return { ok: true, summary: await listFinanceSummary(serviceClient) };
    case 'list_customer_snapshot':
      return { ok: true, snapshots: await listCustomerSnapshot(serviceClient, payload) };
    case 'refresh_customer_snapshot':
      return await refreshCustomerSnapshot(serviceClient, identity, payload, req);
    case 'get_linked_public_org_summary':
      return { ok: true, summary: await getLinkedPublicOrgSummary(serviceClient, payload) };
    case 'provision_customer':
      return await provisionCustomer(serviceClient, identity, payload, req, userToken);
    default:
      throw { status: 403, code: 'action_not_allowed' };
  }
}

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req);
  const corsHeaders = cors.corsHeaders;

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return json(500, { ok: false, code: 'missing_allowed_origin' }, corsHeaders);
    }
    if (!cors.originAllowed) {
      return json(403, { ok: false, code: 'forbidden_origin' }, corsHeaders);
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (cors.missingAllowedOriginConfig) {
    return json(500, { ok: false, code: 'missing_allowed_origin' }, corsHeaders);
  }

  if (!cors.originAllowed) {
    return json(403, { ok: false, code: 'forbidden_origin' }, corsHeaders);
  }

  const requestId = req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  let payload: Record<string, unknown> = {};
  try {
    const parsed = await req.json().catch(() => ({}));
    payload = isRecord(parsed) ? parsed : {};
  } catch {
    payload = {};
  }

  const action = asString(payload.action) || asString(new URL(req.url).searchParams.get('action')) || '';
  const responseHeaders = { ...corsHeaders, 'x-internal-crm-request-id': requestId };
  const serviceClient = getServiceClient();

  try {
    if (!action) {
      throw { status: 400, code: 'invalid_payload' };
    }

    if (INTERNAL_ONLY_ACTIONS.has(action)) {
      const { supabaseServiceRoleKey } = getSupabaseEnv();
      const invocationAuth = validateServiceInvocationAuth(req, {
        serviceRoleKey: supabaseServiceRoleKey,
        internalApiKey: String(Deno.env.get('EDGE_INTERNAL_API_KEY') || '').trim(),
      });

      if (!invocationAuth.ok) {
        return json(invocationAuth.status, { ok: false, code: invocationAuth.code }, responseHeaders);
      }

      if (action === 'webhook_inbound') {
        const result = await handleWebhookInbound(serviceClient, payload);
        return json(200, result, responseHeaders);
      }

      if (action === 'process_agent_jobs') {
        const result = await processAgentJobs(serviceClient);
        return json(200, result, responseHeaders);
      }

      if (action === 'process_automation_runs') {
        const result = await processAutomationRuns(serviceClient);
        return json(200, result, responseHeaders);
      }

      if (action === 'lp_public_intake') {
        const result = await handlePublicLpIntake(serviceClient, payload, req);
        return json(200, result, responseHeaders);
      }

      if (action === 'lp_public_list_slots') {
        const result = await listPublicLandingSlots(serviceClient, payload);
        return json(200, result, responseHeaders);
      }

      if (action === 'lp_public_book_slot') {
        const result = await handlePublicLpBookSlot(serviceClient, payload, req);
        return json(200, result, responseHeaders);
      }

      throw { status: 403, code: 'action_not_allowed' };
    }

    const userToken = asString(payload._admin_access_token);
    if (!userToken) {
      throw { status: 401, code: 'missing_auth' };
    }

    const user = await resolveAuthenticatedUser(userToken);
    const identity = await resolveAdminIdentity(serviceClient, user.id, action, extractAalFromToken(userToken));
    const result = await dispatchUserAction(action, serviceClient, identity, payload, req, userToken);
    return json(200, result, responseHeaders);
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === 'number' ? Number((error as { status: number }).status) : 500;
    const code = asString((error as { code?: unknown })?.code) || 'unknown_internal_crm_error';
    const message = asString((error as { message?: unknown })?.message) || (error instanceof Error ? error.message : null);
    return json(status, {
      ok: false,
      code,
      message,
      request_id: requestId,
    }, responseHeaders);
  }
});
