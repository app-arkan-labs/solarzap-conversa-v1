import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  InternalCrmAppointment,
  InternalCrmAiSettings,
  InternalCrmApiAction,
  InternalCrmApiErrorCode,
  InternalCrmApiRequest,
  InternalCrmCampaign,
  InternalCrmClientDetail,
  InternalCrmClientSummary,
  InternalCrmConversationDetail,
  InternalCrmConversationSummary,
  InternalCrmCustomerSnapshot,
  InternalCrmDashboardKpis,
  InternalCrmDealSummary,
  InternalCrmFinanceSummary,
  InternalCrmProduct,
  InternalCrmStage,
  InternalCrmTask,
  InternalCrmWhatsappInstance,
  InternalCrmWhoAmIResponse,
} from '@/modules/internal-crm/types';

export type InternalCrmApiError = Error & {
  name: 'InternalCrmApiError';
  action: InternalCrmApiAction;
  code: InternalCrmApiErrorCode;
  rawCode: string | number | null;
  status?: number;
  requestId?: string | null;
  details?: unknown;
};

type InternalCrmApiErrorPayload = {
  ok?: boolean;
  code?: string | number;
  error?: string;
  message?: string;
  request_id?: string;
};

type InternalCrmMutationOptions<TData> = {
  invalidate?: QueryKey[];
  onSuccess?: (data: TData, variables: InternalCrmApiRequest) => void | Promise<void>;
  onError?: (error: InternalCrmApiError, variables: InternalCrmApiRequest) => void | Promise<void>;
};

const KNOWN_INTERNAL_CRM_ERROR_CODES: InternalCrmApiErrorCode[] = [
  'not_system_admin',
  'not_crm_member',
  'insufficient_role',
  'mfa_required',
  'missing_auth',
  'unauthorized',
  'forbidden_origin',
  'network_error',
  'gateway_auth_error',
  'admin_lookup_failed',
  'not_found',
  'invalid_payload',
  'action_not_allowed',
  'unknown_internal_crm_error',
];

const KNOWN_INTERNAL_CRM_ERROR_CODE_SET = new Set<string>(KNOWN_INTERNAL_CRM_ERROR_CODES);
const INTERNAL_CRM_FALLBACK_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const INTERNAL_CRM_FALLBACK_PUBLIC_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMzkyMTEsImV4cCI6MjA4MzYxNTIxMX0.KMk4XqFCm4FkvOZg7LNWaI_4lknMwcdCkYSGjBjDdOg';
const INTERNAL_CRM_BASE_URL =
  typeof import.meta.env.VITE_SUPABASE_URL === 'string' && import.meta.env.VITE_SUPABASE_URL.trim().length > 0
    ? import.meta.env.VITE_SUPABASE_URL.trim()
    : INTERNAL_CRM_FALLBACK_URL;
const INTERNAL_CRM_API_PUBLIC_KEY =
  typeof import.meta.env.VITE_SUPABASE_ANON_KEY === 'string' && import.meta.env.VITE_SUPABASE_ANON_KEY.trim().length > 0
    ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
    : INTERNAL_CRM_FALLBACK_PUBLIC_KEY;
const INTERNAL_CRM_API_URL = `${INTERNAL_CRM_BASE_URL}/functions/v1/internal-crm-api`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function extractRequestIdFromHeaders(headers: Headers | null | undefined): string | null {
  if (!headers) return null;
  return headers.get('x-internal-crm-request-id') || headers.get('x-request-id') || headers.get('cf-ray') || null;
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

function normalizeInternalCrmApiErrorCode(input: {
  rawCode: string | number | null;
  status?: number;
  message?: string | null;
  hasContext?: boolean;
}): InternalCrmApiErrorCode {
  const rawCode =
    typeof input.rawCode === 'string' || typeof input.rawCode === 'number' ? input.rawCode : null;

  if (typeof rawCode === 'string' && KNOWN_INTERNAL_CRM_ERROR_CODE_SET.has(rawCode)) {
    return rawCode as InternalCrmApiErrorCode;
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

  if (normalizedRawCode.includes('not_found')) return 'not_found';
  if (normalizedRawCode.includes('payload')) return 'invalid_payload';
  if (normalizedRawCode.includes('action')) return 'action_not_allowed';

  return 'unknown_internal_crm_error';
}

function createInternalCrmApiError(input: {
  action: InternalCrmApiAction;
  code: InternalCrmApiErrorCode;
  rawCode: string | number | null;
  message: string;
  status?: number;
  requestId?: string | null;
  details?: unknown;
}): InternalCrmApiError {
  const error = new Error(input.message) as InternalCrmApiError;
  error.name = 'InternalCrmApiError';
  error.action = input.action;
  error.code = input.code;
  error.rawCode = input.rawCode;
  error.status = input.status;
  error.requestId = input.requestId ?? null;
  error.details = input.details;
  return error;
}

async function parseInternalCrmInvokeFailure(
  action: InternalCrmApiAction,
  error: unknown,
): Promise<InternalCrmApiError> {
  const fallbackMessage = extractErrorMessage(error) || 'Falha ao acessar internal-crm-api.';
  const fallbackStatus = extractErrorStatus(error);
  const fallbackRawCode = extractErrorCode(error);
  return createInternalCrmApiError({
    action,
    code: 'network_error',
    rawCode: fallbackRawCode,
    status: fallbackStatus,
    message: fallbackMessage,
    details: error,
  });
}

async function parseInternalCrmApiErrorResponse(
  action: InternalCrmApiAction,
  response: Response,
): Promise<InternalCrmApiError> {
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
    `Falha ao executar ${action} no internal-crm-api (HTTP ${response.status}).`;

  return createInternalCrmApiError({
    action,
    code: normalizeInternalCrmApiErrorCode({
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

async function getCurrentAccessToken(action: InternalCrmApiAction): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw createInternalCrmApiError({
      action,
      code: 'missing_auth',
      rawCode: error.code ?? null,
      status: error.status,
      message: toErrorMessage(error.message, 'Nao foi possivel ler a sessao atual.'),
    });
  }

  return data.session?.access_token ?? null;
}

async function refreshAccessToken(action: InternalCrmApiAction): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.access_token) {
    throw createInternalCrmApiError({
      action,
      code: 'missing_auth',
      rawCode: error?.code ?? null,
      status: error?.status,
      message: toErrorMessage(error?.message, 'Sessao expirada ou ausente para internal-crm-api.'),
    });
  }

  return data.session.access_token;
}

async function ensureAccessToken(action: InternalCrmApiAction): Promise<string> {
  const currentToken = await getCurrentAccessToken(action);
  if (currentToken) return currentToken;
  return await refreshAccessToken(action);
}

function shouldRetryInternalCrmApiError(error: Pick<InternalCrmApiError, 'code' | 'status'>): boolean {
  return error.status === 401 || error.code === 'gateway_auth_error' || error.code === 'missing_auth';
}

async function invokeInternalCrmApiWithToken<TData>(
  payload: InternalCrmApiRequest,
  accessToken: string,
): Promise<TData> {
  let response: Response;

  try {
    response = await fetch(INTERNAL_CRM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: INTERNAL_CRM_API_PUBLIC_KEY,
        Authorization: `Bearer ${INTERNAL_CRM_API_PUBLIC_KEY}`,
      },
      body: JSON.stringify({
        ...payload,
        _admin_access_token: accessToken,
      }),
    });
  } catch (error) {
    throw await parseInternalCrmInvokeFailure(payload.action, error);
  }

  if (!response.ok) {
    throw await parseInternalCrmApiErrorResponse(payload.action, response);
  }

  const data = await response.json();

  if (isRecord(data) && data.ok === false) {
    const responsePayload = data as InternalCrmApiErrorPayload;
    const rawCode = responsePayload.code ?? null;
    const message =
      responsePayload.error ||
      responsePayload.message ||
      (typeof rawCode === 'string' ? rawCode : `Falha ao executar ${payload.action}.`);

    throw createInternalCrmApiError({
      action: payload.action,
      code: normalizeInternalCrmApiErrorCode({
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

export async function invokeInternalCrmApi<TData>(payload: InternalCrmApiRequest): Promise<TData> {
  try {
    const accessToken = await ensureAccessToken(payload.action);
    return await invokeInternalCrmApiWithToken<TData>(payload, accessToken);
  } catch (error) {
    const internalCrmError = isInternalCrmApiError(error)
      ? error
      : await parseInternalCrmInvokeFailure(payload.action, error);

    if (!shouldRetryInternalCrmApiError(internalCrmError)) {
      throw internalCrmError;
    }

    const refreshedToken = await refreshAccessToken(payload.action);
    try {
      return await invokeInternalCrmApiWithToken<TData>(payload, refreshedToken);
    } catch (retryError) {
      if (isInternalCrmApiError(retryError)) {
        throw retryError;
      }
      throw await parseInternalCrmInvokeFailure(payload.action, retryError);
    }
  }
}

export function isInternalCrmApiError(error: unknown): error is InternalCrmApiError {
  return (
    error instanceof Error &&
    error.name === 'InternalCrmApiError' &&
    'code' in error &&
    typeof (error as InternalCrmApiError).code === 'string'
  );
}

export const internalCrmQueryKeys = {
  all: ['internal-crm'] as const,
  whoami: () => ['internal-crm', 'whoami'] as const,
  products: () => ['internal-crm', 'products'] as const,
  pipelineStages: () => ['internal-crm', 'pipeline-stages'] as const,
  dashboard: (params: Record<string, unknown>) => ['internal-crm', 'dashboard', params] as const,
  clients: (params: Record<string, unknown>) => ['internal-crm', 'clients', params] as const,
  clientDetail: (clientId: string) => ['internal-crm', 'client-detail', clientId] as const,
  deals: (params: Record<string, unknown>) => ['internal-crm', 'deals', params] as const,
  tasks: (params: Record<string, unknown>) => ['internal-crm', 'tasks', params] as const,
  instances: () => ['internal-crm', 'instances'] as const,
  conversations: (params: Record<string, unknown>) => ['internal-crm', 'conversations', params] as const,
  conversationDetail: (conversationId: string) => ['internal-crm', 'conversation-detail', conversationId] as const,
  campaigns: () => ['internal-crm', 'campaigns'] as const,
  ai: () => ['internal-crm', 'ai'] as const,
  appointments: (params: Record<string, unknown>) => ['internal-crm', 'appointments', params] as const,
  finance: () => ['internal-crm', 'finance'] as const,
  customerSnapshot: () => ['internal-crm', 'customer-snapshot'] as const,
};

export function useInternalCrmWhoAmI(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: internalCrmQueryKeys.whoami(),
    queryFn: () => invokeInternalCrmApi<InternalCrmWhoAmIResponse>({ action: 'crm_whoami' }),
    enabled: options?.enabled ?? true,
    retry: false,
    staleTime: 0,
  });
}

export function useInternalCrmProducts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: internalCrmQueryKeys.products(),
    queryFn: () => invokeInternalCrmApi<{ ok: true; products: InternalCrmProduct[] }>({ action: 'list_products' }),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useInternalCrmPipelineStages(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: internalCrmQueryKeys.pipelineStages(),
    queryFn: () => invokeInternalCrmApi<{ ok: true; stages: InternalCrmStage[] }>({ action: 'list_pipeline_stages' }),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useInternalCrmDashboard(
  params: { period_days?: number; from_date?: string; to_date?: string } = {},
) {
  return useQuery({
    queryKey: internalCrmQueryKeys.dashboard(params),
    queryFn: () => invokeInternalCrmApi<{ ok: true; kpis: InternalCrmDashboardKpis }>({ action: 'list_dashboard_kpis', ...params }),
  });
}

export function useInternalCrmClients(params: {
  search?: string;
  stage_code?: string;
  lifecycle_status?: string;
} = {}) {
  return useQuery({
    queryKey: internalCrmQueryKeys.clients(params),
    queryFn: () => invokeInternalCrmApi<{ ok: true; clients: InternalCrmClientSummary[] }>({ action: 'list_clients', ...params }),
  });
}

export function useInternalCrmClientDetail(clientId: string | null) {
  return useQuery({
    queryKey: internalCrmQueryKeys.clientDetail(clientId ?? 'missing'),
    queryFn: () => invokeInternalCrmApi<InternalCrmClientDetail>({ action: 'get_client_detail', client_id: clientId }),
    enabled: Boolean(clientId),
  });
}

export function useInternalCrmDeals(params: {
  search?: string;
  stage_code?: string;
  status?: string;
} = {}) {
  return useQuery({
    queryKey: internalCrmQueryKeys.deals(params),
    queryFn: () => invokeInternalCrmApi<{ ok: true; deals: InternalCrmDealSummary[] }>({ action: 'list_deals', ...params }),
  });
}

export function useInternalCrmTasks(params: {
  status?: string;
  client_id?: string;
  due_scope?: string;
} = {}) {
  return useQuery({
    queryKey: internalCrmQueryKeys.tasks(params),
    queryFn: () => invokeInternalCrmApi<{ ok: true; tasks: InternalCrmTask[] }>({ action: 'list_tasks', ...params }),
  });
}

export function useInternalCrmInstances(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: internalCrmQueryKeys.instances(),
    queryFn: () => invokeInternalCrmApi<{ ok: true; instances: InternalCrmWhatsappInstance[] }>({ action: 'list_instances' }),
    enabled: options?.enabled ?? true,
  });
}

export function useInternalCrmConversations(params: {
  status?: string;
  assigned_to_user_id?: string;
} = {}) {
  return useQuery({
    queryKey: internalCrmQueryKeys.conversations(params),
    queryFn: () =>
      invokeInternalCrmApi<{ ok: true; conversations: InternalCrmConversationSummary[] }>({
        action: 'list_conversations',
        ...params,
      }),
  });
}

export function useInternalCrmConversationDetail(conversationId: string | null) {
  return useQuery({
    queryKey: internalCrmQueryKeys.conversationDetail(conversationId ?? 'missing'),
    queryFn: () =>
      invokeInternalCrmApi<InternalCrmConversationDetail>({
        action: 'get_conversation_detail',
        conversation_id: conversationId,
      }),
    enabled: Boolean(conversationId),
  });
}

export function useInternalCrmCampaigns(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: internalCrmQueryKeys.campaigns(),
    queryFn: () => invokeInternalCrmApi<{ ok: true; campaigns: InternalCrmCampaign[] }>({ action: 'list_campaigns' }),
    enabled: options?.enabled ?? true,
  });
}

export function useInternalCrmAi(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: internalCrmQueryKeys.ai(),
    queryFn: () => invokeInternalCrmApi<{ ok: true; settings: InternalCrmAiSettings }>({ action: 'list_ai_settings' }),
    enabled: options?.enabled ?? true,
  });
}

export function useInternalCrmAppointments(params: {
  date_from?: string;
  date_to?: string;
  status?: string;
  owner_user_id?: string;
  client_id?: string;
} = {}) {
  return useQuery({
    queryKey: internalCrmQueryKeys.appointments(params),
    queryFn: () =>
      invokeInternalCrmApi<{ ok: true; appointments: InternalCrmAppointment[] }>({
        action: 'list_appointments',
        ...params,
      }),
  });
}

export function useInternalCrmFinance(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: internalCrmQueryKeys.finance(),
    queryFn: () => invokeInternalCrmApi<{ ok: true; summary: InternalCrmFinanceSummary }>({ action: 'list_finance_summary' }),
    enabled: options?.enabled ?? true,
  });
}

export function useInternalCrmCustomerSnapshot(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: internalCrmQueryKeys.customerSnapshot(),
    queryFn: () =>
      invokeInternalCrmApi<{ ok: true; snapshots: InternalCrmCustomerSnapshot[] }>({
        action: 'list_customer_snapshot',
      }),
    enabled: options?.enabled ?? true,
  });
}

export function useInternalCrmMutation<TData = Record<string, unknown>>(
  options?: InternalCrmMutationOptions<TData>,
) {
  const queryClient = useQueryClient();

  return useMutation<TData, InternalCrmApiError, InternalCrmApiRequest>({
    mutationFn: (payload) => invokeInternalCrmApi<TData>(payload),
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
