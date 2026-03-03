import { expect, test, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M14 invite org hint e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  userId: string;
  email: string;
  password: string;
  orgAId: string;
  orgBId: string;
};

const state: SetupState = {
  userId: '',
  email: '',
  password: '',
  orgAId: randomUUID(),
  orgBId: randomUUID(),
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `m14.org.hint.${suffix}@example.test`;
  state.password = `M14OrgHint!${suffix}Aa1`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M14 user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userId = userResp.data.user.id;

  const { error: orgAErr } = await admin.from('organizations').insert({
    id: state.orgAId,
    name: `M14 Org A ${suffix}`,
    owner_id: state.userId,
  });
  if (orgAErr) throw new Error(`Failed to create M14 org A: ${orgAErr.message}`);

  const { error: orgBErr } = await admin.from('organizations').insert({
    id: state.orgBId,
    name: `M14 Org B ${suffix}`,
    owner_id: state.userId,
  });
  if (orgBErr) throw new Error(`Failed to create M14 org B: ${orgBErr.message}`);

  const { error: membershipsErr } = await admin.from('organization_members').insert([
    {
      org_id: state.orgAId,
      user_id: state.userId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgBId,
      user_id: state.userId,
      role: 'owner',
      can_view_team_leads: true,
    },
  ]);
  if (membershipsErr) throw new Error(`Failed to create M14 memberships: ${membershipsErr.message}`);
});

test.afterAll(async () => {
  const orgIds = [state.orgAId, state.orgBId].filter(Boolean);
  if (orgIds.length > 0) {
    await admin.from('organization_members').delete().in('org_id', orgIds);
    await admin.from('organizations').delete().in('id', orgIds);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('M14 invite org_hint: callback context switches to hinted org even with previous org stored', async ({ page }) => {
  await login(page, state.email, state.password);

  await page.waitForURL('**/select-organization*', { timeout: 30_000 });
  await page.getByTestId(`org-select-button-${state.orgAId}`).click();
  await page.waitForURL('**/', { timeout: 30_000 });

  const activeOrgBeforeHint = await page.evaluate(() => localStorage.getItem('solarzap_active_org_id'));
  expect(activeOrgBeforeHint).toBe(state.orgAId);

  await page.goto(`/update-password?org_hint=${state.orgBId}`);
  await page.waitForURL('**/update-password*', { timeout: 30_000 });

  await expect
    .poll(
      () => page.evaluate(() => localStorage.getItem('solarzap_active_org_id')),
      { timeout: 30_000 },
    )
    .toBe(state.orgBId);

  await page.goto('/');
  await page.waitForURL('**/', { timeout: 30_000 });

  const activeOrgAfterHint = await page.evaluate(() => localStorage.getItem('solarzap_active_org_id'));
  expect(activeOrgAfterHint).toBe(state.orgBId);
});
