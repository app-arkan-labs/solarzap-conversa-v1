import { supabase } from '@/lib/supabase';

export type OrgRole = 'owner' | 'admin' | 'user' | 'consultant';

export interface MemberDto {
  user_id: string;
  email: string | null;
  role: OrgRole;
  can_view_team_leads: boolean;
  joined_at: string;
}

type OrgAdminRequest =
  | { action: 'bootstrap_self' }
  | { action: 'list_members' }
  | {
      action: 'invite_member';
      email: string;
      role: OrgRole;
      can_view_team_leads?: boolean;
      mode?: 'create' | 'invite';
    }
  | {
      action: 'update_member';
      user_id: string;
      role: OrgRole;
      can_view_team_leads: boolean;
    }
  | { action: 'remove_member'; user_id: string };

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
      action: 'list_members';
      members: MemberDto[];
    }
  | {
      ok: true;
      action: 'invite_member';
      user_id: string;
      email: string;
      mode: 'create' | 'invite';
      temp_password?: string;
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

async function invokeOrgAdmin<TExpected extends OrgAdminSuccessResponse>(
  body: OrgAdminRequest,
): Promise<TExpected> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : undefined;

  const { data, error } = await supabase.functions.invoke('org-admin', { body, headers });

  if (error) {
    const functionError = error as { message?: string; context?: Response };
    let detailedMessage: string | null = null;

    if (functionError.context) {
      try {
        const payload = (await functionError.context.json()) as OrgAdminErrorResponse;
        if (payload?.error) {
          detailedMessage = payload.error;
        }
      } catch {
        // Fall through to generic message below.
      }
    }

    throw new Error(detailedMessage || functionError.message || 'Falha ao chamar org-admin');
  }

  const payload = data as OrgAdminSuccessResponse | OrgAdminErrorResponse | null;
  if (!payload) {
    throw new Error('Resposta vazia da org-admin');
  }

  if ('ok' in payload && payload.ok === false) {
    throw new Error(payload.error || 'Erro desconhecido na org-admin');
  }

  if (!('ok' in payload) || payload.ok !== true) {
    throw new Error('Formato de resposta inválido da org-admin');
  }

  return payload as TExpected;
}

export async function bootstrapSelf() {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'bootstrap_self' }>>({
    action: 'bootstrap_self',
  });
}

export async function listMembers() {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'list_members' }>>({
    action: 'list_members',
  });
}

export async function inviteMember(input: {
  email: string;
  role: OrgRole;
  can_view_team_leads?: boolean;
  mode?: 'create' | 'invite';
}) {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'invite_member' }>>({
    action: 'invite_member',
    email: input.email,
    role: input.role,
    can_view_team_leads: input.can_view_team_leads ?? false,
    mode: input.mode ?? 'create',
  });
}

export async function updateMember(input: {
  user_id: string;
  role: OrgRole;
  can_view_team_leads: boolean;
}) {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'update_member' }>>({
    action: 'update_member',
    user_id: input.user_id,
    role: input.role,
    can_view_team_leads: input.can_view_team_leads,
  });
}

export async function removeMember(userId: string) {
  return invokeOrgAdmin<Extract<OrgAdminSuccessResponse, { action: 'remove_member' }>>({
    action: 'remove_member',
    user_id: userId,
  });
}
