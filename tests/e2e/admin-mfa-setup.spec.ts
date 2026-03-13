import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for admin-mfa-setup e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type State = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
};

const state: State = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = Date.now().toString();
  state.email = `admin.mfa.setup.${suffix}@example.test`;
  state.password = `MfaSetup!${suffix}Aa1`;

  const createdUser = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });

  if (createdUser.error || !createdUser.data.user?.id) {
    throw new Error(`Failed to create admin-mfa-setup user: ${createdUser.error?.message || 'unknown'}`);
  }

  state.userId = createdUser.data.user.id;

  const { error: orgError } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `Admin MFA Setup Org ${suffix}`,
    owner_id: state.userId,
  });
  if (orgError) {
    throw new Error(`Failed to create org: ${orgError.message}`);
  }

  const { error: membershipError } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (membershipError) {
    throw new Error(`Failed to create membership: ${membershipError.message}`);
  }

  const { error: systemAdminError } = await admin.from('_admin_system_admins').insert({
    user_id: state.userId,
    system_role: 'super_admin',
  });
  if (systemAdminError) {
    throw new Error(`Failed to seed system admin: ${systemAdminError.message}`);
  }
});

test.afterAll(async () => {
  if (state.userId) {
    await admin.from('_admin_system_admins').delete().eq('user_id', state.userId);
  }
  if (state.orgId) {
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }
  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('system admin sem fatores MFA vai para /admin/mfa-setup', async ({ page }) => {
  await login(page, state.email, state.password);

  await page.goto('/admin');
  await page.waitForURL('**/admin/mfa-setup', { timeout: 30_000 });

  await expect(page).toHaveURL(/\/admin\/mfa-setup$/);
  await expect(page.getByText('Configurar MFA para /admin')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar QR TOTP' })).toBeVisible();
});
