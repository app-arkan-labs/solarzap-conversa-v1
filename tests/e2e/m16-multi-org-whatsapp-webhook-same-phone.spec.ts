import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ARKAN_WEBHOOK_SECRET = process.env.ARKAN_WEBHOOK_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ARKAN_WEBHOOK_SECRET) {
  throw new Error(
    'Missing env vars for M16 whatsapp webhook e2e: SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ARKAN_WEBHOOK_SECRET',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgAId: string;
  orgBId: string;
  sharedUserId: string;
  sharedEmail: string;
  sharedPassword: string;
  instanceAName: string;
  instanceBName: string;
  phoneE164: string;
};

const state: SetupState = {
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  sharedUserId: '',
  sharedEmail: '',
  sharedPassword: '',
  instanceAName: '',
  instanceBName: '',
  phoneE164: '',
};

async function invokeWhatsappWebhook(instanceName: string, waMessageId: string, text: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-arkan-webhook-secret': ARKAN_WEBHOOK_SECRET!,
    },
    body: JSON.stringify({
      event: 'MESSAGES_UPSERT',
      instance: instanceName,
      data: {
        key: {
          remoteJid: `${state.phoneE164}@s.whatsapp.net`,
          fromMe: false,
          id: waMessageId,
        },
        pushName: 'M16 Multi Org Lead',
        message: {
          conversation: text,
        },
        messageType: 'conversation',
      },
    }),
  });

  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  return { status: response.status, body };
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.sharedEmail = `m16.shared.${suffix}@example.test`;
  state.sharedPassword = `M16Shared!${suffix}Aa1`;
  state.instanceAName = `m16-a-${suffix}`;
  state.instanceBName = `m16-b-${suffix}`;
  state.phoneE164 = `55119${suffix.slice(-8)}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.sharedEmail,
    password: state.sharedPassword,
    email_confirm: true,
  });
  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M16 shared user: ${userResp.error?.message || 'unknown'}`);
  }
  state.sharedUserId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert([
    { id: state.orgAId, name: `M16 Org A ${suffix}`, owner_id: state.sharedUserId },
    { id: state.orgBId, name: `M16 Org B ${suffix}`, owner_id: state.sharedUserId },
  ]);
  if (orgErr) throw new Error(`Failed to create M16 orgs: ${orgErr.message}`);

  const { error: membersErr } = await admin.from('organization_members').insert([
    { org_id: state.orgAId, user_id: state.sharedUserId, role: 'owner', can_view_team_leads: true },
    { org_id: state.orgBId, user_id: state.sharedUserId, role: 'owner', can_view_team_leads: true },
  ]);
  if (membersErr) throw new Error(`Failed to create M16 memberships: ${membersErr.message}`);

  const { error: instancesErr } = await admin.from('whatsapp_instances').insert([
    {
      org_id: state.orgAId,
      user_id: state.sharedUserId,
      instance_name: state.instanceAName,
      display_name: 'M16 Org A',
      status: 'connected',
      is_active: true,
    },
    {
      org_id: state.orgBId,
      user_id: state.sharedUserId,
      instance_name: state.instanceBName,
      display_name: 'M16 Org B',
      status: 'connected',
      is_active: true,
    },
  ]);
  if (instancesErr) throw new Error(`Failed to seed M16 instances: ${instancesErr.message}`);
});

test.afterAll(async () => {
  if (state.instanceAName || state.instanceBName) {
    await admin
      .from('interacoes')
      .delete()
      .in('instance_name', [state.instanceAName, state.instanceBName].filter(Boolean));

    await admin
      .from('whatsapp_webhook_events')
      .delete()
      .in('instance_name', [state.instanceAName, state.instanceBName].filter(Boolean));
  }

  if (state.phoneE164) {
    await admin
      .from('leads')
      .delete()
      .eq('user_id', state.sharedUserId)
      .eq('phone_e164', state.phoneE164)
      .in('org_id', [state.orgAId, state.orgBId].filter(Boolean));
  }

  if (state.orgAId || state.orgBId) {
    await admin
      .from('whatsapp_instances')
      .delete()
      .in('org_id', [state.orgAId, state.orgBId].filter(Boolean));

    await admin
      .from('organization_members')
      .delete()
      .in('org_id', [state.orgAId, state.orgBId].filter(Boolean));

    await admin
      .from('organizations')
      .delete()
      .in('id', [state.orgAId, state.orgBId].filter(Boolean));
  }

  if (state.sharedUserId) {
    await admin.auth.admin.deleteUser(state.sharedUserId);
  }
});

test('M16 multi-org whatsapp webhook: same phone creates one lead per org and keeps interacoes aligned', async () => {
  const first = await invokeWhatsappWebhook(state.instanceAName, `m16-a-${Date.now()}`, 'Oi da org A');
  const second = await invokeWhatsappWebhook(state.instanceBName, `m16-b-${Date.now()}`, 'Oi da org B');

  expect(first.status).toBe(200);
  expect(first.body?.received).toBe(true);
  expect(second.status).toBe(200);
  expect(second.body?.received).toBe(true);

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('leads')
          .select('id')
          .eq('user_id', state.sharedUserId)
          .eq('phone_e164', state.phoneE164)
          .in('org_id', [state.orgAId, state.orgBId])
          .limit(10);

        if (error) return `ERROR:${error.message}`;
        return String((data || []).length);
      },
      { timeout: 30_000 },
    )
    .toBe('2');

  const { data: leads, error: leadsError } = await admin
    .from('leads')
    .select('id, org_id')
    .eq('user_id', state.sharedUserId)
    .eq('phone_e164', state.phoneE164)
    .in('org_id', [state.orgAId, state.orgBId])
    .order('org_id', { ascending: true });

  if (leadsError) throw new Error(`Failed to fetch M16 leads: ${leadsError.message}`);

  expect(leads).toHaveLength(2);
  expect(new Set((leads || []).map((row) => String(row.org_id))).size).toBe(2);
  expect(new Set((leads || []).map((row) => Number(row.id))).size).toBe(2);

  const leadOrgById = new Map<number, string>((leads || []).map((row) => [Number(row.id), String(row.org_id)]));

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('interacoes')
          .select('id')
          .in('instance_name', [state.instanceAName, state.instanceBName])
          .eq('phone_e164', state.phoneE164)
          .limit(10);

        if (error) return `ERROR:${error.message}`;
        return String((data || []).length);
      },
      { timeout: 30_000 },
    )
    .toBe('2');

  const { data: interactions, error: interactionsError } = await admin
    .from('interacoes')
    .select('id, org_id, lead_id, instance_name, phone_e164')
    .in('instance_name', [state.instanceAName, state.instanceBName])
    .eq('phone_e164', state.phoneE164)
    .order('created_at', { ascending: true });

  if (interactionsError) throw new Error(`Failed to fetch M16 interacoes: ${interactionsError.message}`);

  expect(interactions).toHaveLength(2);
  for (const row of interactions || []) {
    expect(typeof row.lead_id).toBe('number');
    expect(leadOrgById.get(Number(row.lead_id))).toBe(String(row.org_id));
  }
});
