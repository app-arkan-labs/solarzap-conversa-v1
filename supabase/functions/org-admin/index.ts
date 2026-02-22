import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { systemAccountCreatedEmail, systemInviteEmail } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
  const mode = payload.mode === 'invite' ? 'invite' : 'create';

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

  let user = await findUserByEmail(adminClient, email);
  let tempPassword: string | undefined;
  let inviteLink: string | undefined;

  if (!user) {
    if (mode === 'invite') {
      const { data: primaryLinkData, error: primaryLinkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
      });

      if (!primaryLinkError && primaryLinkData?.properties?.action_link) {
        inviteLink = primaryLinkData.properties.action_link;
      }

      if (primaryLinkError) {
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
        if (error) {
          const fallbackUser = await findUserByEmail(adminClient, email);
          if (!fallbackUser) {
            throw error;
          }
          user = fallbackUser;
        } else {
          user = data.user ?? (await findUserByEmail(adminClient, email));
        }

        if (!inviteLink && user?.email) {
          const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'invite',
            email: user.email,
          });
          if (!linkError && linkData?.properties?.action_link) {
            inviteLink = linkData.properties.action_link;
          }
        }
      }

      if (!user) {
        user = await findUserByEmail(adminClient, email);
      }

      if (!user) {
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
        if (error) {
          const fallbackUser = await findUserByEmail(adminClient, email);
          if (!fallbackUser) {
            throw error;
          }
          user = fallbackUser;
        } else {
          user = data.user ?? (await findUserByEmail(adminClient, email));
        }

        if (!inviteLink && user?.email) {
          const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
            type: 'invite',
            email: user.email,
          });
          if (!linkError && linkData?.properties?.action_link) {
            inviteLink = linkData.properties.action_link;
          }
        }
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
        tempPassword = undefined;
      } else {
        user = data.user ?? null;
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

  const { data: existingMemberships, error: existingMembershipsError } = await adminClient
    .from('organization_members')
    .select('org_id, role, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .order('org_id', { ascending: true });

  if (existingMembershipsError) {
    throw existingMembershipsError;
  }

  const sameOrgMembership = (existingMemberships ?? []).find(
    (membership) => membership.org_id === callerMembership.org_id,
  );

  const firstMembership = (existingMemberships ?? [])[0];
  if (firstMembership && !sameOrgMembership && firstMembership.org_id !== callerMembership.org_id) {
    return jsonResponse(409, {
      ok: false,
      code: 'user_belongs_to_other_org',
      error: 'Usuario ja pertence a outra organizacao.',
    });
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
  const loginUrl = `${resolveAppUrl()}/login`;
  const recipientEmail = user.email || email;

  let systemEmailSent = false;
  let systemEmailError: string | undefined;

  try {
    const content = mode === 'invite'
      ? systemInviteEmail({
        senderName,
        orgName,
        role,
        inviteLink,
        loginUrl,
        recipientEmail,
      })
      : systemAccountCreatedEmail({
        senderName,
        orgName,
        role,
        tempPassword,
        loginUrl,
        recipientEmail,
      });

    await sendEmailViaResend(recipientEmail, content, senderName, replyTo ?? null);
    systemEmailSent = true;
  } catch (error) {
    systemEmailError = error instanceof Error ? error.message : String(error);
  }

  return jsonResponse(200, {
    ok: true,
    action: 'invite_member',
    user_id: user.id,
    email,
    mode,
    system_email_sent: systemEmailSent,
    ...(systemEmailError ? { system_email_error: systemEmailError } : {}),
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

    const callerMembership = await resolvePrimaryMembership(adminClient, user.id);
    if (!callerMembership) {
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
