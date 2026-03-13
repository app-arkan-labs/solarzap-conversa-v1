import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for admin-access-guard e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
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
  state.email = `admin.guard.user.${suffix}@example.test`;
  state.password = `Guard!${suffix}Aa1`;

  const createdUser = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });

  if (createdUser.error || !createdUser.data.user?.id) {
    throw new Error(`Failed to create e2e user: ${createdUser.error?.message || 'unknown'}`);
  }

  state.userId = createdUser.data.user.id;

  const { error: orgError } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `Admin Guard Org ${suffix}`,
    owner_id: state.userId,
  });
  if (orgError) {
    throw new Error(`Failed to create org: ${orgError.message}`);
  }

  const { error: membershipError } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'user',
    can_view_team_leads: false,
  });
  if (membershipError) {
    throw new Error(`Failed to create membership: ${membershipError.message}`);
  }
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }
  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('admin guard: usuario comum nao entra em /admin', async ({ page }) => {
  await login(page, state.email, state.password);

  await page.goto('/admin');
  await page.waitForURL('**/', { timeout: 30_000 });

  expect(page.url()).toMatch(/\/$/);
  await expect(page).not.toHaveURL(/\/admin/);
});
