import { useMutation, useQuery, useQueryClient, type QueryKey, type UseMutationOptions } from '@tanstack/react-query';
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
  | 'set_org_feature';

export type AdminApiRequest = {
  action: AdminApiAction;
  [key: string]: unknown;
};

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
  suspension_reason: string | null;
  member_count: number;
  lead_count: number;
  proposal_count: number;
  instance_count: number;
};

export type AdminListOrgsResponse = {
  ok: true;
  orgs: AdminOrgSummary[];
  total: number;
  page: number;
  per_page: number;
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

export type AdminAuditEntry = {
  id: number;
  ts: string;
  actor_user_id: string;
  actor_system_role: string;
  action: string;
  target_type: string;
  target_id: string | null;
  org_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  reason: string | null;
};

export type AdminListAuditLogResponse = {
  ok: true;
  entries: AdminAuditEntry[];
  total: number;
  page: number;
  per_page: number;
};

export type AdminFeatureFlag = {
  flag_key: string;
  description: string | null;
  default_enabled: boolean;
  created_at: string;
  updated_at: string;
  org_override_enabled: boolean | null;
  effective_enabled: boolean;
};

export type AdminListFeatureFlagsResponse = {
  ok: true;
  flags: AdminFeatureFlag[];
};

type AdminApiErrorPayload = {
  ok: false;
  code?: string;
  error?: string;
};

export class AdminApiError extends Error {
  readonly action: AdminApiAction;
  readonly status: number | null;
  readonly code?: string;
  readonly requestId: string | null;

  constructor(
    message: string,
    details: { action: AdminApiAction; status?: number | null; code?: string; requestId?: string | null },
  ) {
    super(message);
    this.name = 'AdminApiError';
    this.action = details.action;
    this.status = details.status ?? null;
    this.code = details.code;
    this.requestId = details.requestId ?? null;
  }
}

export const isAdminApiError = (error: unknown): error is AdminApiError => error instanceof AdminApiError;

const getRequestId = (response: Response | unknown): string | null => {
  try {
    const headers = (response as Response)?.headers;
    if (!headers || typeof headers.get !== 'function') return null;
    return (
      headers.get('x-request-id') ||
      headers.get('x-supabase-request-id') ||
      headers.get('cf-ray') ||
      null
    );
  } catch {
    return null;
  }
};

export async function invokeAdminApi<T>(body: AdminApiRequest): Promise<T> {
  const action = body.action;

  let session;
  try {
    const result = await supabase.auth.getSession();
    session = result.data.session;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'auth_error';
    throw new AdminApiError(`[admin-api:${action}] auth_error: ${message}`, {
      action,
      code: 'auth_error',
    });
  }

  const headers = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined;

  const { data, error } = await supabase.functions.invoke('admin-api', { body, headers });

  if (error) {
    const functionError = error as { message?: string; context?: Response };
    let parsed: AdminApiErrorPayload | null = null;
    let status: number | null = null;
    let requestId: string | null = null;

    if (functionError.context) {
      status = typeof functionError.context.status === 'number' ? functionError.context.status : null;
      requestId = getRequestId(functionError.context);
      try {
        const raw = await functionError.context.text();
        parsed = raw ? (JSON.parse(raw) as AdminApiErrorPayload) : null;
      } catch {
        parsed = null;
      }
    }

    const code = parsed?.code;
    const message = parsed?.error || functionError.message || 'Falha ao chamar admin-api';
    throw new AdminApiError(`[admin-api:${action}] ${message}`, {
      action,
      status,
      code,
      requestId,
    });
  }

  const payload = data as T | AdminApiErrorPayload | null;
  if (!payload) {
    throw new AdminApiError(`[admin-api:${action}] resposta vazia`, {
      action,
      code: 'empty_response',
    });
  }

  if (typeof payload === 'object' && payload !== null && 'ok' in payload && payload.ok === false) {
    const apiPayload = payload as AdminApiErrorPayload;
    throw new AdminApiError(`[admin-api:${action}] ${apiPayload.error || 'Erro de API'}`, {
      action,
      code: apiPayload.code,
    });
  }

  return payload as T;
}

export const adminQueryKeys = {
  root: ['admin'] as const,
  whoami: () => [...adminQueryKeys.root, 'whoami'] as const,
  orgs: (params: Record<string, unknown>) => [...adminQueryKeys.root, 'orgs', params] as const,
  orgDetails: (orgId: string | null | undefined) => [...adminQueryKeys.root, 'org', orgId ?? null] as const,
  orgMembers: (orgId: string | null | undefined) => [...adminQueryKeys.root, 'org-members', orgId ?? null] as const,
  metrics: () => [...adminQueryKeys.root, 'metrics'] as const,
  audit: (params: Record<string, unknown>) => [...adminQueryKeys.root, 'audit', params] as const,
  featureFlags: (orgId?: string) => [...adminQueryKeys.root, 'feature-flags', orgId ?? null] as const,
};

export function useAdminWhoAmI(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminQueryKeys.whoami(),
    queryFn: () => invokeAdminApi<AdminWhoAmIResponse>({ action: 'whoami' }),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useAdminOrgs(params: { page: number; per_page: number; search?: string; status?: string }) {
  return useQuery({
    queryKey: adminQueryKeys.orgs(params),
    queryFn: () =>
      invokeAdminApi<AdminListOrgsResponse>({
        action: 'list_orgs',
        page: params.page,
        per_page: params.per_page,
        search: params.search || undefined,
        status: params.status || undefined,
      }),
    staleTime: 30_000,
  });
}

export function useAdminOrgDetails(orgId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.orgDetails(orgId),
    queryFn: () =>
      invokeAdminApi<AdminOrgDetailsResponse>({
        action: 'get_org_details',
        org_id: orgId,
      }),
    enabled: Boolean(orgId) && enabled,
    staleTime: 30_000,
  });
}

export function useAdminOrgMembers(orgId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: adminQueryKeys.orgMembers(orgId),
    queryFn: () =>
      invokeAdminApi<{ ok: true; members: AdminOrgMember[] }>({
        action: 'list_org_members',
        org_id: orgId,
      }),
    enabled: Boolean(orgId) && enabled,
    staleTime: 30_000,
  });
}

export function useAdminSystemMetrics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: adminQueryKeys.metrics(),
    queryFn: () => invokeAdminApi<AdminSystemMetricsResponse>({ action: 'get_system_metrics' }),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useAdminAuditLog(params: {
  page: number;
  per_page: number;
  filters?: Record<string, unknown>;
}) {
  return useQuery({
    queryKey: adminQueryKeys.audit(params),
    queryFn: () =>
      invokeAdminApi<AdminListAuditLogResponse>({
        action: 'list_audit_log',
        page: params.page,
        per_page: params.per_page,
        filters: params.filters ?? {},
      }),
    staleTime: 15_000,
  });
}

export function useAdminFeatureFlags(orgId?: string) {
  return useQuery({
    queryKey: adminQueryKeys.featureFlags(orgId),
    queryFn: () =>
      invokeAdminApi<AdminListFeatureFlagsResponse>({
        action: 'list_feature_flags',
        ...(orgId ? { org_id: orgId } : {}),
      }),
    staleTime: 30_000,
  });
}

export function useAdminMutation<
  TData,
  TVariables extends AdminApiRequest = AdminApiRequest,
>(
  options?: Omit<UseMutationOptions<TData, AdminApiError, TVariables>, 'mutationFn'> & {
    invalidate?: QueryKey[];
  },
) {
  const queryClient = useQueryClient();

  return useMutation<TData, AdminApiError, TVariables>({
    mutationFn: (variables) => invokeAdminApi<TData>(variables),
    ...options,
    onSuccess: async (data, variables, context) => {
      if (options?.invalidate && options.invalidate.length > 0) {
        await Promise.all(
          options.invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
      }
      await options?.onSuccess?.(data, variables, context);
    },
  });
}
