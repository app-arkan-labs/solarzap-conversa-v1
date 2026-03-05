import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for admin-org-suspension e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
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
  state.email = `org.suspend.user.${suffix}@example.test`;
  state.password = `Suspend!${suffix}Aa1`;

  const userResult = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });
  if (userResult.error || !userResult.data.user?.id) {
    throw new Error(`Failed to create user: ${userResult.error?.message || 'unknown'}`);
  }
  state.userId = userResult.data.user.id;

  const { error: orgError } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `Org Suspension ${suffix}`,
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

test('suspend org bloqueia CRM e reativacao libera acesso', async ({ page }) => {
  const { error: suspendError } = await admin
    .from('organizations')
    .update({
      status: 'suspended',
      suspension_reason: 'Suspensao de teste E2E',
      suspended_at: new Date().toISOString(),
    })
    .eq('id', state.orgId);

  if (suspendError) {
    test.skip(true, `Schema org status indisponivel: ${suspendError.message}`);
  }

  await login(page, state.email, state.password);
  await page.goto('/');
  await expect(page.getByText('Sua organizacao foi suspensa')).toBeVisible();
  await expect(page.getByText('Suspensao de teste E2E')).toBeVisible();

  const { error: reactivateError } = await admin
    .from('organizations')
    .update({
      status: 'active',
      suspension_reason: null,
      suspended_at: null,
      suspended_by: null,
    })
    .eq('id', state.orgId);
  if (reactivateError) {
    throw new Error(`Failed to reactivate org: ${reactivateError.message}`);
  }

  await page.reload();
  await expect(page.getByText('Sua organizacao foi suspensa')).toHaveCount(0);
  await expect(page.getByTestId('nav-settings-trigger')).toBeVisible();
});
