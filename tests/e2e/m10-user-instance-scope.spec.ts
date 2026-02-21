import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M10 e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerUserId: string;
  userUserId: string;
  ownerEmail: string;
  ownerPassword: string;
  userEmail: string;
  userPassword: string;
  leadPrefix: string;
  allowedInstanceName: string;
  allowedInstanceDisplay: string;
  foreignInstanceName: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerUserId: '',
  userUserId: '',
  ownerEmail: '',
  ownerPassword: '',
  userEmail: '',
  userPassword: '',
  leadPrefix: '',
  allowedInstanceName: '',
  allowedInstanceDisplay: '',
  foreignInstanceName: '',
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
  state.ownerEmail = `m10.owner.${suffix}@example.test`;
  state.ownerPassword = `M10Owner!${suffix}Aa1`;
  state.userEmail = `m10.user.${suffix}@example.test`;
  state.userPassword = `M10User!${suffix}Aa1`;
  state.leadPrefix = `M10E2E-${suffix}`;
  state.allowedInstanceName = `m10-user-instance-${suffix}`;
  state.allowedInstanceDisplay = `M10 User Instance ${suffix.slice(-4)}`;
  state.foreignInstanceName = `m10-owner-instance-${suffix}`;

  const ownerResp = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
  });

  if (ownerResp.error || !ownerResp.data.user?.id) {
    throw new Error(`Failed to create M10 owner user: ${ownerResp.error?.message || 'unknown'}`);
  }
  state.ownerUserId = ownerResp.data.user.id;

  const userResp = await admin.auth.admin.createUser({
    email: state.userEmail,
    password: state.userPassword,
    email_confirm: true,
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M10 user role user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userUserId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M10 E2E Org ${suffix}`,
    owner_id: state.ownerUserId,
  });
  if (orgErr) throw new Error(`Failed to create M10 org: ${orgErr.message}`);

  const { error: membershipErr } = await admin.from('organization_members').insert([
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgId,
      user_id: state.userUserId,
      role: 'user',
      can_view_team_leads: false,
    },
  ]);
  if (membershipErr) throw new Error(`Failed to create M10 memberships: ${membershipErr.message}`);

  const { error: instancesErr } = await admin.from('whatsapp_instances').insert([
    {
      org_id: state.orgId,
      user_id: state.userUserId,
      instance_name: state.allowedInstanceName,
      display_name: state.allowedInstanceDisplay,
      status: 'connected',
      is_active: true,
    },
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      instance_name: state.foreignInstanceName,
      display_name: `M10 Owner Instance ${suffix.slice(-4)}`,
      status: 'connected',
      is_active: true,
    },
  ]);
  if (instancesErr) throw new Error(`Failed to create M10 instances: ${instancesErr.message}`);

  const { error: leadsErr } = await admin.from('leads').insert([
    {
      org_id: state.orgId,
      user_id: state.userUserId,
      assigned_to_user_id: state.userUserId,
      nome: `${state.leadPrefix}-Allowed`,
      telefone: `55${suffix.slice(-8)}31`,
      status_pipeline: 'novo_lead',
      canal: 'whatsapp',
      instance_name: state.allowedInstanceName,
    },
    {
      org_id: state.orgId,
      user_id: state.userUserId,
      assigned_to_user_id: state.userUserId,
      nome: `${state.leadPrefix}-Foreign`,
      telefone: `55${suffix.slice(-8)}32`,
      status_pipeline: 'novo_lead',
      canal: 'whatsapp',
      instance_name: state.foreignInstanceName,
    },
  ]);
  if (leadsErr) throw new Error(`Failed to create M10 leads: ${leadsErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('interacoes').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('whatsapp_instances').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.userUserId) {
    await admin.auth.admin.deleteUser(state.userUserId);
  }
  if (state.ownerUserId) {
    await admin.auth.admin.deleteUser(state.ownerUserId);
  }
});

test('M10 user role sees only assigned-instance leads and locked instance UI', async ({ page }) => {
  await login(page, state.userEmail, state.userPassword);

  await page.getByPlaceholder(/Pesquisar/i).fill(state.leadPrefix);
  const rows = page.locator('[data-testid="conversation-row"]').filter({ hasText: state.leadPrefix });

  await expect(rows).toHaveCount(1, { timeout: 30_000 });
  await expect(rows.filter({ hasText: `${state.leadPrefix}-Allowed` })).toHaveCount(1);
  await expect(rows.filter({ hasText: `${state.leadPrefix}-Foreign` })).toHaveCount(0);

  await rows.first().click();

  const badge = page.getByTestId('user-assigned-instance-badge');
  await expect(badge).toBeVisible({ timeout: 30_000 });
  await expect(badge).toContainText(state.allowedInstanceDisplay);

  await expect(page.getByRole('button', { name: new RegExp(state.allowedInstanceDisplay, 'i') })).toHaveCount(0);
});
