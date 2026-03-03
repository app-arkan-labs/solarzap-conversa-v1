import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing env vars for multi-org admin members e2e: SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgAId: string;
  orgBId: string;
  ownerAUserId: string;
  ownerBUserId: string;
  sharedUserId: string;
  ownerAEmail: string;
  ownerAPassword: string;
  ownerBEmail: string;
  ownerBPassword: string;
  sharedEmail: string;
  sharedPassword: string;
};

const state: SetupState = {
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  ownerAUserId: '',
  ownerBUserId: '',
  sharedUserId: '',
  ownerAEmail: '',
  ownerAPassword: '',
  ownerBEmail: '',
  ownerBPassword: '',
  sharedEmail: '',
  sharedPassword: '',
};

async function createConfirmedUser(email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user?.id) {
    throw new Error(`Failed to create user ${email}: ${error?.message || 'unknown'}`);
  }

  return data.user.id;
}

async function signInAs(email: string, password: string): Promise<string> {
  const authClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Failed to sign in as ${email}: ${error?.message || 'missing session'}`);
  }

  return data.session.access_token;
}

async function invokeOrgAdminAsOwner(input: {
  email: string;
  password: string;
  payload: Record<string, unknown>;
}): Promise<{ status: number; payload: any }> {
  const ownerToken = await signInAs(input.email, input.password);
  const ownerClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${ownerToken}` } },
  });

  try {
    const { data, error } = await ownerClient.functions.invoke('org-admin', {
      body: input.payload,
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    if (!error) {
      return { status: 200, payload: data };
    }

    const functionError = error as { context?: Response };
    const status = functionError.context?.status ?? 500;
    let payload: any = { ok: false, error: error.message };

    if (functionError.context && typeof functionError.context.text === 'function') {
      try {
        const raw = await functionError.context.text();
        payload = JSON.parse(raw);
      } catch {
        // ignore parse failure and keep fallback payload
      }
    }

    return { status, payload };
  } finally {
    await ownerClient.auth.signOut();
  }
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.ownerAEmail = `m8.multi.owner.a.${suffix}@example.test`;
  state.ownerAPassword = `M8OwnerA!${suffix}Aa1`;
  state.ownerBEmail = `m8.multi.owner.b.${suffix}@example.test`;
  state.ownerBPassword = `M8OwnerB!${suffix}Aa1`;
  state.sharedEmail = `m8.multi.shared.${suffix}@example.test`;
  state.sharedPassword = `M8Shared!${suffix}Aa1`;

  state.ownerAUserId = await createConfirmedUser(state.ownerAEmail, state.ownerAPassword);
  state.ownerBUserId = await createConfirmedUser(state.ownerBEmail, state.ownerBPassword);
  state.sharedUserId = await createConfirmedUser(state.sharedEmail, state.sharedPassword);

  const { error: orgAErr } = await admin.from('organizations').insert({
    id: state.orgAId,
    name: `M8 Multi Org A ${suffix}`,
    owner_id: state.ownerAUserId,
  });
  if (orgAErr) throw new Error(`Failed to create org A: ${orgAErr.message}`);

  const { error: orgBErr } = await admin.from('organizations').insert({
    id: state.orgBId,
    name: `M8 Multi Org B ${suffix}`,
    owner_id: state.ownerBUserId,
  });
  if (orgBErr) throw new Error(`Failed to create org B: ${orgBErr.message}`);

  const { error: membersErr } = await admin.from('organization_members').insert([
    {
      org_id: state.orgAId,
      user_id: state.ownerAUserId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgBId,
      user_id: state.ownerBUserId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgAId,
      user_id: state.sharedUserId,
      role: 'user',
      can_view_team_leads: false,
    },
  ]);
  if (membersErr) throw new Error(`Failed to seed memberships: ${membersErr.message}`);
});

test.afterAll(async () => {
  const orgIds = [state.orgAId, state.orgBId].filter(Boolean);
  if (orgIds.length > 0) {
    await admin.from('organization_members').delete().in('org_id', orgIds);
    await admin.from('organizations').delete().in('id', orgIds);
  }

  for (const userId of [state.sharedUserId, state.ownerBUserId, state.ownerAUserId]) {
    if (!userId) continue;
    await admin.auth.admin.deleteUser(userId);
  }
});

test('M8 multi-org invite_member: allows linking existing email from another org without 409', async () => {
  const result = await invokeOrgAdminAsOwner({
    email: state.ownerBEmail,
    password: state.ownerBPassword,
    payload: {
      action: 'invite_member',
      email: state.sharedEmail,
      role: 'user',
      can_view_team_leads: false,
      mode: 'invite',
    },
  });

  expect(result.status).not.toBe(409);
  if (result.status === 200) {
    expect(result.payload?.ok).toBe(true);
    expect(result.payload?.action).toBe('invite_member');
  } else {
    expect(result.status).toBe(502);
    expect(result.payload?.ok).toBe(false);
    expect(result.payload?.code).toBe('system_email_send_failed');
  }

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('organization_members')
          .select('org_id, user_id, role')
          .eq('org_id', state.orgBId)
          .eq('user_id', state.sharedUserId)
          .maybeSingle();

        if (error) return `ERROR:${error.message}`;
        if (!data) return null;
        return `${data.org_id}|${data.user_id}|${data.role}`;
      },
      { timeout: 30_000 },
    )
    .toBe(`${state.orgBId}|${state.sharedUserId}|user`);

  const { data: originalMembership, error: originalMembershipError } = await admin
    .from('organization_members')
    .select('org_id, user_id')
    .eq('org_id', state.orgAId)
    .eq('user_id', state.sharedUserId)
    .maybeSingle();

  expect(originalMembershipError).toBeNull();
  expect(originalMembership?.org_id).toBe(state.orgAId);
  expect(originalMembership?.user_id).toBe(state.sharedUserId);
});
