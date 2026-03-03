import { expect, test, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M13 org selection e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  userId: string;
  email: string;
  password: string;
  orgAId: string;
  orgBId: string;
  orgACompanyName: string;
  orgBOrganizationName: string;
};

const state: SetupState = {
  userId: '',
  email: '',
  password: '',
  orgAId: randomUUID(),
  orgBId: randomUUID(),
  orgACompanyName: '',
  orgBOrganizationName: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `m13.multi.org.${suffix}@example.test`;
  state.password = `M13MultiOrg!${suffix}Aa1`;
  state.orgACompanyName = `Empresa Alfa ${suffix}`;
  state.orgBOrganizationName = `Org Fallback ${suffix}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M13 user: ${userResp.error?.message || 'unknown'}`);
  }

  state.userId = userResp.data.user.id;

  const { error: orgAErr } = await admin.from('organizations').insert({
    id: state.orgAId,
    name: `Org A ${suffix}`,
    owner_id: state.userId,
  });
  if (orgAErr) throw new Error(`Failed to create M13 org A: ${orgAErr.message}`);

  const { error: orgBErr } = await admin.from('organizations').insert({
    id: state.orgBId,
    name: state.orgBOrganizationName,
    owner_id: state.userId,
  });
  if (orgBErr) throw new Error(`Failed to create M13 org B: ${orgBErr.message}`);

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
  if (membershipsErr) throw new Error(`Failed to create M13 memberships: ${membershipsErr.message}`);

  const { error: companyErr } = await admin
    .from('company_profile')
    .upsert(
      {
        org_id: state.orgAId,
        company_name: state.orgACompanyName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    );
  if (companyErr) throw new Error(`Failed to seed company_profile for M13 org A: ${companyErr.message}`);
});

test.afterAll(async () => {
  const orgIds = [state.orgAId, state.orgBId].filter(Boolean);
  if (orgIds.length > 0) {
    await admin.from('organization_members').delete().in('org_id', orgIds);
    await admin.from('company_profile').delete().in('org_id', orgIds);
    await admin.from('organizations').delete().in('id', orgIds);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('M13 org selection: requires selection on login and allows switching organization via menu', async ({ page }) => {
  await login(page, state.email, state.password);

  await page.waitForURL('**/select-organization*', { timeout: 30_000 });
  await expect(page.getByTestId('org-select-page')).toBeVisible();

  await expect(page.getByText(state.orgACompanyName)).toBeVisible();
  const orgBFallbackLabel = `Organizacao ${state.orgBId.slice(0, 8)}`;
  const hasOrganizationNameFallback = await page
    .getByText(state.orgBOrganizationName)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (!hasOrganizationNameFallback) {
    await expect(page.getByText(orgBFallbackLabel)).toBeVisible();
  }

  await page.getByTestId(`org-select-button-${state.orgAId}`).click();
  await page.waitForURL('**/', { timeout: 30_000 });

  const activeOrgAfterFirstSelect = await page.evaluate(() => localStorage.getItem('solarzap_active_org_id'));
  expect(activeOrgAfterFirstSelect).toBe(state.orgAId);

  await page.getByTestId('nav-settings-trigger').click();
  await page.getByTestId('nav-switch-org').click();

  await expect(page.getByTestId('org-selector-modal-panel')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId(`org-select-button-${state.orgBId}`).click();
  await expect
    .poll(
      () => page.evaluate(() => localStorage.getItem('solarzap_active_org_id')),
      { timeout: 30_000 },
    )
    .toBe(state.orgBId);
  await expect(page.getByTestId('nav-settings-trigger')).toBeVisible({ timeout: 30_000 });

  const activeOrgAfterSwitch = await page.evaluate(() => localStorage.getItem('solarzap_active_org_id'));
  expect(activeOrgAfterSwitch).toBe(state.orgBId);

  await page.evaluate((orgAId) => localStorage.setItem('solarzap_active_org_id', orgAId), state.orgAId);
  await page.goto(`/?org_hint=${state.orgBId}`);
  await expect
    .poll(
      () => page.evaluate(() => localStorage.getItem('solarzap_active_org_id')),
      { timeout: 30_000 },
    )
    .toBe(state.orgBId);

  await page.evaluate(() => localStorage.setItem('solarzap_active_org_id', '00000000-0000-0000-0000-000000000000'));
  await page.goto('/');
  await page.waitForURL('**/select-organization*', { timeout: 30_000 });
  await expect(page.getByTestId('org-select-page')).toBeVisible();
});
