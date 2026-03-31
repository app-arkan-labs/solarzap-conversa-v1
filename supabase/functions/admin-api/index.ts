import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type SystemRole = 'super_admin' | 'ops' | 'support' | 'billing' | 'read_only';

type AdminIdentity = {
  user_id: string;
  system_role: SystemRole;
};

type ActionPermission = {
  minRole: SystemRole;
  requireMfa: boolean;
};

const ROLE_LEVEL: Record<SystemRole, number> = {
  super_admin: 50,
  ops: 40,
  support: 30,
  billing: 20,
  read_only: 10,
};

const ACTION_PERMISSIONS: Record<string, ActionPermission> = {
  whoami: { minRole: 'read_only', requireMfa: true },
  list_orgs: { minRole: 'read_only', requireMfa: true },
  list_orphan_users: { minRole: 'support', requireMfa: true },
  check_user_org_status: { minRole: 'support', requireMfa: true },
  get_org_details: { minRole: 'support', requireMfa: true },
  list_org_members: { minRole: 'support', requireMfa: true },
  get_system_metrics: { minRole: 'ops', requireMfa: true },
  list_audit_log: { minRole: 'ops', requireMfa: true },
  suspend_org: { minRole: 'ops', requireMfa: true },
  reactivate_org: { minRole: 'ops', requireMfa: true },
  update_org_plan: { minRole: 'billing', requireMfa: true },
  list_feature_flags: { minRole: 'read_only', requireMfa: true },
  create_feature_flag: { minRole: 'ops', requireMfa: true },
  set_org_feature: { minRole: 'ops', requireMfa: true },
  delete_org: { minRole: 'super_admin', requireMfa: true },
  bulk_delete_orgs: { minRole: 'super_admin', requireMfa: true },
  create_org_with_user: { minRole: 'super_admin', requireMfa: true },
  list_subscription_plans: { minRole: 'read_only', requireMfa: true },
  get_financial_summary: { minRole: 'billing', requireMfa: true },
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FLAG_KEY_REGEX = /^[a-z][a-z0-9_]*$/;
const TRUSTED_ADMIN_ORIGINS = ['https://adm.solarzap.com.br', 'https://admin.solarzap.com.br'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stripBearer(authHeader: string): string {
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

function normalizeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  return `${base64}${'='.repeat(padLength)}`;
}

function extractAalFromAuthHeader(authHeader: string): string {
  try {
    const token = stripBearer(authHeader);
    const segments = token.split('.');
    if (segments.length < 2) return 'aal1';
    const payloadRaw = atob(normalizeBase64Url(segments[1]));
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    return typeof payload.aal === 'string' && payload.aal ? payload.aal : 'aal1';
  } catch {
    return 'aal1';
  }
}

function parsePagination(
  payload: Record<string, unknown>,
  defaults = { page: 1, perPage: 20, maxPerPage: 100 },
): { page: number; perPage: number } {
  const pageInput = Number(payload.page);
  const perPageInput = Number(payload.per_page);

  const page = Number.isFinite(pageInput) ? Math.floor(pageInput) : defaults.page;
  const perPage = Number.isFinite(perPageInput)
    ? Math.floor(perPageInput)
    : defaults.perPage;

  return {
    page: Math.min(1_000_000, Math.max(1, page)),
    perPage: Math.min(defaults.maxPerPage, Math.max(1, perPage)),
  };
}

function toJsonBody(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toReason(value: unknown): string | null {
  const normalized = toTrimmedString(value);
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: unknown): string | null {
  const raw = toTrimmedString(value);
  if (!raw) return null;
  const email = raw.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

function generateTempPassword() {
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `Tmp!${randomPart}Aa1`;
}

async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
) {
  const perPage = 200;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw { status: 500, code: 'users_list_failed' };
    }
    const users = data.users ?? [];
    const found = users.find((user) => (user.email || '').toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) break;
  }
  return null;
}

async function resolveUserLinkedOrg(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: ownerOrg, error: ownerError } = await adminClient
    .from('organizations')
    .select('id, name')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (ownerError) {
    throw { status: 500, code: 'user_org_lookup_failed' };
  }
  if (ownerOrg?.id) {
    return {
      org_id: String(ownerOrg.id),
      org_name: typeof ownerOrg.name === 'string' ? ownerOrg.name : null,
    };
  }

  const { data: membership, error: membershipError } = await adminClient
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    throw { status: 500, code: 'user_membership_lookup_failed' };
  }

  if (!membership?.org_id) {
    return null;
  }

  const orgId = String(membership.org_id);
  const { data: orgData } = await adminClient
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .maybeSingle();

  return {
    org_id: orgId,
    org_name: typeof orgData?.name === 'string' ? orgData.name : null,
  };
}

async function getPlanLimitsByKey(
  adminClient: ReturnType<typeof createClient>,
  planKey: string,
) {
  const normalizedPlan = planKey === 'starter' ? 'start' : planKey === 'business' ? 'scale' : planKey;
  const { data, error } = await adminClient
    .from('_admin_subscription_plans')
    .select('plan_key, limits')
    .eq('plan_key', normalizedPlan)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw { status: 500, code: 'plan_lookup_failed' };
  }
  if (!data || typeof data.limits !== 'object' || data.limits === null || Array.isArray(data.limits)) {
    throw { status: 400, code: 'invalid_plan' };
  }

  return {
    plan: String(data.plan_key),
    limits: data.limits,
  };
}

function json(
  status: number,
  body: Record<string, unknown>,
  corsHeaders?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(corsHeaders ?? {}),
      'Content-Type': 'application/json',
    },
  });
}

function corsForOrigin(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-admin-authorization, x-client-info, apikey, content-type',
  };
}

function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function resolveAllowedOriginsFromEnv(): string[] {
  const allowlistCsv = parseAllowedOrigins((Deno.env.get('ALLOWED_ORIGINS') || '').trim());
  const legacyAllowlist = parseAllowedOrigins((Deno.env.get('ALLOWED_ORIGIN') || '').trim());

  return Array.from(
    new Set(
      [...allowlistCsv, ...legacyAllowlist, ...TRUSTED_ADMIN_ORIGINS]
        .map((item) => normalizeOrigin(item))
        .filter((item) => item.length > 0),
    ),
  );
}

function tryParseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function resolveAllowedOrigin(req: Request, allowed: string[]): string | null {
  const requestOrigin = normalizeOrigin((req.headers.get('origin') || '').trim());
  if (!requestOrigin) {
    return allowed[0] ?? null;
  }
  if (allowed.includes(requestOrigin)) {
    return requestOrigin;
  }

  const requestUrl = tryParseOrigin(requestOrigin);
  if (!requestUrl || !isLoopbackHost(requestUrl.hostname)) {
    return null;
  }

  const hasLoopbackAllowedOrigin = allowed.some((candidate) => {
    const candidateUrl = tryParseOrigin(candidate);
    if (!candidateUrl) return false;
    return candidateUrl.protocol === requestUrl.protocol && isLoopbackHost(candidateUrl.hostname);
  });

  return hasLoopbackAllowedOrigin ? requestOrigin : null;
}

function toErrorCode(error: unknown, fallback = 'internal_error'): string {
  if (isRecord(error) && typeof error.code === 'string') {
    return error.code;
  }
  return fallback;
}

function toErrorStatus(error: unknown, fallback = 500): number {
  if (isRecord(error) && typeof error.status === 'number') {
    return error.status;
  }
  return fallback;
}

function logAccessDecision(
  level: 'info' | 'warn' | 'error',
  details: {
    action?: string | null;
    origin?: string | null;
    aal?: string | null;
    resolved_user_id?: string | null;
    decision_code: string;
    request_id: string;
    status?: number;
    error?: unknown;
  },
) {
  const payload = {
    action: details.action ?? null,
    origin: details.origin ?? null,
    aal: details.aal ?? null,
    resolved_user_id: details.resolved_user_id ?? null,
    decision_code: details.decision_code,
    request_id: details.request_id,
    status: details.status ?? null,
    error: details.error,
  };

  if (level === 'error') {
    console.error('[admin-api] access_decision', payload);
    return;
  }
  if (level === 'warn') {
    console.warn('[admin-api] access_decision', payload);
    return;
  }
  console.info('[admin-api] access_decision', payload);
}

async function enforcePolicy(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  action: string,
  aal: string,
): Promise<AdminIdentity> {
  const permission = ACTION_PERMISSIONS[action];
  if (!permission) {
    throw { status: 403, code: 'action_not_allowed' };
  }

  const { data, error } = await adminClient
    .from('_admin_system_admins')
    .select('system_role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[admin-api] enforcePolicy query failed', error);
    throw { status: 500, code: 'admin_lookup_failed' };
  }

  if (!data || typeof data.system_role !== 'string') {
    throw { status: 403, code: 'not_system_admin' };
  }

  const role = data.system_role as SystemRole;
  if (!ROLE_LEVEL[role]) {
    throw { status: 403, code: 'invalid_system_role' };
  }

  if (ROLE_LEVEL[role] < ROLE_LEVEL[permission.minRole]) {
    throw { status: 403, code: 'insufficient_role' };
  }

  if (permission.requireMfa && aal !== 'aal2') {
    throw { status: 403, code: 'mfa_required' };
  }

  return {
    user_id: userId,
    system_role: role,
  };
}

async function writeAuditLog(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  action: string,
  details: {
    target_type: string;
    target_id?: string | null;
    org_id?: string | null;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
  req: Request,
) {
  const ip =
    req.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean)[0] ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  const { error } = await adminClient.from('_admin_audit_log').insert({
    actor_user_id: admin.user_id,
    actor_system_role: admin.system_role,
    action,
    target_type: details.target_type,
    target_id: details.target_id ?? null,
    org_id: details.org_id ?? null,
    before: details.before ?? null,
    after: details.after ?? null,
    ip,
    user_agent: userAgent,
    reason: details.reason ?? null,
  });

  if (error) {
    console.error('[admin-api] writeAuditLog failed', error);
    throw { status: 500, code: 'audit_log_failed' };
  }
}

async function listOrgMembersWithProfiles(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
) {
  const { data: members, error: membersError } = await adminClient
    .from('organization_members')
    .select('org_id, user_id, role, can_view_team_leads, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .order('user_id', { ascending: true });

  if (membersError) {
    throw { status: 500, code: 'members_query_failed' };
  }

  const enriched = await Promise.all(
    (members ?? []).map(async (member) => {
      const userId = String(member.user_id || '');
      let email: string | null = null;
      let displayName: string | null = null;

      if (userId) {
        const { data: userData } = await adminClient.auth.admin.getUserById(userId);
        email = userData.user?.email ?? null;

        const metadata = userData.user?.user_metadata;
        if (isRecord(metadata)) {
          const displayCandidate =
            (typeof metadata.display_name === 'string' && metadata.display_name.trim()) ||
            (typeof metadata.name === 'string' && metadata.name.trim()) ||
            (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
            null;
          displayName = displayCandidate;
        }
      }

      return {
        org_id: member.org_id,
        user_id: userId,
        email,
        display_name: displayName,
        role: member.role,
        can_view_team_leads: member.can_view_team_leads === true,
        joined_at: member.created_at ?? null,
      };
    }),
  );

  return enriched;
}

async function countAuthUsers(adminClient: ReturnType<typeof createClient>) {
  const perPage = 1000;
  let total = 0;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw { status: 500, code: 'users_count_failed' };
    }
    const users = data.users ?? [];
    total += users.length;
    if (users.length < perPage) break;
  }

  return total;
}

async function handleWhoAmI(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  aal: string,
  req: Request,
) {
  const response = {
    ok: true,
    user_id: admin.user_id,
    system_role: admin.system_role,
    aal,
  };

  await writeAuditLog(
    adminClient,
    admin,
    'whoami',
    {
      target_type: 'system',
      target_id: 'admin-api',
    },
    req,
  );

  return response;
}

const ALLOWED_SORT_COLUMNS = new Set(['created_at', 'name', 'member_count', 'lead_count', 'proposal_count', 'instance_count']);
const ALLOWED_SORT_DIRS = new Set(['asc', 'desc']);

async function handleListOrgs(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const { page, perPage } = parsePagination(payload);
  const search = toTrimmedString(payload.search);
  const status = toTrimmedString(payload.status);
  const plan = toTrimmedString(payload.plan);
  const sortBy = toTrimmedString(payload.sort_by);
  const sortDir = toTrimmedString(payload.sort_dir);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const orderColumn = sortBy && ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'created_at';
  const orderAscending = sortDir && ALLOWED_SORT_DIRS.has(sortDir) ? sortDir === 'asc' : false;

  let query = adminClient
    .from('_admin_orgs_summary')
    .select('*', { count: 'exact' })
    .order(orderColumn, { ascending: orderAscending });

  if (search) {
    query = query.or(`name.ilike.%${search}%,owner_email.ilike.%${search}%`);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (plan) {
    query = query.eq('plan', plan);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw { status: 500, code: 'list_orgs_failed' };
  }

  await writeAuditLog(
    adminClient,
    admin,
    'list_orgs',
    {
      target_type: 'read',
      target_id: 'orgs',
    },
    req,
  );

  return {
    ok: true,
    orgs: data ?? [],
    total: count ?? 0,
    page,
    per_page: perPage,
  };
}

async function handleGetOrgDetails(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
    const timelinePageInput = Number(payload.timeline_page);
    const timelinePerPageInput = Number(payload.timeline_per_page);
    const timelinePage = Number.isFinite(timelinePageInput)
      ? Math.min(1000, Math.max(1, Math.floor(timelinePageInput)))
      : 1;
    const timelinePerPage = Number.isFinite(timelinePerPageInput)
      ? Math.min(100, Math.max(5, Math.floor(timelinePerPageInput)))
      : 10;
    const timelineEventType = toTrimmedString(payload.timeline_event_type);
    const timelineFrom = (timelinePage - 1) * timelinePerPage;
    const timelineTo = timelineFrom + timelinePerPage - 1;

  const orgId = payload.org_id;
  if (!isUuid(orgId)) {
    throw { status: 400, code: 'invalid_org_id' };
  }

  const { data: org, error: orgError } = await adminClient
    .from('_admin_orgs_summary')
    .select('*')
    .eq('id', orgId)
    .maybeSingle();

  if (orgError) {
    throw { status: 500, code: 'org_lookup_failed' };
  }
  if (!org) {
    throw { status: 404, code: 'org_not_found' };
  }

  const members = await listOrgMembersWithProfiles(adminClient, orgId);
  const stats = {
    member_count: Number((org as Record<string, unknown>).member_count ?? 0),
    lead_count: Number((org as Record<string, unknown>).lead_count ?? 0),
    proposal_count: Number((org as Record<string, unknown>).proposal_count ?? 0),
    instance_count: Number((org as Record<string, unknown>).instance_count ?? 0),
  };

  const { data: orgBillingData, error: orgBillingError } = await adminClient
    .from('organizations')
    .select(
      'subscription_status, stripe_subscription_id, stripe_checkout_session_id, stripe_price_id, trial_ends_at, grace_ends_at, current_period_end',
    )
    .eq('id', orgId)
    .maybeSingle();

  if (orgBillingError) {
    throw { status: 500, code: 'org_billing_lookup_failed' };
  }

  const { data: stripeCustomerData, error: stripeCustomerError } = await adminClient
    .from('stripe_customers')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  if (stripeCustomerError) {
    throw { status: 500, code: 'stripe_customer_lookup_failed' };
  }

  let timelineQuery = adminClient
    .from('org_billing_timeline')
    .select('id, event_type, actor, payload, created_at', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (timelineEventType) {
    timelineQuery = timelineQuery.eq('event_type', timelineEventType);
  }

  const {
    data: timelineData,
    error: timelineError,
    count: timelineTotal,
  } = await timelineQuery.range(timelineFrom, timelineTo);

  if (timelineError) {
    throw { status: 500, code: 'billing_timeline_lookup_failed' };
  }

  const { data: creditBalancesData, error: creditBalancesError } = await adminClient
    .from('credit_balances')
    .select('credit_type, balance, updated_at')
    .eq('org_id', orgId)
    .order('credit_type', { ascending: true });

  if (creditBalancesError) {
    throw { status: 500, code: 'credit_balances_lookup_failed' };
  }

  const orgBilling = isRecord(orgBillingData) ? orgBillingData : {};
  const timeline = (timelineData ?? []).map((entry) => ({
    id: Number(entry.id ?? 0),
    event_type: String(entry.event_type ?? 'unknown_event'),
    actor: String(entry.actor ?? 'system'),
    payload: isRecord(entry.payload) ? entry.payload : {},
    created_at: String(entry.created_at ?? new Date().toISOString()),
  }));
  const creditBalances = (creditBalancesData ?? []).map((balanceRow) => ({
    credit_type: String(balanceRow.credit_type ?? 'unknown'),
    balance: Number(balanceRow.balance ?? 0),
    updated_at: String(balanceRow.updated_at ?? new Date().toISOString()),
  }));

  await writeAuditLog(
    adminClient,
    admin,
    'get_org_details',
    {
      target_type: 'organization',
      target_id: orgId,
      org_id: orgId,
    },
    req,
  );

  return {
    ok: true,
    org,
    members,
    stats,
    billing: {
      subscription_status: String(orgBilling.subscription_status ?? 'none'),
      stripe_subscription_id: toTrimmedString(orgBilling.stripe_subscription_id),
      stripe_checkout_session_id: toTrimmedString(orgBilling.stripe_checkout_session_id),
      stripe_price_id: toTrimmedString(orgBilling.stripe_price_id),
      trial_ends_at: toTrimmedString(orgBilling.trial_ends_at),
      grace_ends_at: toTrimmedString(orgBilling.grace_ends_at),
      current_period_end: toTrimmedString(orgBilling.current_period_end),
      stripe_customer_id: toTrimmedString(stripeCustomerData?.stripe_customer_id),
      timeline,
      timeline_total: Number(timelineTotal ?? 0),
      timeline_page: timelinePage,
      timeline_per_page: timelinePerPage,
      credit_balances: creditBalances,
    },
  };
}

async function handleCheckUserOrgStatus(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const email = normalizeEmail(payload.email);
  if (!email) throw { status: 400, code: 'invalid_email' };

  const user = await findAuthUserByEmail(adminClient, email);
  if (!user || !user.id) {
    return {
      ok: true,
      email,
      exists: false,
      has_org: false,
      user_id: null,
      org_id: null,
      org_name: null,
    };
  }

  const linkedOrg = await resolveUserLinkedOrg(adminClient, user.id);

  await writeAuditLog(
    adminClient,
    admin,
    'check_user_org_status',
    {
      target_type: 'read',
      target_id: email,
      org_id: linkedOrg?.org_id ?? null,
    },
    req,
  );

  return {
    ok: true,
    email,
    exists: true,
    has_org: Boolean(linkedOrg?.org_id),
    user_id: user.id,
    org_id: linkedOrg?.org_id ?? null,
    org_name: linkedOrg?.org_name ?? null,
  };
}

async function handleListOrphanUsers(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const { page, perPage } = parsePagination(payload, { page: 1, perPage: 20, maxPerPage: 50 });
  const search = toTrimmedString(payload.search)?.toLowerCase() ?? null;

  const allUsers: Array<{ id: string; email: string | null; created_at: string | null }> = [];
  const usersPerPage = 1000;

  for (let usersPage = 1; usersPage <= 100; usersPage += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page: usersPage, perPage: usersPerPage });
    if (error) {
      throw { status: 500, code: 'users_list_failed' };
    }
    const users = data.users ?? [];
    for (const user of users) {
      const email = user.email ?? null;
      if (search && !(email || '').toLowerCase().includes(search)) {
        continue;
      }
      allUsers.push({
        id: user.id,
        email,
        created_at: user.created_at ?? null,
      });
    }
    if (users.length < usersPerPage) break;
  }

  const [{ data: memberships, error: membershipError }, { data: ownedOrgs, error: ownerError }] = await Promise.all([
    adminClient.from('organization_members').select('user_id'),
    adminClient.from('organizations').select('owner_id'),
  ]);

  if (membershipError || ownerError) {
    throw { status: 500, code: 'orphan_users_lookup_failed' };
  }

  const linkedUserIds = new Set<string>();
  for (const row of memberships ?? []) {
    if (typeof row.user_id === 'string' && row.user_id) {
      linkedUserIds.add(row.user_id);
    }
  }
  for (const row of ownedOrgs ?? []) {
    if (typeof row.owner_id === 'string' && row.owner_id) {
      linkedUserIds.add(row.owner_id);
    }
  }

  const orphanUsers = allUsers
    .filter((user) => !linkedUserIds.has(user.id))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') * -1);

  const from = (page - 1) * perPage;
  const to = from + perPage;

  await writeAuditLog(
    adminClient,
    admin,
    'list_orphan_users',
    {
      target_type: 'read',
      target_id: 'orphan_users',
    },
    req,
  );

  return {
    ok: true,
    users: orphanUsers.slice(from, to),
    total: orphanUsers.length,
    page,
    per_page: perPage,
  };
}

async function handleCreateOrgWithUser(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const email = normalizeEmail(payload.email);
  if (!email) throw { status: 400, code: 'invalid_email' };

  const passwordInput = toTrimmedString(payload.password);
  const orgNameInput = toTrimmedString(payload.org_name);
  const requestedPlan = toTrimmedString(payload.plan);
  const startTrial = payload.start_trial === true;

  let user = await findAuthUserByEmail(adminClient, email);
  let tempPassword: string | null = null;
  let userCreated = false;

  if (user?.id) {
    const linkedOrg = await resolveUserLinkedOrg(adminClient, user.id);
    if (linkedOrg?.org_id) {
      throw { status: 409, code: 'user_already_has_org' };
    }
  } else {
    const generatedPassword = passwordInput || generateTempPassword();
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
    });

    if (createError || !createData.user?.id) {
      throw { status: 500, code: 'create_user_failed' };
    }

    user = createData.user;
    userCreated = true;
    tempPassword = passwordInput ? null : generatedPassword;
  }

  if (!user?.id) {
    throw { status: 500, code: 'user_resolution_failed' };
  }

  const fallbackName = `Organizacao de ${email}`;
  const orgName = orgNameInput || fallbackName;
  const nowIso = new Date().toISOString();
  const trialEndsAtIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const orgInsertPayload: Record<string, unknown> = {
    name: orgName,
    owner_id: user.id,
    status: 'active',
    onboarding_state: 'pending_checkout',
    subscription_status: startTrial ? 'trialing' : 'pending_checkout',
    trial_days: 7,
    trial_started_at: startTrial ? nowIso : null,
    trial_ends_at: startTrial ? trialEndsAtIso : null,
  };

  const { data: insertedOrg, error: orgInsertError } = await adminClient
    .from('organizations')
    .insert(orgInsertPayload)
    .select('id, name, owner_id, plan, plan_limits, subscription_status, trial_ends_at')
    .single();

  if (orgInsertError || !insertedOrg?.id) {
    throw { status: 500, code: 'create_org_failed' };
  }

  const orgId = String(insertedOrg.id);

  const { error: membershipError } = await adminClient
    .from('organization_members')
    .upsert(
      {
        org_id: orgId,
        user_id: user.id,
        role: 'owner',
        can_view_team_leads: true,
      },
      { onConflict: 'org_id,user_id' },
    );

  if (membershipError) {
    throw { status: 500, code: 'owner_membership_failed' };
  }

  let appliedPlan: string | null = null;
  if (requestedPlan) {
    const resolvedPlan = await getPlanLimitsByKey(adminClient, requestedPlan);
    const planUpdatePayload: Record<string, unknown> = {
      plan: resolvedPlan.plan,
      plan_limits: resolvedPlan.limits,
    };
    if (resolvedPlan.plan === 'unlimited') {
      planUpdatePayload.subscription_status = 'active';
    }

    const { error: planUpdateError } = await adminClient
      .from('organizations')
      .update(planUpdatePayload)
      .eq('id', orgId);

    if (planUpdateError) {
      throw { status: 500, code: 'apply_plan_failed' };
    }
    appliedPlan = resolvedPlan.plan;
  }

  await writeAuditLog(
    adminClient,
    admin,
    'create_org_with_user',
    {
      target_type: 'organization',
      target_id: orgId,
      org_id: orgId,
      after: {
        org_id: orgId,
        user_id: user.id,
        user_email: email,
        user_created: userCreated,
        plan: appliedPlan,
        start_trial: startTrial,
      },
      reason: 'Admin create org with user',
    },
    req,
  );

  return {
    ok: true,
    org_id: orgId,
    user_id: user.id,
    user_email: email,
    user_created: userCreated,
    temp_password: tempPassword,
    plan: appliedPlan,
  };
}

async function handleListOrgMembers(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const orgId = payload.org_id;
  if (!isUuid(orgId)) {
    throw { status: 400, code: 'invalid_org_id' };
  }

  const members = await listOrgMembersWithProfiles(adminClient, orgId);

  await writeAuditLog(
    adminClient,
    admin,
    'list_org_members',
    {
      target_type: 'organization',
      target_id: orgId,
      org_id: orgId,
    },
    req,
  );

  return {
    ok: true,
    members,
  };
}

async function handleGetSystemMetrics(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  req: Request,
) {
  const [orgsResult, leadsResult, proposalsResult, instancesResult, totalUsers] =
    await Promise.all([
      adminClient.from('organizations').select('id', { count: 'exact', head: true }),
      adminClient.from('leads').select('id', { count: 'exact', head: true }),
      adminClient.from('propostas').select('id', { count: 'exact', head: true }),
      adminClient
        .from('whatsapp_instances')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .in('status', ['connected', 'open']),
      countAuthUsers(adminClient),
    ]);

  if (orgsResult.error || leadsResult.error || proposalsResult.error || instancesResult.error) {
    throw { status: 500, code: 'metrics_query_failed' };
  }

  await writeAuditLog(
    adminClient,
    admin,
    'get_system_metrics',
    {
      target_type: 'read',
      target_id: 'metrics',
    },
    req,
  );

  return {
    ok: true,
    metrics: {
      total_orgs: orgsResult.count ?? 0,
      total_users: totalUsers,
      total_leads: leadsResult.count ?? 0,
      total_proposals: proposalsResult.count ?? 0,
      active_instances: instancesResult.count ?? 0,
    },
  };
}

async function handleListAuditLog(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const { page, perPage } = parsePagination(payload);
  const filters = toJsonBody(payload.filters);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = adminClient
    .from('_admin_audit_log')
    .select('*', { count: 'exact' })
    .order('ts', { ascending: false });

  const actorUserId = filters.actor_user_id;
  if (actorUserId !== undefined) {
    if (!isUuid(actorUserId)) throw { status: 400, code: 'invalid_actor_user_id' };
    query = query.eq('actor_user_id', actorUserId);
  }

  const orgId = filters.org_id;
  if (orgId !== undefined) {
    if (!isUuid(orgId)) throw { status: 400, code: 'invalid_org_id' };
    query = query.eq('org_id', orgId);
  }

  const action = toTrimmedString(filters.action);
  if (action) query = query.eq('action', action);

  const targetType = toTrimmedString(filters.target_type);
  if (targetType) query = query.eq('target_type', targetType);

  const dateFrom = toTrimmedString(filters.date_from);
  if (dateFrom) query = query.gte('ts', dateFrom);

  const dateTo = toTrimmedString(filters.date_to);
  if (dateTo) query = query.lte('ts', dateTo);

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw { status: 500, code: 'list_audit_log_failed' };
  }

  await writeAuditLog(
    adminClient,
    admin,
    'list_audit_log',
    {
      target_type: 'audit',
      target_id: 'audit-log',
    },
    req,
  );

  return {
    ok: true,
    entries: data ?? [],
    total: count ?? 0,
    page,
    per_page: perPage,
  };
}

async function fetchOrganizationState(adminClient: ReturnType<typeof createClient>, orgId: string) {
  const { data, error } = await adminClient
    .from('organizations')
    .select('id, status, suspended_at, suspended_by, suspension_reason, plan, plan_limits')
    .eq('id', orgId)
    .maybeSingle();

  if (error) throw { status: 500, code: 'org_state_fetch_failed' };
  if (!data) throw { status: 404, code: 'org_not_found' };
  return data;
}

async function handleSuspendOrg(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const orgId = payload.org_id;
  if (!isUuid(orgId)) throw { status: 400, code: 'invalid_org_id' };

  const reason = toReason(payload.reason);
  if (!reason) throw { status: 400, code: 'reason_required' };

  const before = await fetchOrganizationState(adminClient, orgId);
  const { data: updated, error: updateError } = await adminClient
    .from('organizations')
    .update({
      status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspended_by: admin.user_id,
      suspension_reason: reason,
    })
    .eq('id', orgId)
    .select('id, status, suspended_at, suspended_by, suspension_reason, plan, plan_limits')
    .single();

  if (updateError) throw { status: 500, code: 'suspend_org_failed' };

  await writeAuditLog(
    adminClient,
    admin,
    'suspend_org',
    {
      target_type: 'organization',
      target_id: orgId,
      org_id: orgId,
      before,
      after: updated,
      reason,
    },
    req,
  );

  return {
    ok: true,
    org: updated,
  };
}

async function handleReactivateOrg(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const orgId = payload.org_id;
  if (!isUuid(orgId)) throw { status: 400, code: 'invalid_org_id' };

  const reason = toReason(payload.reason);
  if (!reason) throw { status: 400, code: 'reason_required' };

  const before = await fetchOrganizationState(adminClient, orgId);
  const { data: updated, error: updateError } = await adminClient
    .from('organizations')
    .update({
      status: 'active',
      suspended_at: null,
      suspended_by: null,
      suspension_reason: null,
    })
    .eq('id', orgId)
    .select('id, status, suspended_at, suspended_by, suspension_reason, plan, plan_limits')
    .single();

  if (updateError) throw { status: 500, code: 'reactivate_org_failed' };

  await writeAuditLog(
    adminClient,
    admin,
    'reactivate_org',
    {
      target_type: 'organization',
      target_id: orgId,
      org_id: orgId,
      before,
      after: updated,
      reason,
    },
    req,
  );

  return {
    ok: true,
    org: updated,
  };
}

async function handleUpdateOrgPlan(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const orgId = payload.org_id;
  if (!isUuid(orgId)) throw { status: 400, code: 'invalid_org_id' };

  const reason = toReason(payload.reason);
  if (!reason) throw { status: 400, code: 'reason_required' };

  const plan = toTrimmedString(payload.plan);
  if (!plan) throw { status: 400, code: 'invalid_plan' };

  const limits = payload.limits ?? {};
  if (typeof limits !== 'object' || limits === null || Array.isArray(limits)) {
    throw { status: 400, code: 'invalid_limits' };
  }

  const VALID_SUB_STATUSES = ['none', 'pending_checkout', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'];
  const rawSubStatus = toTrimmedString(payload.subscription_status);
  const subscriptionStatus = rawSubStatus && VALID_SUB_STATUSES.includes(rawSubStatus) ? rawSubStatus : null;

  const updatePayload: Record<string, unknown> = {
    plan,
    plan_limits: limits,
  };
  if (subscriptionStatus) {
    updatePayload.subscription_status = subscriptionStatus;
  }

  const before = await fetchOrganizationState(adminClient, orgId);
  const { data: updated, error: updateError } = await adminClient
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId)
    .select('id, status, suspended_at, suspended_by, suspension_reason, plan, plan_limits, subscription_status')
    .single();

  if (updateError) throw { status: 500, code: 'update_org_plan_failed' };

  await writeAuditLog(
    adminClient,
    admin,
    'update_org_plan',
    {
      target_type: 'organization',
      target_id: orgId,
      org_id: orgId,
      before,
      after: updated,
      reason,
    },
    req,
  );

  return {
    ok: true,
    org: updated,
  };
}

async function handleListFeatureFlags(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const orgId = payload.org_id;
  if (orgId !== undefined && !isUuid(orgId)) {
    throw { status: 400, code: 'invalid_org_id' };
  }

  const { data: flags, error: flagsError } = await adminClient
    .from('_admin_feature_flags')
    .select('flag_key, description, default_enabled, created_at, updated_at')
    .order('flag_key', { ascending: true });
  if (flagsError) throw { status: 500, code: 'list_feature_flags_failed' };

  let overridesByKey: Record<string, boolean> = {};
  if (isUuid(orgId)) {
    const { data: overrides, error: overridesError } = await adminClient
      .from('_admin_org_feature_overrides')
      .select('flag_key, enabled')
      .eq('org_id', orgId);
    if (overridesError) throw { status: 500, code: 'list_feature_overrides_failed' };
    overridesByKey = Object.fromEntries(
      (overrides ?? [])
        .filter((row) => typeof row.flag_key === 'string')
        .map((row) => [String(row.flag_key), row.enabled === true]),
    );
  }

  const resolved = (flags ?? []).map((flag) => {
    const key = String(flag.flag_key);
    const hasOverride = Object.prototype.hasOwnProperty.call(overridesByKey, key);
    return {
      ...flag,
      org_override_enabled: hasOverride ? overridesByKey[key] : null,
      effective_enabled: hasOverride ? overridesByKey[key] : flag.default_enabled === true,
    };
  });

  await writeAuditLog(
    adminClient,
    admin,
    'list_feature_flags',
    {
      target_type: 'read',
      target_id: 'feature_flags',
      org_id: isUuid(orgId) ? orgId : null,
    },
    req,
  );

  return {
    ok: true,
    flags: resolved,
  };
}

async function handleCreateFeatureFlag(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const reason = toReason(payload.reason);
  if (!reason) throw { status: 400, code: 'reason_required' };

  const flagKey = toTrimmedString(payload.flag_key);
  if (!flagKey || !FLAG_KEY_REGEX.test(flagKey)) {
    throw { status: 400, code: 'invalid_flag_key' };
  }

  const description = toTrimmedString(payload.description);
  const defaultEnabled = payload.default_enabled === true;

  const { data: existing, error: existingError } = await adminClient
    .from('_admin_feature_flags')
    .select('flag_key')
    .eq('flag_key', flagKey)
    .maybeSingle();

  if (existingError) throw { status: 500, code: 'feature_flag_lookup_failed' };
  if (existing) throw { status: 409, code: 'feature_flag_exists' };

  const { data: inserted, error: insertError } = await adminClient
    .from('_admin_feature_flags')
    .insert({
      flag_key: flagKey,
      description: description ?? null,
      default_enabled: defaultEnabled,
    })
    .select('flag_key, description, default_enabled, created_at, updated_at')
    .single();

  if (insertError) throw { status: 500, code: 'create_feature_flag_failed' };

  await writeAuditLog(
    adminClient,
    admin,
    'create_feature_flag',
    {
      target_type: 'feature_flag',
      target_id: flagKey,
      after: inserted,
      reason,
    },
    req,
  );

  return {
    ok: true,
    flag: inserted,
  };
}

async function handleSetOrgFeature(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const reason = toReason(payload.reason);
  if (!reason) throw { status: 400, code: 'reason_required' };

  const orgId = payload.org_id;
  if (!isUuid(orgId)) throw { status: 400, code: 'invalid_org_id' };

  const flagKey = toTrimmedString(payload.flag_key);
  if (!flagKey || !FLAG_KEY_REGEX.test(flagKey)) {
    throw { status: 400, code: 'invalid_flag_key' };
  }

  if (typeof payload.enabled !== 'boolean') {
    throw { status: 400, code: 'invalid_enabled' };
  }

  const enabled = payload.enabled === true;

  const { data: before, error: beforeError } = await adminClient
    .from('_admin_org_feature_overrides')
    .select('org_id, flag_key, enabled, updated_at, updated_by')
    .eq('org_id', orgId)
    .eq('flag_key', flagKey)
    .maybeSingle();
  if (beforeError) throw { status: 500, code: 'feature_override_lookup_failed' };

  const { error: upsertError } = await adminClient
    .from('_admin_org_feature_overrides')
    .upsert(
      {
        org_id: orgId,
        flag_key: flagKey,
        enabled,
        updated_at: new Date().toISOString(),
        updated_by: admin.user_id,
      },
      { onConflict: 'org_id,flag_key' },
    );
  if (upsertError) throw { status: 500, code: 'set_org_feature_failed' };

  const { data: after, error: afterError } = await adminClient
    .from('_admin_org_feature_overrides')
    .select('org_id, flag_key, enabled, updated_at, updated_by')
    .eq('org_id', orgId)
    .eq('flag_key', flagKey)
    .single();
  if (afterError) throw { status: 500, code: 'feature_override_fetch_after_failed' };

  await writeAuditLog(
    adminClient,
    admin,
    'set_org_feature',
    {
      target_type: 'feature_override',
      target_id: `${orgId}:${flagKey}`,
      org_id: orgId,
      before,
      after,
      reason,
    },
    req,
  );

  return {
    ok: true,
    override: after,
  };
}

async function handleDeleteOrg(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const orgId = payload.org_id;
  if (!isUuid(orgId)) throw { status: 400, code: 'invalid_org_id' };

  const reason = toReason(payload.reason);
  if (!reason) throw { status: 400, code: 'reason_required' };

  const confirmation = toTrimmedString(payload.confirmation);
  if (confirmation !== 'EXCLUIR') {
    throw { status: 400, code: 'confirmation_required' };
  }

  // Fetch full org state for audit
  const { data: orgBefore, error: orgError } = await adminClient
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle();
  if (orgError) throw { status: 500, code: 'org_state_fetch_failed' };
  if (!orgBefore) throw { status: 404, code: 'org_not_found' };

  // Fetch members for audit snapshot
  const { data: membersBefore } = await adminClient
    .from('organization_members')
    .select('user_id, role')
    .eq('org_id', orgId);

  // Fetch counts for audit
  const [leadsCount, proposalsCount, instancesCount] = await Promise.all([
    adminClient.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    adminClient.from('propostas').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    adminClient.from('whatsapp_instances').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
  ]);

  const snapshot = {
    org: orgBefore,
    members: membersBefore ?? [],
    counts: {
      leads: leadsCount.count ?? 0,
      proposals: proposalsCount.count ?? 0,
      instances: instancesCount.count ?? 0,
    },
  };

  // Delete related data first (cascade should handle most, but be explicit)
  await adminClient.from('_admin_org_feature_overrides').delete().eq('org_id', orgId);
  await adminClient.from('whatsapp_instances').delete().eq('org_id', orgId);
  await adminClient.from('propostas').delete().eq('org_id', orgId);
  await adminClient.from('leads').delete().eq('org_id', orgId);
  await adminClient.from('organization_members').delete().eq('org_id', orgId);

  // Delete the organization itself
  const { error: deleteError } = await adminClient
    .from('organizations')
    .delete()
    .eq('id', orgId);
  if (deleteError) throw { status: 500, code: 'delete_org_failed' };

  await writeAuditLog(
    adminClient,
    admin,
    'delete_org',
    {
      target_type: 'organization',
      target_id: orgId,
      org_id: orgId,
      before: snapshot,
      after: null,
      reason,
    },
    req,
  );

  return {
    ok: true,
    deleted_org_id: orgId,
  };
}

async function handleBulkDeleteOrgs(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
) {
  const reason = toReason(payload.reason);
  if (!reason) throw { status: 400, code: 'reason_required' };

  const confirmation = toTrimmedString(payload.confirmation);
  if (confirmation !== 'EXCLUIR') {
    throw { status: 400, code: 'confirmation_required' };
  }

  const orgIds = payload.org_ids;
  if (!Array.isArray(orgIds) || orgIds.length === 0) {
    throw { status: 400, code: 'invalid_org_ids' };
  }
  if (orgIds.length > 50) {
    throw { status: 400, code: 'too_many_org_ids' };
  }

  const validIds = orgIds.filter((id) => isUuid(id));
  if (validIds.length === 0) {
    throw { status: 400, code: 'invalid_org_ids' };
  }

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const orgId of validIds) {
    try {
      await handleDeleteOrg(adminClient, admin, {
        org_id: orgId,
        reason,
        confirmation: 'EXCLUIR',
      }, req);
      deleted.push(orgId as string);
    } catch (err: unknown) {
      const code = (err && typeof err === 'object' && 'code' in err)
        ? String((err as Record<string, unknown>).code)
        : 'unknown';
      failed.push({ id: orgId as string, error: code });
    }
  }

  return {
    ok: true,
    deleted,
    failed,
  };
}

async function handleListSubscriptionPlans(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  req: Request,
) {
  const { data: plans, error } = await adminClient
    .from('_admin_subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw { status: 500, code: 'list_plans_failed' };

  await writeAuditLog(
    adminClient,
    admin,
    'list_subscription_plans',
    {
      target_type: 'read',
      target_id: 'subscription_plans',
    },
    req,
  );

  return {
    ok: true,
    plans: plans ?? [],
  };
}

async function handleGetFinancialSummary(
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  req: Request,
) {
  // Get all orgs with plan info
  const { data: orgs, error: orgsError } = await adminClient
    .from('organizations')
    .select('id, plan, status, created_at, plan_started_at');
  if (orgsError) throw { status: 500, code: 'financial_orgs_query_failed' };

  // Get plans for price lookup
  const { data: plans, error: plansError } = await adminClient
    .from('_admin_subscription_plans')
    .select('plan_key, price_cents, display_name');
  if (plansError) throw { status: 500, code: 'financial_plans_query_failed' };

  const priceMap: Record<string, number> = {};
  for (const plan of plans ?? []) {
    priceMap[plan.plan_key] = plan.price_cents;
  }

  const allOrgs = orgs ?? [];
  const activeOrgs = allOrgs.filter((o) => o.status === 'active');
  const suspendedOrgs = allOrgs.filter((o) => o.status === 'suspended');
  const churnedOrgs = allOrgs.filter((o) => o.status === 'churned');

  // Distribution by plan
  const planDistribution: Record<string, number> = {};
  for (const org of activeOrgs) {
    const plan = org.plan || 'free';
    planDistribution[plan] = (planDistribution[plan] || 0) + 1;
  }

  // MRR calculated from active orgs
  let mrrCents = 0;
  for (const org of activeOrgs) {
    const plan = org.plan || 'free';
    mrrCents += priceMap[plan] ?? 0;
  }

  // Paying customers (non-free active)
  const payingOrgs = activeOrgs.filter((o) => (o.plan || 'free') !== 'free');
  const avgTicketCents = payingOrgs.length > 0
    ? Math.round(mrrCents / payingOrgs.length)
    : 0;

  // Simple churn rate: churned / (active + churned) in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recentChurned = churnedOrgs.filter(
    (o) => o.created_at && o.created_at >= thirtyDaysAgo,
  ).length;
  const churnRate = (activeOrgs.length + recentChurned) > 0
    ? Number(((recentChurned / (activeOrgs.length + recentChurned)) * 100).toFixed(2))
    : 0;

  await writeAuditLog(
    adminClient,
    admin,
    'get_financial_summary',
    {
      target_type: 'read',
      target_id: 'financial_summary',
    },
    req,
  );

  return {
    ok: true,
    summary: {
      mrr_cents: mrrCents,
      arr_cents: mrrCents * 12,
      total_orgs: allOrgs.length,
      active_orgs: activeOrgs.length,
      suspended_orgs: suspendedOrgs.length,
      churned_orgs: churnedOrgs.length,
      paying_orgs: payingOrgs.length,
      free_orgs: activeOrgs.length - payingOrgs.length,
      avg_ticket_cents: avgTicketCents,
      churn_rate_percent: churnRate,
      plan_distribution: planDistribution,
    },
  };
}

async function dispatchAction(
  action: string,
  adminClient: ReturnType<typeof createClient>,
  admin: AdminIdentity,
  payload: Record<string, unknown>,
  req: Request,
  aal: string,
) {
  switch (action) {
    case 'whoami':
      return await handleWhoAmI(adminClient, admin, aal, req);
    case 'list_orgs':
      return await handleListOrgs(adminClient, admin, payload, req);
    case 'list_orphan_users':
      return await handleListOrphanUsers(adminClient, admin, payload, req);
    case 'check_user_org_status':
      return await handleCheckUserOrgStatus(adminClient, admin, payload, req);
    case 'get_org_details':
      return await handleGetOrgDetails(adminClient, admin, payload, req);
    case 'list_org_members':
      return await handleListOrgMembers(adminClient, admin, payload, req);
    case 'get_system_metrics':
      return await handleGetSystemMetrics(adminClient, admin, req);
    case 'list_audit_log':
      return await handleListAuditLog(adminClient, admin, payload, req);
    case 'suspend_org':
      return await handleSuspendOrg(adminClient, admin, payload, req);
    case 'reactivate_org':
      return await handleReactivateOrg(adminClient, admin, payload, req);
    case 'update_org_plan':
      return await handleUpdateOrgPlan(adminClient, admin, payload, req);
    case 'list_feature_flags':
      return await handleListFeatureFlags(adminClient, admin, payload, req);
    case 'create_feature_flag':
      return await handleCreateFeatureFlag(adminClient, admin, payload, req);
    case 'set_org_feature':
      return await handleSetOrgFeature(adminClient, admin, payload, req);
    case 'delete_org':
      return await handleDeleteOrg(adminClient, admin, payload, req);
    case 'bulk_delete_orgs':
      return await handleBulkDeleteOrgs(adminClient, admin, payload, req);
    case 'create_org_with_user':
      return await handleCreateOrgWithUser(adminClient, admin, payload, req);
    case 'list_subscription_plans':
      return await handleListSubscriptionPlans(adminClient, admin, req);
    case 'get_financial_summary':
      return await handleGetFinancialSummary(adminClient, admin, req);
    default:
      throw { status: 403, code: 'action_not_allowed' };
  }
}

Deno.serve(async (req) => {
  const requestId = req.headers.get('x-request-id')?.trim() || crypto.randomUUID();
  const requestOrigin = req.headers.get('origin')?.trim() || null;
  const allowedOrigins = resolveAllowedOriginsFromEnv();
  if (allowedOrigins.length === 0) {
    logAccessDecision('error', {
      origin: requestOrigin,
      decision_code: 'missing_allowed_origin',
      request_id: requestId,
      status: 500,
    });
    return json(500, { ok: false, code: 'missing_allowed_origin' }, { 'x-admin-request-id': requestId });
  }

  const allowedOrigin = resolveAllowedOrigin(req, allowedOrigins);
  const corsHeaders = corsForOrigin(allowedOrigin ?? allowedOrigins[0]);
  const responseHeaders = {
    ...corsHeaders,
    'x-admin-request-id': requestId,
  };

  if (!allowedOrigin) {
    logAccessDecision('warn', {
      origin: requestOrigin,
      decision_code: 'forbidden_origin',
      request_id: requestId,
      status: 403,
    });
    return json(403, { ok: false, code: 'forbidden_origin' }, responseHeaders);
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: responseHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, code: 'method_not_allowed' }, responseHeaders);
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    logAccessDecision('error', {
      origin: requestOrigin,
      decision_code: 'missing_env',
      request_id: requestId,
      status: 500,
    });
    return json(500, { ok: false, code: 'missing_env' }, responseHeaders);
  }

  let payload: Record<string, unknown>;
  try {
    payload = toJsonBody(await req.json());
  } catch {
    logAccessDecision('warn', {
      origin: requestOrigin,
      decision_code: 'invalid_json',
      request_id: requestId,
      status: 400,
    });
    return json(400, { ok: false, code: 'invalid_json' }, responseHeaders);
  }

  const bodyAccessToken = toTrimmedString(payload._admin_access_token);
  delete payload._admin_access_token;

  const authHeader =
    (bodyAccessToken ? `Bearer ${bodyAccessToken}` : '') ||
    req.headers.get('x-admin-authorization') ||
    req.headers.get('authorization') ||
    '';
  if (!/^Bearer\s+/i.test(authHeader)) {
    logAccessDecision('warn', {
      origin: requestOrigin,
      decision_code: 'missing_auth',
      request_id: requestId,
      status: 401,
    });
    return json(401, { ok: false, code: 'missing_auth' }, responseHeaders);
  }

  const aal = extractAalFromAuthHeader(authHeader);

  const action = typeof payload.action === 'string' ? payload.action.trim() : '';
  if (!action) {
    logAccessDecision('warn', {
      origin: requestOrigin,
      aal,
      decision_code: 'missing_action',
      request_id: requestId,
      status: 400,
    });
    return json(400, { ok: false, code: 'missing_action' }, responseHeaders);
  }

  let resolvedUserId: string | null = null;

  try {
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser(stripBearer(authHeader));
    if (userError || !userData.user) {
      logAccessDecision('warn', {
        action,
        origin: requestOrigin,
        aal,
        decision_code: 'unauthorized',
        request_id: requestId,
        status: 401,
        error: userError,
      });
      return json(401, { ok: false, code: 'unauthorized' }, responseHeaders);
    }

    resolvedUserId = userData.user.id;
    const admin = await enforcePolicy(adminClient, resolvedUserId, action, aal);
    const result = await dispatchAction(action, adminClient, admin, payload, req, aal);
    return json(200, result, responseHeaders);
  } catch (error) {
    const status = toErrorStatus(error);
    const code = toErrorCode(error);
    logAccessDecision(status >= 500 ? 'error' : 'warn', {
      action,
      origin: requestOrigin,
      aal,
      resolved_user_id:
        resolvedUserId || (isRecord(error) && typeof error.user_id === 'string' ? error.user_id : null),
      decision_code: code,
      request_id: requestId,
      status,
      error: status >= 500 ? error : undefined,
    });
    return json(status, { ok: false, code }, responseHeaders);
  }
});
