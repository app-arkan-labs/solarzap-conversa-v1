import { supabase } from '@/lib/supabase';
import { getAuthUserDisplayName } from '@/lib/memberDisplayName';
import { getActiveOrgId } from '@/lib/activeOrgContext';

export type OrgRole = 'owner' | 'admin' | 'user' | 'consultant';

export interface MemberDto {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: OrgRole;
  can_view_team_leads: boolean;
  joined_at: string;
}

export type InviteCredentialMode = 'temp_password' | 'reset_link' | 'invite_link' | 'login_only';

export interface UserOrganizationOption {
  org_id: string;
  role: OrgRole;
  can_view_team_leads: boolean;
  joined_at: string;
  company_name: string | null;
  organization_name: string | null;
  display_name: string;
}

type OrgAdminRequest =
  | { action: 'bootstrap_self' }
  | { action: 'list_user_orgs' }
  | { action: 'list_members'; org_id?: string }
  | { action: 'get_billing_info'; org_id?: string }
  | {
    action: 'billing_admin_action';
    org_id?: string;
    operation: 'migrate_legacy_to_trial' | 'refresh_access_state';
    trial_days?: number;
  }
  | {
    action: 'invite_member';
    org_id?: string;
    email: string;
    role: OrgRole;
    can_view_team_leads?: boolean;
    mode?: 'create' | 'invite';
  }
  | {
    action: 'update_member';
    org_id?: string;
    user_id: string;
    role: OrgRole;
    can_view_team_leads: boolean;
  }
  | { action: 'remove_member'; org_id?: string; user_id: string };

type OrgAdminSuccessResponse =
  | {
    ok: true;
    action: 'bootstrap_self';
    created: boolean;
    org_id: string;
    role: OrgRole;
  }
  | {
    ok: true;
    action: 'list_user_orgs';
    orgs: UserOrganizationOption[];
  }
  | {
    ok: true;
    action: 'list_members';
    members: MemberDto[];
  }
  | {
    ok: true;
    action: 'get_billing_info';
    billing: Record<string, unknown> | null;
    timeline: Array<Record<string, unknown>>;
  }
  | {
    ok: true;
    action: 'billing_admin_action';
    operation: string;
    result?: Record<string, unknown> | null;
    affected?: number;
  }
  | {
    ok: true;
    action: 'invite_member';
    user_id: string;
    email: string;
    org_id: string;
    assigned_role: OrgRole;
    mode: 'create' | 'invite';
    system_email_sent: boolean;
    credential_mode: InviteCredentialMode;
    account_already_existed: boolean;
    temp_password?: string;
    invite_link?: string;
  }
  | {
    ok: true;
    action: 'update_member';
    user_id: string;
    role: OrgRole;
    can_view_team_leads: boolean;
  }
  | { ok: true; action: 'remove_member'; user_id: string };

type OrgAdminErrorResponse = {
  ok: false;
  error: string;
  code?: string;
};

type OrgAdminAction = OrgAdminRequest['action'];
type ListMembersResponse = Extract<OrgAdminSuccessResponse, { action: 'list_members' }>;

type ListMembersOptions = {
  forceRefresh?: boolean;
};

const MEMBERS_CACHE_TTL_MS = 15_000;
const membersCacheByOrg = new Map<string, { fetchedAt: number; data: ListMembersResponse }>();
const membersInFlightByOrg = new Map<string, Promise<ListMembersResponse>>();

const toMembersCacheKey = (orgId?: string) => {
  const resolvedOrgId = (orgId || getActiveOrgId() || '').trim();
  return resolvedOrgId.length > 0 ? resolvedOrgId : '__active__';
};

export const invalidateMembersCache = (orgId?: string) => {
  if (typeof orgId === 'string' && orgId.trim().length > 0) {
    membersCacheByOrg.delete(toMembersCacheKey(orgId));
    membersInFlightByOrg.delete(toMembersCacheKey(orgId));
    return;
  }

  membersCacheByOrg.clear();
  membersInFlightByOrg.clear();
};

export class OrgAdminInvokeError extends Error {
  readonly action: OrgAdminAction;
  readonly status: number | null;
  readonly code?: string;
  readonly requestId: string | null;

  constructor(
    message: string,
    details: {
      action: OrgAdminAction;
      status?: number | null;
      code?: string;
      requestId?: string | null;
    },
  ) {
    super(message);
    this.name = 'OrgAdminInvokeError';
    this.action = details.action;
    this.status = details.status ?? null;
    this.code = details.code;
    this.requestId = details.requestId ?? null;
  }
}

export function isOrgAdminInvokeError(error: unknown): error is OrgAdminInvokeError {
  return error instanceof OrgAdminInvokeError;
}

const withOrgId = <T extends Record<string, unknown>>(payload: T, orgId?: string): T & { org_id?: string } => {
  const resolvedOrgId = orgId || getActiveOrgId();
  if (!resolvedOrgId) {
    return payload;
  }

  return {
    ...payload,
    org_id: resolvedOrgId,
  };
};

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

async function invokeOrgAdmin<TExpected extends OrgAdminSuccessResponse>(
  body: OrgAdminRequest,
): Promise<TExpected> {
  const action = body.action;

  // Guard: supabase.auth.getSession() can throw raw TypeErrors from auth-js internals
  // (e.g. parseResponseAPIVersion calls response.headers.get() on a response without headers
  //  during token refresh failures). We catch those to provide a clean error message.
  let session;
  try {
    const result = await supabase.auth.getSession();
    session = result.data.session;
  } catch (authErr) {
    const msg = authErr instanceof Error ? authErr.message : 'Erro ao obter sessão';
    throw new OrgAdminInvokeError(`[org-admin:${action}] auth_error: ${msg}`, {
      action,
      code: 'auth_error',
    });
  }

  const headers = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined;

  const { data, error } = await supabase.functions.invoke('org-admin', { body, headers });

  if (error) {
    const functionError = error as { message?: string; context?: Response };
    let detailedMessage: string | null = null;
    let status: number | null = null;
    let code: string | undefined;
    let requestId: string | null = null;

    if (functionError.context) {
      try {
        status = typeof functionError.context.status === 'number' ? functionError.context.status : null;
        requestId = getRequestId(functionError.context);
        if (typeof functionError.context.text === 'function') {
          const rawBody = await functionError.context.text();
          const payload = JSON.parse(rawBody) as OrgAdminErrorResponse;
          if (payload?.error) detailedMessage = payload.error;
          if (payload?.code) code = payload.code;
        }
      } catch {
        // context may be a TypeError (FunctionsFetchError) instead of Response
        status = typeof functionError.context.status === 'number' ? functionError.context.status : null;
        requestId = getRequestId(functionError.context);
      }
    }

    const rawErrorMessage = functionError.message || '';
    const isTransportInvokeError = !status
      && !detailedMessage
      && /Failed to send a request to the Edge Function|Failed to fetch|NetworkError|Load failed/i.test(rawErrorMessage);

    if (isTransportInvokeError) {
      detailedMessage = 'Falha de conexao com org-admin (possivel CORS/origem nao permitida).';
      code = code || 'invoke_transport_error';
    }

    const devDiag = import.meta.env.DEV && isTransportInvokeError
      ? ` origin=${typeof window !== 'undefined' ? window.location.origin : 'n/a'} action=${action}`
      : '';

    const statusPart = status ? `HTTP ${status}` : 'invoke_error';
    const codePart = code ? ` code=${code}` : '';
    const requestIdPart = requestId ? ` request_id=${requestId}` : '';
    throw new OrgAdminInvokeError(
      `[org-admin:${action}] ${statusPart}${codePart}${requestIdPart}: ${detailedMessage || rawErrorMessage || 'Falha ao chamar org-admin'}${devDiag ? ` [diag:${devDiag}]` : ''}`,
      {
        action,
        status,
        code,
        requestId,
      },
    );
  }

  const payload = data as OrgAdminSuccessResponse | OrgAdminErrorResponse | null;
  if (!payload) {
    throw new OrgAdminInvokeError(`[org-admin:${action}] resposta vazia`, {
      action,
      code: 'empty_response',
    });
  }

  if ('ok' in payload && payload.ok === false) {
    const codePart = payload.code ? ` code=${payload.code}` : '';
    throw new OrgAdminInvokeError(
      `[org-admin:${action}]${codePart}: ${payload.error || 'Erro desconhecido na org-admin'}`,
      {
        action,
        code: payload.code,
      },
    );
  }

  if (!('ok' in payload) || payload.ok !== true) {
    throw new OrgAdminInvokeError(`[org-admin:${action}] formato de resposta invalido`, {
      action,
      code: 'invalid_response_format',
    });
  }

  return payload as TExpected;
}

export async function bootstrapSelf() {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'bootstrap_self' }>>({
    action: 'bootstrap_self',
  });
}

export async function listUserOrgs() {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'list_user_orgs' }>>({
    action: 'list_user_orgs',
  });
}

const fetchMembers = async (orgId?: string): Promise<ListMembersResponse> => {
  const response = await invokeOrgAdmin<ListMembersResponse>({
    ...withOrgId({ action: 'list_members' }, orgId),
  });

  // Guard: getUser can throw raw TypeError from auth-js internals (same parseResponseAPIVersion issue)
  let currentUser;
  try {
    const { data } = await supabase.auth.getUser();
    currentUser = data.user;
  } catch {
    return response;
  }

  if (!currentUser) {
    return response;
  }

  const currentDisplayName = getAuthUserDisplayName(currentUser);
  if (!currentDisplayName) {
    return response;
  }

  return {
    ...response,
    members: response.members.map((member) =>
      member.user_id === currentUser.id
        ? {
          ...member,
          display_name: currentDisplayName,
        }
        : member),
  };
};

export async function listMembers(orgId?: string, opts?: ListMembersOptions) {
  const cacheKey = toMembersCacheKey(orgId);
  const now = Date.now();

  if (!opts?.forceRefresh) {
    const cached = membersCacheByOrg.get(cacheKey);
    if (cached && now - cached.fetchedAt < MEMBERS_CACHE_TTL_MS) {
      return cached.data;
    }

    const inFlight = membersInFlightByOrg.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const pending = fetchMembers(orgId)
    .then((result) => {
      membersCacheByOrg.set(cacheKey, {
        fetchedAt: Date.now(),
        data: result,
      });
      return result;
    })
    .finally(() => {
      membersInFlightByOrg.delete(cacheKey);
    });

  membersInFlightByOrg.set(cacheKey, pending);
  return pending;
}

export async function getBillingInfo(orgId?: string) {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'get_billing_info' }>>({
    ...withOrgId({ action: 'get_billing_info' }, orgId),
  });
}

export async function runBillingAdminAction(
  operation: 'migrate_legacy_to_trial' | 'refresh_access_state',
  options?: { orgId?: string; trialDays?: number },
) {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'billing_admin_action' }>>({
    ...withOrgId(
      {
        action: 'billing_admin_action',
        operation,
        ...(typeof options?.trialDays === 'number' ? { trial_days: options.trialDays } : {}),
      },
      options?.orgId,
    ),
  });
}

export async function inviteMember(input: {
  org_id?: string;
  email: string;
  role: OrgRole;
  can_view_team_leads?: boolean;
  mode?: 'create' | 'invite';
}) {
  const response = await invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'invite_member' }>>({
    ...withOrgId({ action: 'invite_member' }, input.org_id),
    email: input.email,
    role: input.role,
    can_view_team_leads: input.can_view_team_leads ?? false,
    mode: input.mode ?? 'invite',
  });

  invalidateMembersCache(input.org_id);
  return response;
}

export async function updateMember(input: {
  org_id?: string;
  user_id: string;
  role: OrgRole;
  can_view_team_leads: boolean;
}) {
  const response = await invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'update_member' }>>({
    ...withOrgId({ action: 'update_member' }, input.org_id),
    user_id: input.user_id,
    role: input.role,
    can_view_team_leads: input.can_view_team_leads,
  });

  invalidateMembersCache(input.org_id);
  return response;
}

export async function removeMember(userId: string, orgId?: string) {
  const response = await invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'remove_member' }>>({
    ...withOrgId({ action: 'remove_member' }, orgId),
    user_id: userId,
  });

  invalidateMembersCache(orgId);
  return response;
}
