import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M11 e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerUserId: string;
  assigneeUserId: string;
  ownerEmail: string;
  ownerPassword: string;
  assigneeEmail: string;
  assigneePassword: string;
  leadId: number;
  leadName: string;
  leadPhoneE164: string;
  instanceName: string;
  oldMessageToken: string;
  newMessageToken: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerUserId: '',
  assigneeUserId: '',
  ownerEmail: '',
  ownerPassword: '',
  assigneeEmail: '',
  assigneePassword: '',
  leadId: 0,
  leadName: '',
  leadPhoneE164: '',
  instanceName: '',
  oldMessageToken: '',
  newMessageToken: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.ownerEmail = `m11.owner.${suffix}@example.test`;
  state.ownerPassword = `M11Owner!${suffix}Aa1`;
  state.assigneeEmail = `m11.user.${suffix}@example.test`;
  state.assigneePassword = `M11User!${suffix}Aa1`;
  state.leadName = `M11-Lead-${suffix}`;
  state.leadPhoneE164 = `55${suffix.slice(-11)}`;
  state.instanceName = `m11-instance-${suffix}`;
  state.oldMessageToken = `M11_OLD_${suffix.slice(-6)}`;
  state.newMessageToken = `M11_NEW_${suffix.slice(-6)}`;

  const ownerResp = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
  });
  if (ownerResp.error || !ownerResp.data.user?.id) {
    throw new Error(`Failed to create M11 owner user: ${ownerResp.error?.message || 'unknown'}`);
  }
  state.ownerUserId = ownerResp.data.user.id;

  const assigneeResp = await admin.auth.admin.createUser({
    email: state.assigneeEmail,
    password: state.assigneePassword,
    email_confirm: true,
  });
  if (assigneeResp.error || !assigneeResp.data.user?.id) {
    throw new Error(`Failed to create M11 assignee user: ${assigneeResp.error?.message || 'unknown'}`);
  }
  state.assigneeUserId = assigneeResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M11 E2E Org ${suffix}`,
    owner_id: state.ownerUserId,
  });
  if (orgErr) throw new Error(`Failed to create M11 org: ${orgErr.message}`);

  const { error: membersErr } = await admin.from('organization_members').insert([
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgId,
      user_id: state.assigneeUserId,
      role: 'user',
      can_view_team_leads: false,
    },
  ]);
  if (membersErr) throw new Error(`Failed to create M11 memberships: ${membersErr.message}`);

  const { error: instanceErr } = await admin.from('whatsapp_instances').insert({
    org_id: state.orgId,
    user_id: state.assigneeUserId,
    instance_name: state.instanceName,
    display_name: `M11 Assigned ${suffix.slice(-4)}`,
    status: 'connected',
    is_active: true,
  });
  if (instanceErr) throw new Error(`Failed to create M11 instance: ${instanceErr.message}`);

  const { data: leadRow, error: leadErr } = await admin
    .from('leads')
    .insert({
      org_id: state.orgId,
      user_id: state.ownerUserId,
      assigned_to_user_id: state.assigneeUserId,
      nome: state.leadName,
      telefone: state.leadPhoneE164,
      phone_e164: state.leadPhoneE164,
      status_pipeline: 'novo_lead',
      canal: 'whatsapp',
      instance_name: state.instanceName,
    })
    .select('id')
    .single();
  if (leadErr || !leadRow?.id) {
    throw new Error(`Failed to create M11 lead: ${leadErr?.message || 'missing lead id'}`);
  }
  state.leadId = Number(leadRow.id);

  const baseDate = Date.now();
  const { error: interactionsErr } = await admin.from('interacoes').insert([
    {
      org_id: state.orgId,
      lead_id: state.leadId,
      user_id: state.ownerUserId,
      tipo: 'mensagem_cliente',
      mensagem: state.oldMessageToken,
      instance_name: state.instanceName,
      phone_e164: state.leadPhoneE164,
      created_at: new Date(baseDate - 60_000).toISOString(),
    },
    {
      org_id: state.orgId,
      lead_id: state.leadId,
      user_id: state.ownerUserId,
      tipo: 'mensagem_vendedor',
      mensagem: state.newMessageToken,
      instance_name: state.instanceName,
      phone_e164: state.leadPhoneE164,
      created_at: new Date(baseDate - 30_000).toISOString(),
    },
  ]);
  if (interactionsErr) {
    throw new Error(`Failed to seed M11 interactions: ${interactionsErr.message}`);
  }
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('interacoes').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('whatsapp_instances').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.assigneeUserId) {
    await admin.auth.admin.deleteUser(state.assigneeUserId);
  }
  if (state.ownerUserId) {
    await admin.auth.admin.deleteUser(state.ownerUserId);
  }
});

test('M11 assigned user sees conversation history created before assignment', async ({ page }) => {
  await login(page, state.assigneeEmail, state.assigneePassword);

  await page.getByPlaceholder(/Pesquisar/i).fill(state.leadName);
  const row = page.locator('[data-testid="conversation-row"]').filter({ hasText: state.leadName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  await expect(page.getByText(state.oldMessageToken).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(state.newMessageToken).first()).toBeVisible({ timeout: 30_000 });
});
