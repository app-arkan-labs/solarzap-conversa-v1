import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type SystemRole = 'super_admin' | 'ops' | 'support' | 'billing' | 'read_only';

export type AdminApiAction =
  | 'whoami'
  | 'list_orgs'
  | 'get_org_details'
  | 'list_org_members'
  | 'get_system_metrics'
  | 'list_audit_log'
  | 'suspend_org'
  | 'reactivate_org'
  | 'update_org_plan'
  | 'list_feature_flags'
  | 'create_feature_flag'
  | 'set_org_feature'
  | 'delete_org'
  | 'list_subscription_plans'
  | 'get_financial_summary';

export type AdminApiRequest = {
  action: AdminApiAction;
  [key: string]: unknown;
};

export type AdminApiErrorCode =
  | 'not_system_admin'
  | 'insufficient_role'
  | 'mfa_required'
  | 'missing_auth'
  | 'unauthorized'
  | 'forbidden_origin'
  | 'network_error'
  | 'gateway_auth_error'
  | 'admin_lookup_failed'
  | 'unknown_admin_error';

export type AdminWhoAmIResponse = {
  ok: true;
  user_id: string;
  system_role: SystemRole;
  aal: string;
};

export type AdminOrgSummary = {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string | null;
  status: string;
  plan: string;
  plan_limits: Record<string, unknown> | null;
  suspended_at: string | null;
  suspended_by: string | null;
  suspension_reason: string | null;
  member_count: number;
  lead_count: number;
  proposal_count: number;
  instance_count: number;
};

export type AdminOrgMember = {
  org_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  can_view_team_leads: boolean;
  joined_at: string | null;
};

export type AdminListOrgsResponse = {
  ok: true;
  orgs: AdminOrgSummary[];
  total: number;
  page: number;
  per_page: number;
};

export type AdminOrgDetailsResponse = {
  ok: true;
  org: AdminOrgSummary;
  members: AdminOrgMember[];
  stats: {
    member_count: number;
    lead_count: number;
    proposal_count: number;
    instance_count: number;
  };
  billing: {
    subscription_status: string;
    stripe_subscription_id: string | null;
    stripe_checkout_session_id: string | null;
    stripe_price_id: string | null;
    trial_ends_at: string | null;
    grace_ends_at: string | null;
    current_period_end: string | null;
    stripe_customer_id: string | null;
    timeline: {
      id: number;
      event_type: string;
      actor: string;
      payload: Record<string, unknown>;
      created_at: string;
    }[];
    timeline_total: number;
    timeline_page: number;
    timeline_per_page: number;
    credit_balances: {
      credit_type: string;
      balance: number;
      updated_at: string;
    }[];
  };
};

export type AdminOrgMembersResponse = {
  ok: true;
  members: AdminOrgMember[];
};

export type AdminSystemMetricsResponse = {
  ok: true;
  metrics: {
    total_orgs: number;
    total_users: number;
    total_leads: number;
    total_proposals: number;
    active_instances: number;
  };
};

export type AdminAuditLogEntry = {
  id: string;
  ts: string;
  actor_user_id: string;
  actor_system_role: SystemRole;
  action: string;
  target_type: string;
  target_id: string | null;
  org_id: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  user_agent: string | null;
  reason: string | null;
};

export type AdminListAuditLogResponse = {
  ok: true;
  entries: AdminAuditLogEntry[];
  total: number;
  page: number;
  per_page: number;
};

export type AdminFeatureFlag = {
  flag_key: string;
  description: string | null;
  default_enabled: boolean;
  effective_enabled: boolean;
  org_override_enabled: boolean | null;
  created_at: string;
  updated_at: string;
};

export type AdminFeatureFlagsResponse = {
  ok: true;
  flags: AdminFeatureFlag[];
};

export type AdminSubscriptionPlan = {
  plan_key: string;
  display_name: string;
  price_cents: number;
  billing_cycle: string;
  limits: Record<string, unknown>;
  features: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminSubscriptionPlansResponse = {
  ok: true;
  plans: AdminSubscriptionPlan[];
};

export type AdminFinancialSummary = {
  mrr_cents: number;
  arr_cents: number;
  total_orgs: number;
  active_orgs: number;
  suspended_orgs: number;
  churned_orgs: number;
  paying_orgs: number;
  free_orgs: number;
  avg_ticket_cents: number;
  churn_rate_percent: number;
  plan_distribution: Record<string, number>;
};

export type AdminFinancialSummaryResponse = {
  ok: true;
  summary: AdminFinancialSummary;
};

export type AdminApiError = Error & {
  name: 'AdminApiError';
  action: AdminApiAction;
  code: AdminApiErrorCode;
  rawCode: string | number | null;
  status?: number;
  requestId?: string | null;
  details?: unknown;
};

type AdminApiErrorPayload = {
  ok?: boolean;
  code?: string | number;
  error?: string;
  message?: string;
  request_id?: string;
};

type AdminMutationOptions<TData> = {
  invalidate?: QueryKey[];
  onSuccess?: (data: TData, variables: AdminApiRequest) => void | Promise<void>;
  onError?: (error: AdminApiError, variables: AdminApiRequest) => void | Promise<void>;
};

const KNOWN_ADMIN_API_ERROR_CODES: AdminApiErrorCode[] = [
  'not_system_admin',
  'insufficient_role',
  'mfa_required',
  'missing_auth',
  'unauthorized',
  'forbidden_origin',
  'network_error',
  'gateway_auth_error',
  'admin_lookup_failed',
  'unknown_admin_error',
];

const KNOWN_ADMIN_API_ERROR_CODE_SET = new Set<string>(KNOWN_ADMIN_API_ERROR_CODES);
const ADMIN_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-api`;
const ADMIN_API_PUBLIC_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function extractRequestIdFromHeaders(headers: Headers | null | undefined): string | null {
  if (!headers) return null;
  return (
    headers.get('x-admin-request-id') ||
    headers.get('x-request-id') ||
    headers.get('cf-ray') ||
    null
  );
}

function extractResponseMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  return null;
}

function extractResponseCode(payload: unknown): string | number | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.code === 'string' || typeof payload.code === 'number') return payload.code;
  return null;
}

function extractErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  if (typeof error.status === 'number') return error.status;
  if (typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}

function extractErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (!isRecord(error)) return null;
  if (typeof error.message === 'string' && error.message.trim()) return error.message.trim();
  if (typeof error.error === 'string' && error.error.trim()) return error.error.trim();
  return null;
}

function extractErrorCode(error: unknown): string | number | null {
  if (!isRecord(error)) return null;
  if (typeof error.code === 'string' || typeof error.code === 'number') return error.code;
  return null;
}

export function normalizeAdminApiErrorCode(input: {
  rawCode: string | number | null;
  status?: number;
  message?: string | null;
  hasContext?: boolean;
}): AdminApiErrorCode {
  const rawCode =
    typeof input.rawCode === 'string' || typeof input.rawCode === 'number' ? input.rawCode : null;

  if (typeof rawCode === 'string' && KNOWN_ADMIN_API_ERROR_CODE_SET.has(rawCode)) {
    return rawCode as AdminApiErrorCode;
  }

  const normalizedMessage = (input.message || '').toLowerCase();
  const normalizedRawCode = typeof rawCode === 'string' ? rawCode.toLowerCase() : String(rawCode ?? '');

  if (rawCode === 401 || normalizedRawCode === '401') {
    if (normalizedMessage.includes('missing authorization header')) {
      return 'missing_auth';
    }
    return 'gateway_auth_error';
  }

  if (input.status === 401) {
    if (normalizedMessage.includes('missing authorization header')) {
      return 'missing_auth';
    }

    if (
      normalizedMessage.includes('jwt') ||
      normalizedMessage.includes('authorization') ||
      normalizedMessage.includes('unauthorized')
    ) {
      return input.hasContext === false ? 'network_error' : 'gateway_auth_error';
    }

    return 'unauthorized';
  }

  if (
    normalizedRawCode.includes('origin') ||
    normalizedMessage.includes('origin') ||
    normalizedMessage.includes('cors')
  ) {
    return 'forbidden_origin';
  }

  if (normalizedRawCode.includes('admin_lookup_failed')) {
    return 'admin_lookup_failed';
  }

  return 'unknown_admin_error';
}

export function shouldRetryAdminApiError(error: Pick<AdminApiError, 'code' | 'status'>): boolean {
  return error.status === 401 || error.code === 'gateway_auth_error' || error.code === 'missing_auth';
}

function createAdminApiError(input: {
  action: AdminApiAction;
  code: AdminApiErrorCode;
  rawCode: string | number | null;
  message: string;
  status?: number;
  requestId?: string | null;
  details?: unknown;
}): AdminApiError {
  const error = new Error(input.message) as AdminApiError;
  error.name = 'AdminApiError';
  error.action = input.action;
  error.code = input.code;
  error.rawCode = input.rawCode;
  error.status = input.status;
  error.requestId = input.requestId ?? null;
  error.details = input.details;
  return error;
}

async function parseAdminInvokeFailure(
  action: AdminApiAction,
  error: unknown,
): Promise<AdminApiError> {
  const fallbackMessage = extractErrorMessage(error) || 'Falha ao acessar admin-api.';
  const fallbackStatus = extractErrorStatus(error);
  const fallbackRawCode = extractErrorCode(error);
  return createAdminApiError({
    action,
    code: 'network_error',
    rawCode: fallbackRawCode,
    status: fallbackStatus,
    message: fallbackMessage,
    details: error,
  });
}

async function parseAdminApiErrorResponse(
  action: AdminApiAction,
  response: Response,
): Promise<AdminApiError> {
  let payload: unknown = null;

  try {
    payload = await response.clone().json();
  } catch {
    try {
      const text = await response.clone().text();
      payload = text ? { message: text } : null;
    } catch {
      payload = null;
    }
  }

  const rawCode = extractResponseCode(payload) ?? response.status;
  const message =
    extractResponseMessage(payload) ||
    `Falha ao executar ${action} no admin-api (HTTP ${response.status}).`;

  return createAdminApiError({
    action,
    code: normalizeAdminApiErrorCode({
      rawCode,
      status: response.status,
      message,
      hasContext: true,
    }),
    rawCode,
    status: response.status,
    requestId: extractRequestIdFromHeaders(response.headers),
    message,
    details: payload,
  });
}

async function getCurrentAccessToken(action: AdminApiAction): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw createAdminApiError({
      action,
      code: 'missing_auth',
      rawCode: error.code ?? null,
      status: error.status,
      message: toErrorMessage(error.message, 'Nao foi possivel ler a sessao atual.'),
    });
  }

  return data.session?.access_token ?? null;
}

async function refreshAccessToken(action: AdminApiAction): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.access_token) {
    throw createAdminApiError({
      action,
      code: 'missing_auth',
      rawCode: error?.code ?? null,
      status: error?.status,
      message: toErrorMessage(error?.message, 'Sessao expirada ou ausente para admin-api.'),
    });
  }

  return data.session.access_token;
}

async function ensureAccessToken(action: AdminApiAction): Promise<string> {
  const currentToken = await getCurrentAccessToken(action);
  if (currentToken) return currentToken;
  return await refreshAccessToken(action);
}

async function invokeAdminApiWithToken<TData>(
  payload: AdminApiRequest,
  accessToken: string,
): Promise<TData> {
  let response: Response;
  try {
    response = await fetch(ADMIN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ADMIN_API_PUBLIC_KEY,
        Authorization: `Bearer ${ADMIN_API_PUBLIC_KEY}`,
      },
      body: JSON.stringify({
        ...payload,
        _admin_access_token: accessToken,
      }),
    });
  } catch (error) {
    throw await parseAdminInvokeFailure(payload.action, error);
  }

  if (!response.ok) {
    throw await parseAdminApiErrorResponse(payload.action, response);
  }

  const data = await response.json();

  if (isRecord(data) && data.ok === false) {
    const responsePayload = data as AdminApiErrorPayload;
    const rawCode = responsePayload.code ?? null;
    const message =
      responsePayload.error ||
      responsePayload.message ||
      (typeof rawCode === 'string' ? rawCode : `Falha ao executar ${payload.action}.`);

    throw createAdminApiError({
      action: payload.action,
      code: normalizeAdminApiErrorCode({
        rawCode,
        status: 200,
        message,
        hasContext: true,
      }),
      rawCode,
      status: 200,
      requestId: responsePayload.request_id ?? null,
      message,
      details: data,
    });
  }

  return data as TData;
}

export async function invokeAdminApi<TData>(payload: AdminApiRequest): Promise<TData> {
  try {
    const accessToken = await ensureAccessToken(payload.action);
    return await invokeAdminApiWithToken<TData>(payload, accessToken);
  } catch (error) {
    const adminError = isAdminApiError(error)
      ? error
      : await parseAdminInvokeFailure(payload.action, error);

    if (!shouldRetryAdminApiError(adminError)) {
      throw adminError;
    }

    const refreshedToken = await refreshAccessToken(payload.action);
    try {
      return await invokeAdminApiWithToken<TData>(payload, refreshedToken);
    } catch (retryError) {
      if (isAdminApiError(retryError)) {
        throw retryError;
      }
      throw await parseAdminInvokeFailure(payload.action, retryError);
    }
  }
}

export function isAdminApiError(error: unknown): error is AdminApiError {
  return (
    error instanceof Error &&
    error.name === 'AdminApiError' &&
    'code' in error &&
    typeof (error as AdminApiError).code === 'string'
  );
}

export const adminQueryKeys = {
  all: ['admin'] as const,
  whoami: () => ['admin', 'whoami'] as const,
  orgs: (params: Record<string, unknown>) => ['admin', 'orgs', params] as const,
  orgDetails: (orgId: string) => ['admin', 'org-details', orgId] as const,
  orgMembers: (orgId: string) => ['admin', 'org-members', orgId] as const,
  systemMetrics: () => ['admin', 'system-metrics'] as const,
  auditLog: (params: Record<string, unknown>) => ['admin', 'audit-log', params] as const,
  featureFlags: (orgId?: string) => ['admin', 'feature-flags', orgId ?? 'global'] as const,
  subscriptionPlans: () => ['admin', 'subscription-plans'] as const,
  financialSummary: () => ['admin', 'financial-summary'] as const,
};

export function useAdminWhoAmI(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminQueryKeys.whoami(),
    queryFn: () => invokeAdminApi<AdminWhoAmIResponse>({ action: 'whoami' }),
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 0,
  });
}

export function useAdminOrgs(params: {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: adminQueryKeys.orgs(params),
    queryFn: () => invokeAdminApi<AdminListOrgsResponse>({ action: 'list_orgs', ...params }),
  });
}

export function useAdminOrgDetails(
  orgId: string | null,
  params?: {
    timeline_page?: number;
    timeline_per_page?: number;
    timeline_event_type?: string;
  },
) {
  const effectiveParams = params || {};

  return useQuery({
    queryKey: [...adminQueryKeys.orgDetails(orgId ?? 'missing'), effectiveParams],
    queryFn: () => invokeAdminApi<AdminOrgDetailsResponse>({
      action: 'get_org_details',
      org_id: orgId,
      ...effectiveParams,
    }),
    enabled: Boolean(orgId),
  });
}

export function useAdminOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: adminQueryKeys.orgMembers(orgId ?? 'missing'),
    queryFn: () => invokeAdminApi<AdminOrgMembersResponse>({ action: 'list_org_members', org_id: orgId }),
    enabled: Boolean(orgId),
  });
}

export function useAdminSystemMetrics() {
  return useQuery({
    queryKey: adminQueryKeys.systemMetrics(),
    queryFn: () => invokeAdminApi<AdminSystemMetricsResponse>({ action: 'get_system_metrics' }),
  });
}

export function useAdminAuditLog(params: {
  page?: number;
  per_page?: number;
  filters?: Record<string, unknown>;
}) {
  return useQuery({
    queryKey: adminQueryKeys.auditLog(params),
    queryFn: () => invokeAdminApi<AdminListAuditLogResponse>({ action: 'list_audit_log', ...params }),
  });
}

export function useAdminFeatureFlags(orgId?: string) {
  return useQuery({
    queryKey: adminQueryKeys.featureFlags(orgId),
    queryFn: () => invokeAdminApi<AdminFeatureFlagsResponse>({ action: 'list_feature_flags', org_id: orgId }),
  });
}

export function useAdminSubscriptionPlans() {
  return useQuery({
    queryKey: adminQueryKeys.subscriptionPlans(),
    queryFn: () => invokeAdminApi<AdminSubscriptionPlansResponse>({ action: 'list_subscription_plans' }),
  });
}

export function useAdminFinancialSummary() {
  return useQuery({
    queryKey: adminQueryKeys.financialSummary(),
    queryFn: () => invokeAdminApi<AdminFinancialSummaryResponse>({ action: 'get_financial_summary' }),
  });
}

export function useAdminMutation<TData = Record<string, unknown>>(
  options?: AdminMutationOptions<TData>,
) {
  const queryClient = useQueryClient();

  return useMutation<TData, AdminApiError, AdminApiRequest>({
    mutationFn: (payload) => invokeAdminApi<TData>(payload),
    onSuccess: async (data, variables) => {
      for (const queryKey of options?.invalidate ?? []) {
        await queryClient.invalidateQueries({ queryKey });
      }
      await options?.onSuccess?.(data, variables);
    },
    onError: async (error, variables) => {
      await options?.onError?.(error, variables);
    },
  });
}
