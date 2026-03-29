import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveRequestCors } from '../_shared/cors.ts';
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
  list_instances: { minCrmRole: 'read_only', requireMfa: true },
  upsert_instance: { minCrmRole: 'ops', requireMfa: true },
  connect_instance: { minCrmRole: 'ops', requireMfa: true },
  list_conversations: { minCrmRole: 'read_only', requireMfa: true },
  get_conversation_detail: { minCrmRole: 'read_only', requireMfa: true },
  append_message: { minCrmRole: 'cs', requireMfa: true },
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

const INTERNAL_ONLY_ACTIONS = new Set(['webhook_inbound', 'process_agent_jobs']);

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
    schema.from('clients').select('id', { count: 'exact', head: true }).eq('current_stage_code', 'qualificado').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('deals').select('id', { count: 'exact', head: true }).eq('stage_code', 'demo_agendada').gte('updated_at', sinceIso).lte('updated_at', untilIso),
    schema.from('deals').select('id', { count: 'exact', head: true }).eq('stage_code', 'proposta_enviada').gte('updated_at', sinceIso).lte('updated_at', untilIso),
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
    current_stage_code: asString(payload.current_stage_code) || 'lead_entrante',
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
    stage_code: asString(payload.stage_code) || before?.stage_code || 'lead_entrante',
    status: asString(payload.status) || before?.status || 'open',
    probability: Math.max(0, Math.min(100, asNumber(payload.probability, before?.probability || 0))),
    expected_close_at: asString(payload.expected_close_at),
    notes: asString(payload.notes),
    lost_reason: asString(payload.lost_reason),
    payment_status: asString(payload.payment_status) || before?.payment_status || 'pending',
    paid_at: asString(payload.paid_at),
    won_at: asString(payload.won_at),
    closed_at: asString(payload.closed_at),
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

  const status =
    stageCode === 'ganho' ? 'won' :
    stageCode === 'perdido' ? 'lost' :
    asString(payload.status) || 'open';

  const updatePayload = {
    stage_code: stageCode,
    status,
    probability: Math.max(0, Math.min(100, asNumber(payload.probability, before.probability))),
    won_at: status === 'won' ? nowIso() : before.won_at,
    closed_at: status === 'won' || status === 'lost' ? nowIso() : null,
    payment_status:
      status === 'won' && before.payment_method === 'manual'
        ? 'paid'
        : before.payment_status,
    paid_at:
      status === 'won' && before.payment_method === 'manual'
        ? nowIso()
        : before.paid_at,
  };

  const { data, error } = await schema.from('deals').update(updatePayload).eq('id', dealId).select('*').single();
  if (error || !data?.id) throw { status: 500, code: 'deal_move_failed', error };

  await schema.from('clients').update({
    current_stage_code: stageCode,
    lifecycle_status:
      status === 'won' ? 'customer_onboarding' :
      stageCode === 'perdido' ? 'lead' :
      undefined,
    updated_at: nowIso(),
  }).eq('id', before.client_id);

  await schema.from('stage_history').insert({
    client_id: before.client_id,
    deal_id: dealId,
    from_stage_code: before.stage_code,
    to_stage_code: stageCode,
    changed_by_user_id: identity.user_id,
    notes: asString(payload.notes),
  });

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
  const { data: clients } = await schema.from('clients').select('id, company_name, primary_contact_name, primary_phone').in('id', clientIds);
  const clientMap = new Map<string, Record<string, unknown>>();
  for (const client of clients || []) clientMap.set(String(client.id), client);

  return rows.map((row) => {
    const client = clientMap.get(String(row.client_id || ''));
    return {
      ...row,
      client_company_name: asString(client?.company_name),
      primary_contact_name: asString(client?.primary_contact_name),
      primary_phone: asString(client?.primary_phone),
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
      current_stage_code: 'lead_entrante',
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
    current_stage_code: client.current_stage_code === 'lead_entrante' ? 'contato_iniciado' : client.current_stage_code,
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
        current_stage_code: asString(payload.target_stage_code) || 'qualificado',
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
