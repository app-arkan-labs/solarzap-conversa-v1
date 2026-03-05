import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M17 attribution webhook e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgAId: string;
  orgBId: string;
  sharedUserId: string;
  sharedEmail: string;
  sharedPassword: string;
  phoneE164: string;
  keyA: string;
  keyB: string;
};

const state: SetupState = {
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  sharedUserId: '',
  sharedEmail: '',
  sharedPassword: '',
  phoneE164: '',
  keyA: '',
  keyB: '',
};

async function invokeAttributionWebhook(orgKey: string, name: string, gclid: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/attribution-webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-szap-org-key': orgKey,
    },
    body: JSON.stringify({
      name,
      phone: state.phoneE164,
      utm_source: 'google',
      gclid,
    }),
  });

  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  return { status: response.status, body };
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.sharedEmail = `m17.shared.${suffix}@example.test`;
  state.sharedPassword = `M17Shared!${suffix}Aa1`;
  state.phoneE164 = `55118${suffix.slice(-8)}`;
  state.keyA = `szap_m17_a_${suffix}`;
  state.keyB = `szap_m17_b_${suffix}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.sharedEmail,
    password: state.sharedPassword,
    email_confirm: true,
  });
  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M17 shared user: ${userResp.error?.message || 'unknown'}`);
  }
  state.sharedUserId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert([
    { id: state.orgAId, name: `M17 Org A ${suffix}`, owner_id: state.sharedUserId },
    { id: state.orgBId, name: `M17 Org B ${suffix}`, owner_id: state.sharedUserId },
  ]);
  if (orgErr) throw new Error(`Failed to create M17 orgs: ${orgErr.message}`);

  const { error: membersErr } = await admin.from('organization_members').insert([
    { org_id: state.orgAId, user_id: state.sharedUserId, role: 'owner', can_view_team_leads: true },
    { org_id: state.orgBId, user_id: state.sharedUserId, role: 'owner', can_view_team_leads: true },
  ]);
  if (membersErr) throw new Error(`Failed to create M17 memberships: ${membersErr.message}`);

  const { error: trackingErr } = await admin.from('org_tracking_settings').upsert([
    {
      org_id: state.orgAId,
      tracking_enabled: true,
      webhook_public_key: state.keyA,
      rate_limit_per_minute: 120,
    },
    {
      org_id: state.orgBId,
      tracking_enabled: true,
      webhook_public_key: state.keyB,
      rate_limit_per_minute: 120,
    },
  ]);
  if (trackingErr) throw new Error(`Failed to seed M17 tracking settings: ${trackingErr.message}`);
});

test.afterAll(async () => {
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

test('M17 multi-org attribution webhook: same phone creates one lead per org and attribution stays aligned', async () => {
  const first = await invokeAttributionWebhook(state.keyA, 'Lead Org A', `m17-a-${Date.now()}`);
  const second = await invokeAttributionWebhook(state.keyB, 'Lead Org B', `m17-b-${Date.now()}`);

  expect(first.status).toBe(200);
  expect(typeof first.body?.lead_id).toBe('number');
  expect(second.status).toBe(200);
  expect(typeof second.body?.lead_id).toBe('number');

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

  if (leadsError) throw new Error(`Failed to fetch M17 leads: ${leadsError.message}`);

  expect(leads).toHaveLength(2);
  expect(new Set((leads || []).map((row) => String(row.org_id))).size).toBe(2);
  expect(new Set((leads || []).map((row) => Number(row.id))).size).toBe(2);

  const leadIds = (leads || []).map((row) => Number(row.id));
  const leadOrgById = new Map<number, string>((leads || []).map((row) => [Number(row.id), String(row.org_id)]));

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('lead_attribution')
          .select('id')
          .in('lead_id', leadIds)
          .limit(10);

        if (error) return `ERROR:${error.message}`;
        return String((data || []).length);
      },
      { timeout: 30_000 },
    )
    .toBe('2');

  const { data: attributionRows, error: attributionError } = await admin
    .from('lead_attribution')
    .select('id, org_id, lead_id')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: true });

  if (attributionError) throw new Error(`Failed to fetch M17 attribution rows: ${attributionError.message}`);

  expect(attributionRows).toHaveLength(2);
  for (const row of attributionRows || []) {
    expect(leadOrgById.get(Number(row.lead_id))).toBe(String(row.org_id));
  }
});
