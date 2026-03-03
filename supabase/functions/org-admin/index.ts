import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { systemAccountCreatedEmail, systemInviteEmail } from '../_shared/emailTemplates.ts';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
  throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type OrgRole = 'owner' | 'admin' | 'user' | 'consultant';

const VALID_ROLES = new Set<OrgRole>(['owner', 'admin', 'user', 'consultant']);

type CallerMembership = {
  org_id: string;
  role: OrgRole;
  can_view_team_leads: boolean;
  created_at: string | null;
};

type UserOrganizationRow = {
  org_id: string;
  role: OrgRole;
  can_view_team_leads: boolean;
  created_at: string | null;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidRole(role: string): role is OrgRole {
  return VALID_ROLES.has(role as OrgRole);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function metadataDisplayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const data = metadata as Record<string, unknown>;
  return (
    nonEmptyString(data.display_name) ??
    nonEmptyString(data.name) ??
    nonEmptyString(data.full_name)
  );
}

function resolveUserDisplayName(user: { user_metadata?: unknown; app_metadata?: unknown } | null | undefined): string | null {
  if (!user) {
    return null;
  }

  return metadataDisplayName(user.user_metadata) ?? metadataDisplayName(user.app_metadata);
}

function generateTempPassword() {
  const randomPart = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `Tmp!${randomPart}Aa1`;
}

function resolveAppUrl(): string {
  const rawUrl =
    Deno.env.get('APP_URL') ||
    Deno.env.get('PUBLIC_APP_URL') ||
    Deno.env.get('SITE_URL') ||
    'https://app.solarzap.com.br';

  return rawUrl.replace(/\/+$/, '');
}

async function sendEmailViaResend(
  recipient: string,
  content: { subject: string; html: string; text: string },
  senderName?: string | null,
  replyTo?: string | null,
) {
  const resendKey = Deno.env.get('RESEND_API_KEY') || '';
  if (!resendKey) {
    throw new Error('missing_resend_api_key');
  }

  const defaultFrom = Deno.env.get('RESEND_FROM_EMAIL') || '';
  if (!defaultFrom) {
    throw new Error('missing_resend_from_email');
  }

  let fromEmail = defaultFrom;
  if (senderName) {
    const emailMatch = defaultFrom.match(/<([^>]+)>/) || [null, defaultFrom];
    const rawEmail = (emailMatch[1] || defaultFrom).trim();
    fromEmail = `${senderName} <${rawEmail}>`;
  }

  const body: Record<string, unknown> = {
    from: fromEmail,
    to: [recipient],
    subject: content.subject,
    html: content.html,
    text: content.text,
  };

  if (replyTo) {
    body.reply_to = replyTo;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = raw;
  }

  if (!response.ok) {
    throw new Error(`resend_http_${response.status}:${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
  }

  return parsed;
}

async function findUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string,
) {
  const normalizedEmail = normalizeEmail(email);
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = data.users ?? [];
    const found = users.find((u) => (u.email || '').toLowerCase() === normalizedEmail) || null;
    if (found) {
      return found;
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
}

async function resolvePrimaryMembership(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<CallerMembership | null> {
  const { data, error } = await adminClient
    .from('organization_members')
    .select('org_id, role, can_view_team_leads, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('org_id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.org_id || typeof data.role !== 'string' || !isValidRole(data.role)) {
    return null;
  }

  return {
    org_id: data.org_id,
    role: data.role,
    can_view_team_leads: data.can_view_team_leads === true,
    created_at: data.created_at ?? null,
  };
}

async function resolveMembershipByOrg(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  orgId: string,
): Promise<CallerMembership | null> {
  const { data, error } = await adminClient
    .from('organization_members')
    .select('org_id, role, can_view_team_leads, created_at')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.org_id || typeof data.role !== 'string' || !isValidRole(data.role)) {
    return null;
  }

  return {
    org_id: data.org_id,
    role: data.role,
    can_view_team_leads: data.can_view_team_leads === true,
    created_at: data.created_at ?? null,
  };
}

async function listUserOrganizations(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: memberships, error: membershipsError } = await adminClient
    .from('organization_members')
    .select('org_id, role, can_view_team_leads, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('org_id', { ascending: true });

  if (membershipsError) {
    throw membershipsError;
  }

  const rows = (memberships ?? []).filter(
    (row): row is UserOrganizationRow =>
      typeof row.org_id === 'string' &&
      typeof row.role === 'string' &&
      isValidRole(row.role),
  );

  if (rows.length === 0) {
    return {
      ok: true,
      action: 'list_user_orgs',
      orgs: [],
    };
  }

  const orgIds = rows.map((row) => row.org_id);

  const [{ data: organizations, error: organizationsError }, { data: companyProfiles, error: companyProfilesError }] =
    await Promise.all([
      adminClient.from('organizations').select('id, name').in('id', orgIds),
      adminClient.from('company_profile').select('org_id, company_name').in('org_id', orgIds),
    ]);

  if (organizationsError) {
    throw organizationsError;
  }

  if (companyProfilesError) {
    throw companyProfilesError;
  }

  const organizationNameById: Record<string, string | null> = {};
  for (const organization of organizations ?? []) {
    if (typeof organization.id !== 'string') continue;
    organizationNameById[organization.id] = nonEmptyString((organization as { name?: unknown }).name);
  }

  const companyNameByOrgId: Record<string, string | null> = {};
  for (const profile of companyProfiles ?? []) {
    if (typeof profile.org_id !== 'string') continue;
    companyNameByOrgId[profile.org_id] = nonEmptyString((profile as { company_name?: unknown }).company_name);
  }

  const orgs = rows
    .map((row) => {
      const companyName = companyNameByOrgId[row.org_id] ?? null;
      const organizationName = organizationNameById[row.org_id] ?? null;
      const displayName = companyName || organizationName || `Organizacao ${row.org_id.slice(0, 8)}`;

      return {
        org_id: row.org_id,
        role: row.role,
        can_view_team_leads: row.can_view_team_leads === true,
        joined_at: row.created_at ?? new Date(0).toISOString(),
        company_name: companyName,
        organization_name: organizationName,
        display_name: displayName,
      };
    })
    .sort((a, b) => {
      const byName = a.display_name.localeCompare(b.display_name, 'pt-BR');
      if (byName !== 0) return byName;
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    });

  return {
    ok: true,
    action: 'list_user_orgs',
    orgs,
  };
}

async function countOwners(
  adminClient: ReturnType<typeof createClient>,
  orgId: string,
) {
  const { data, error } = await adminClient
    .from('organization_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'owner');

  if (error) {
    throw error;
  }

  return data?.length ?? 0;
}

async function bootstrapSelf(
  adminClient: ReturnType<typeof createClient>,
  user: { id: string; email?: string | null },
) {
  const existingMembership = await resolvePrimaryMembership(adminClient, user.id);
  if (existingMembership) {
    return {
      ok: true,
      action: 'bootstrap_self',
      created: false,
      org_id: existingMembership.org_id,
      role: existingMembership.role,
    };
  }

  const { data: existingOrg, error: existingOrgError } = await adminClient
    .from('organizations')
    .select('id, created_at')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingOrgError) {
    throw existingOrgError;
  }

  let orgId = existingOrg?.id ?? null;
  if (!orgId) {
    const fallbackName = user.email
      ? `Organizacao de ${user.email}`
      : `Organizacao ${user.id.slice(0, 8)}`;

    const { data: createdOrg, error: createOrgError } = await adminClient
      .from('organizations')
      .insert({
        name: fallbackName,
        owner_id: user.id,
      })
      .select('id')
      .single();

    if (createOrgError || !createdOrg?.id) {
      throw createOrgError || new Error('Falha ao criar organizacao');
    }

    orgId = createdOrg.id;
  }

  const { error: membershipUpsertError } = await adminClient
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

  if (membershipUpsertError) {
    throw membershipUpsertError;
  }

  return {
    ok: true,
    action: 'bootstrap_self',
    created: true,
    org_id: orgId,
    role: 'owner',
  };
}

async function listMembers(
  adminClient: ReturnType<typeof createClient>,
  callerMembership: CallerMembership,
) {
  const { data: members, error: membersError } = await adminClient
    .from('organization_members')
    .select('user_id, role, can_view_team_leads, created_at')
    .eq('org_id', callerMembership.org_id)
    .order('created_at', { ascending: true })
    .order('user_id', { ascending: true });

  if (membersError) {
    throw membersError;
  }

  const emailByUserId: Record<string, string | null> = {};
  const displayNameByUserId: Record<string, string | null> = {};

  for (const member of members ?? []) {
    const userId = String(member.user_id || '');
    if (!userId) {
      continue;
    }

    const { data: userData } = await adminClient.auth.admin.getUserById(userId);
    emailByUserId[userId] = userData.user?.email ?? null;
    displayNameByUserId[userId] = resolveUserDisplayName(userData.user ?? null);
  }

  return {
    ok: true,
    action: 'list_members',
    members: (members ?? []).map((member) => {
      const role = typeof member.role === 'string' && isValidRole(member.role) ? member.role : 'user';
      const userId = String(member.user_id || '');

      return {
        user_id: userId,
        email: emailByUserId[userId] ?? null,
        display_name: displayNameByUserId[userId] ?? null,
        role,
        can_view_team_leads: member.can_view_team_leads === true,
        joined_at: member.created_at ?? new Date().toISOString(),
      };
    }),
  };
}

async function inviteMember(
  adminClient: ReturnType<typeof createClient>,
  callerMembership: CallerMembership,
  payload: Record<string, unknown>,
) {
  const rawEmail = typeof payload.email === 'string' ? payload.email : '';
  const email = normalizeEmail(rawEmail);
  const rawRole = typeof payload.role === 'string' ? payload.role : '';
  const role = rawRole.trim();
  const canViewTeamLeads = payload.can_view_team_leads === true;
  const mode: 'create' | 'invite' = payload.mode === 'create' ? 'create' : 'invite';

  if (!isValidEmail(email)) {
    return jsonResponse(400, { ok: false, code: 'invalid_email', error: 'Email invalido para convite.' });
  }

  if (!isValidRole(role)) {
    return jsonResponse(400, { ok: false, code: 'invalid_role', error: 'Role invalida para convite.' });
  }

  const { data: orgData, error: orgError } = await adminClient
    .from('organizations')
    .select('name')
    .eq('id', callerMembership.org_id)
    .maybeSingle();

  if (orgError) {
    throw orgError;
  }

  const orgName = nonEmptyString(orgData?.name) ?? null;
  const appUrl = resolveAppUrl();
  const loginUrl = `${appUrl}/login`;
  const updatePasswordUrl = `${appUrl}/update-password?org_hint=${encodeURIComponent(callerMembership.org_id)}`;

  let user = await findUserByEmail(adminClient, email);
  let accountAlreadyExisted = Boolean(user);
  let tempPassword: string | undefined;
  let inviteLink: string | undefined;
  let resetLink: string | undefined;
  let credentialMode: 'temp_password' | 'reset_link' | 'invite_link' | 'login_only' = 'login_only';
  const accessLinkErrors: string[] = [];

  const tryGenerateInviteLink = async (targetEmail: string): Promise<string | undefined> => {
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: targetEmail,
      options: { redirectTo: updatePasswordUrl },
    });

    if (error) {
      accessLinkErrors.push(`invite_link_error:${error.message}`);
      return undefined;
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      accessLinkErrors.push('invite_link_not_generated');
      return undefined;
    }

    return actionLink;
  };

  const tryGenerateRecoveryLink = async (targetEmail: string): Promise<string | undefined> => {
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: targetEmail,
      options: { redirectTo: updatePasswordUrl },
    });

    if (error) {
      accessLinkErrors.push(`recovery_link_error:${error.message}`);
      return undefined;
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      accessLinkErrors.push('recovery_link_not_generated');
      return undefined;
    }

    return actionLink;
  };

  if (!user) {
    if (mode === 'invite') {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: updatePasswordUrl,
      });

      if (error) {
        const fallbackUser = await findUserByEmail(adminClient, email);
        if (!fallbackUser) {
          throw error;
        }
        user = fallbackUser;
        accountAlreadyExisted = true;
      } else {
        user = data.user ?? (await findUserByEmail(adminClient, email));
        accountAlreadyExisted = false;
      }
    } else {
      tempPassword = generateTempPassword();
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

      if (error) {
        const fallbackUser = await findUserByEmail(adminClient, email);
        if (!fallbackUser) {
          throw error;
        }
        user = fallbackUser;
        accountAlreadyExisted = true;
        tempPassword = undefined;
      } else {
        user = data.user ?? null;
        accountAlreadyExisted = false;
      }
    }
  }

  if (!user?.id) {
    return jsonResponse(500, {
      ok: false,
      code: 'invite_user_not_resolved',
      error: 'Nao foi possivel resolver o usuario convidado.',
    });
  }

  if (mode === 'create') {
    if (tempPassword) {
      credentialMode = 'temp_password';
    } else {
      const { data: recoveryLinkData, error: recoveryLinkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: user.email || email,
        options: { redirectTo: updatePasswordUrl },
      });

      if (recoveryLinkError) {
        throw recoveryLinkError;
      }

      if (!recoveryLinkData?.properties?.action_link) {
        throw new Error('recovery_link_not_generated');
      }

      resetLink = recoveryLinkData.properties.action_link;
      credentialMode = 'reset_link';
    }
  } else {
    const linkEmail = user.email || email;
    if (accountAlreadyExisted) {
      resetLink = await tryGenerateRecoveryLink(linkEmail);
      credentialMode = resetLink ? 'reset_link' : 'login_only';
    } else {
      inviteLink = await tryGenerateInviteLink(linkEmail);
      if (inviteLink) {
        credentialMode = 'invite_link';
      } else {
        resetLink = await tryGenerateRecoveryLink(linkEmail);
        credentialMode = resetLink ? 'reset_link' : 'login_only';
      }
    }
  }

  const { error: upsertError } = await adminClient
    .from('organization_members')
    .upsert(
      {
        org_id: callerMembership.org_id,
        user_id: user.id,
        role,
        can_view_team_leads: canViewTeamLeads,
      },
      { onConflict: 'org_id,user_id' },
    );

  if (upsertError) {
    throw upsertError;
  }

  const senderName = nonEmptyString(Deno.env.get('RESEND_SYSTEM_SENDER_NAME')) ?? 'SolarZap';
  const replyTo = nonEmptyString(Deno.env.get('RESEND_SYSTEM_REPLY_TO'));
  const recipientEmail = user.email || email;

  if (mode === 'invite' && !inviteLink && !resetLink) {
    return jsonResponse(502, {
      ok: false,
      code: 'system_email_send_failed',
      error:
        'Falha ao gerar link para definir/redefinir senha no convite. O membro foi vinculado, mas o e-mail nao foi entregue.',
      ...(accessLinkErrors.length > 0 ? { details: accessLinkErrors.join('; ') } : {}),
    });
  }

  try {
    const content = mode === 'invite'
      ? systemInviteEmail({
        senderName,
        orgName,
        role,
        inviteLink,
        resetLink,
        loginUrl,
        recipientEmail,
      })
      : systemAccountCreatedEmail({
        senderName,
        orgName,
        role,
        tempPassword,
        resetLink,
        loginUrl,
        recipientEmail,
      });

    await sendEmailViaResend(recipientEmail, content, senderName, replyTo ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(502, {
      ok: false,
      code: 'system_email_send_failed',
      error: 'Falha ao enviar e-mail de acesso. O membro foi vinculado, mas o e-mail nao foi entregue.',
      details: message,
    });
  }

  return jsonResponse(200, {
    ok: true,
    action: 'invite_member',
    user_id: user.id,
    email,
    org_id: callerMembership.org_id,
    assigned_role: role,
    mode,
    system_email_sent: true,
    credential_mode: credentialMode,
    account_already_existed: accountAlreadyExisted,
    ...(tempPassword ? { temp_password: tempPassword } : {}),
    ...(inviteLink ? { invite_link: inviteLink } : {}),
  });
}

async function updateMember(
  adminClient: ReturnType<typeof createClient>,
  callerMembership: CallerMembership,
  payload: Record<string, unknown>,
) {
  const userId = typeof payload.user_id === 'string' ? payload.user_id.trim() : '';
  const rawRole = typeof payload.role === 'string' ? payload.role.trim() : '';
  const canViewTeamLeads = payload.can_view_team_leads === true;

  if (!userId) {
    return jsonResponse(400, { ok: false, code: 'invalid_user_id', error: 'user_id obrigatorio.' });
  }

  if (!isValidRole(rawRole)) {
    return jsonResponse(400, { ok: false, code: 'invalid_role', error: 'Role invalida para update.' });
  }

  const { data: targetMembership, error: targetMembershipError } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('org_id', callerMembership.org_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (targetMembershipError) {
    throw targetMembershipError;
  }

  if (!targetMembership) {
    return jsonResponse(404, { ok: false, code: 'member_not_found', error: 'Membro nao encontrado na org.' });
  }

  if (targetMembership.role === 'owner' && rawRole !== 'owner') {
    const ownersCount = await countOwners(adminClient, callerMembership.org_id);
    if (ownersCount <= 1) {
      return jsonResponse(409, {
        ok: false,
        code: 'last_owner_guard',
        error: 'Nao e permitido remover o ultimo owner da organizacao.',
      });
    }
  }

  const { error: updateError } = await adminClient
    .from('organization_members')
    .update({
      role: rawRole,
      can_view_team_leads: canViewTeamLeads,
    })
    .eq('org_id', callerMembership.org_id)
    .eq('user_id', userId);

  if (updateError) {
    throw updateError;
  }

  return jsonResponse(200, {
    ok: true,
    action: 'update_member',
    user_id: userId,
    role: rawRole,
    can_view_team_leads: canViewTeamLeads,
  });
}

async function removeMember(
  adminClient: ReturnType<typeof createClient>,
  callerMembership: CallerMembership,
  payload: Record<string, unknown>,
) {
  const userId = typeof payload.user_id === 'string' ? payload.user_id.trim() : '';
  if (!userId) {
    return jsonResponse(400, { ok: false, code: 'invalid_user_id', error: 'user_id obrigatorio.' });
  }

  const { data: targetMembership, error: targetMembershipError } = await adminClient
    .from('organization_members')
    .select('role')
    .eq('org_id', callerMembership.org_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (targetMembershipError) {
    throw targetMembershipError;
  }

  if (!targetMembership) {
    return jsonResponse(404, { ok: false, code: 'member_not_found', error: 'Membro nao encontrado na org.' });
  }

  if (targetMembership.role === 'owner') {
    const ownersCount = await countOwners(adminClient, callerMembership.org_id);
    if (ownersCount <= 1) {
      return jsonResponse(409, {
        ok: false,
        code: 'last_owner_guard',
        error: 'Nao e permitido remover o ultimo owner da organizacao.',
      });
    }
  }

  const { error: deleteError } = await adminClient
    .from('organization_members')
    .delete()
    .eq('org_id', callerMembership.org_id)
    .eq('user_id', userId);

  if (deleteError) {
    throw deleteError;
  }

  return jsonResponse(200, { ok: true, action: 'remove_member', user_id: userId });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse(500, {
        ok: false,
        code: 'missing_env',
        error: 'SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY nao configurados.',
      });
    }

    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.toLowerCase().startsWith('bearer ')) {
      return jsonResponse(401, {
        ok: false,
        code: 'missing_auth',
        error: 'Authorization header Bearer obrigatorio.',
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(401, {
        ok: false,
        code: 'unauthorized',
        error: 'Usuario nao autenticado.',
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    const payload = (await req.json()) as Record<string, unknown>;
    const action = typeof payload.action === 'string' ? payload.action : '';

    if (!action) {
      return jsonResponse(400, { ok: false, code: 'missing_action', error: 'action obrigatoria.' });
    }

    if (action === 'bootstrap_self') {
      const result = await bootstrapSelf(adminClient, user);
      return jsonResponse(200, result);
    }

    if (action === 'list_user_orgs') {
      const result = await listUserOrganizations(adminClient, user.id);
      return jsonResponse(200, result);
    }

    const requestedOrgId = typeof payload.org_id === 'string' ? payload.org_id.trim() : '';
    const callerMembership = requestedOrgId
      ? await resolveMembershipByOrg(adminClient, user.id, requestedOrgId)
      : await resolvePrimaryMembership(adminClient, user.id);

    if (!callerMembership) {
      if (requestedOrgId) {
        return jsonResponse(403, {
          ok: false,
          code: 'forbidden_org_context',
          error: 'Usuario nao possui membership na organizacao informada.',
        });
      }

      return jsonResponse(403, {
        ok: false,
        code: 'no_membership',
        error: 'Usuario nao possui membership na organizacao.',
      });
    }

    if (action === 'list_members') {
      const result = await listMembers(adminClient, callerMembership);
      return jsonResponse(200, result);
    }

    if (!(callerMembership.role === 'owner' || callerMembership.role === 'admin')) {
      return jsonResponse(403, {
        ok: false,
        code: 'forbidden_role',
        error: 'Apenas owner/admin podem executar esta acao.',
      });
    }

    if (action === 'invite_member') {
      return await inviteMember(adminClient, callerMembership, payload);
    }

    if (action === 'update_member') {
      return await updateMember(adminClient, callerMembership, payload);
    }

    if (action === 'remove_member') {
      return await removeMember(adminClient, callerMembership, payload);
    }

    return jsonResponse(400, { ok: false, code: 'invalid_action', error: `action invalida: ${action}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno desconhecido';
    console.error('org-admin error:', error);
    return jsonResponse(500, { ok: false, code: 'internal_error', error: message });
  }
});
