import { expect, test, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M15 whatsapp visibility e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerUserId: string;
  adminUserId: string;
  userUserId: string;
  ownerEmail: string;
  ownerPassword: string;
  adminEmail: string;
  adminPassword: string;
  userEmail: string;
  userPassword: string;
  ownerInstanceName: string;
  ownerInstanceDisplay: string;
  userInstanceName: string;
  userInstanceDisplay: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerUserId: '',
  adminUserId: '',
  userUserId: '',
  ownerEmail: '',
  ownerPassword: '',
  adminEmail: '',
  adminPassword: '',
  userEmail: '',
  userPassword: '',
  ownerInstanceName: '',
  ownerInstanceDisplay: '',
  userInstanceName: '',
  userInstanceDisplay: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

async function openIntegrations(page: Page) {
  await page.getByTestId('nav-settings-trigger').click();
  await page.getByRole('button', { name: /Central de Integra/i }).click();
  await expect(page.getByRole('heading', { name: /Central de Integra/i })).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.ownerEmail = `m15.owner.${suffix}@example.test`;
  state.ownerPassword = `M15Owner!${suffix}Aa1`;
  state.adminEmail = `m15.admin.${suffix}@example.test`;
  state.adminPassword = `M15Admin!${suffix}Aa1`;
  state.userEmail = `m15.user.${suffix}@example.test`;
  state.userPassword = `M15User!${suffix}Aa1`;
  state.ownerInstanceName = `m15-owner-${suffix}`;
  state.ownerInstanceDisplay = `M15 Owner ${suffix.slice(-4)}`;
  state.userInstanceName = `m15-user-${suffix}`;
  state.userInstanceDisplay = `M15 User ${suffix.slice(-4)}`;

  const ownerResp = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
  });
  if (ownerResp.error || !ownerResp.data.user?.id) {
    throw new Error(`Failed to create M15 owner user: ${ownerResp.error?.message || 'unknown'}`);
  }
  state.ownerUserId = ownerResp.data.user.id;

  const adminResp = await admin.auth.admin.createUser({
    email: state.adminEmail,
    password: state.adminPassword,
    email_confirm: true,
  });
  if (adminResp.error || !adminResp.data.user?.id) {
    throw new Error(`Failed to create M15 admin user: ${adminResp.error?.message || 'unknown'}`);
  }
  state.adminUserId = adminResp.data.user.id;

  const userResp = await admin.auth.admin.createUser({
    email: state.userEmail,
    password: state.userPassword,
    email_confirm: true,
  });
  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M15 user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userUserId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M15 Org ${suffix}`,
    owner_id: state.ownerUserId,
  });
  if (orgErr) throw new Error(`Failed to create M15 org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert([
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgId,
      user_id: state.adminUserId,
      role: 'admin',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgId,
      user_id: state.userUserId,
      role: 'user',
      can_view_team_leads: false,
    },
  ]);
  if (memberErr) throw new Error(`Failed to create M15 memberships: ${memberErr.message}`);

  const { error: instancesErr } = await admin.from('whatsapp_instances').insert([
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      instance_name: state.ownerInstanceName,
      display_name: state.ownerInstanceDisplay,
      status: 'connected',
      is_active: true,
    },
    {
      org_id: state.orgId,
      user_id: state.userUserId,
      instance_name: state.userInstanceName,
      display_name: state.userInstanceDisplay,
      status: 'connected',
      is_active: true,
    },
  ]);
  if (instancesErr) throw new Error(`Failed to seed M15 instances: ${instancesErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('whatsapp_instances').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  for (const userId of [state.userUserId, state.adminUserId, state.ownerUserId]) {
    if (!userId) continue;
    await admin.auth.admin.deleteUser(userId);
  }
});

test('M15 admin visibility: admin sees all org instances', async ({ page }) => {
  await login(page, state.adminEmail, state.adminPassword);
  await openIntegrations(page);

  await expect(page.getByText(state.ownerInstanceDisplay)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(state.userInstanceDisplay)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /Inst.*Empresa \(2\)/i })).toBeVisible({ timeout: 30_000 });
});

test('M15 user visibility: user sees only own instances', async ({ page }) => {
  await login(page, state.userEmail, state.userPassword);
  await openIntegrations(page);

  await expect(page.getByText(state.userInstanceDisplay)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(state.ownerInstanceDisplay)).toHaveCount(0);
});
