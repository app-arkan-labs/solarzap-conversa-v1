import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for M4 smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerUserId: string;
  salesEmail: string;
  salesPassword: string;
  salesUserId: string;
  leadPrefix: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerEmail: '',
  ownerPassword: '',
  ownerUserId: '',
  salesEmail: '',
  salesPassword: '',
  salesUserId: '',
  leadPrefix: '',
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
  state.leadPrefix = `M4E2E-${suffix}`;
  state.ownerEmail = `m4.e2e.owner.${suffix}@example.test`;
  state.salesEmail = `m4.e2e.sales.${suffix}@example.test`;
  state.ownerPassword = `M4E2E!${suffix}Aa1`;
  state.salesPassword = `M4E2E!${suffix}Bb1`;

  const ownerResp = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, m4_e2e: true },
  });
  if (ownerResp.error || !ownerResp.data.user?.id) {
    throw new Error(`Failed to create owner user for M4 e2e: ${ownerResp.error?.message || 'unknown'}`);
  }
  state.ownerUserId = ownerResp.data.user.id;

  const salesResp = await admin.auth.admin.createUser({
    email: state.salesEmail,
    password: state.salesPassword,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, m4_e2e: true },
  });
  if (salesResp.error || !salesResp.data.user?.id) {
    throw new Error(`Failed to create salesperson user for M4 e2e: ${salesResp.error?.message || 'unknown'}`);
  }
  state.salesUserId = salesResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M4 E2E Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create M4 e2e org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert([
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgId,
      user_id: state.salesUserId,
      role: 'user',
      can_view_team_leads: false,
    },
  ]);
  if (memberErr) throw new Error(`Failed to create M4 e2e memberships: ${memberErr.message}`);

  const { error: leadsErr } = await admin.from('leads').insert([
    {
      org_id: state.orgId,
      user_id: state.salesUserId,
      assigned_to_user_id: state.salesUserId,
      nome: `${state.leadPrefix}-Sales-1`,
      telefone: `55${suffix.slice(-8)}21`,
      status_pipeline: 'novo_lead',
      canal: 'whatsapp',
    },
    {
      org_id: state.orgId,
      user_id: state.salesUserId,
      assigned_to_user_id: state.salesUserId,
      nome: `${state.leadPrefix}-Sales-2`,
      telefone: `55${suffix.slice(-8)}22`,
      status_pipeline: 'novo_lead',
      canal: 'whatsapp',
    },
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      assigned_to_user_id: state.ownerUserId,
      nome: `${state.leadPrefix}-Owner-1`,
      telefone: `55${suffix.slice(-8)}23`,
      status_pipeline: 'novo_lead',
      canal: 'whatsapp',
    },
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      assigned_to_user_id: state.ownerUserId,
      nome: `${state.leadPrefix}-Owner-2`,
      telefone: `55${suffix.slice(-8)}24`,
      status_pipeline: 'novo_lead',
      canal: 'whatsapp',
    },
  ]);
  if (leadsErr) throw new Error(`Failed to create M4 e2e leads: ${leadsErr.message}`);
});

test.afterAll(async () => {
  if (state.ownerUserId) await admin.auth.admin.deleteUser(state.ownerUserId);
  if (state.salesUserId) await admin.auth.admin.deleteUser(state.salesUserId);
});

test('salesperson sees only own assigned leads', async ({ page }) => {
  await login(page, state.salesEmail, state.salesPassword);

  await page.getByPlaceholder('Pesquisar ou começar nova conversa').fill(state.leadPrefix);
  const rows = page.locator('[data-testid="conversation-row"]').filter({ hasText: state.leadPrefix });
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId('toggle-team-leads')).toHaveCount(0);

  await page.locator('button[title="Dashboard"]').click();
  await expect(page.getByTestId('dashboard-owner-scope-trigger')).toHaveCount(0);

  await page.locator('button[title="Pipelines"]').click();
  await expect(page.getByTestId('pipeline-owner-scope-trigger')).toHaveCount(0);

  await page.locator('button[title="Contatos"]').click();
  await expect(page.getByTestId('contacts-owner-scope-trigger')).toHaveCount(0);
});

test('owner sees dropdown and can switch own/team/specific member leads', async ({ page }) => {
  await login(page, state.ownerEmail, state.ownerPassword);

  await page.getByPlaceholder('Pesquisar ou começar nova conversa').fill(state.leadPrefix);
  const rows = page.locator('[data-testid="conversation-row"]').filter({ hasText: state.leadPrefix });
  await expect(rows).toHaveCount(2, { timeout: 30_000 });

  const scopeTrigger = page.getByTestId('toggle-team-leads');
  await expect(scopeTrigger).toBeVisible({ timeout: 30_000 });

  await scopeTrigger.click();
  await page.getByTestId('toggle-team-leads-option-org-all').click();

  await expect(rows).toHaveCount(4, { timeout: 30_000 });

  await scopeTrigger.click();
  await page.getByTestId(`toggle-team-leads-option-user-${state.salesUserId}`).click();
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('[data-testid="conversation-row"]').filter({ hasText: `${state.leadPrefix}-Sales-1` })).toHaveCount(1);
  await expect(page.locator('[data-testid="conversation-row"]').filter({ hasText: `${state.leadPrefix}-Owner-1` })).toHaveCount(0);

  await scopeTrigger.click();
  await page.getByTestId('toggle-team-leads-option-mine').click();
  await expect(rows).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('[data-testid="conversation-row"]').filter({ hasText: `${state.leadPrefix}-Owner-1` })).toHaveCount(1);
  await expect(page.locator('[data-testid="conversation-row"]').filter({ hasText: `${state.leadPrefix}-Sales-1` })).toHaveCount(0);

  await page.locator('button[title="Dashboard"]').click();
  await expect(page.getByTestId('dashboard-owner-scope-trigger')).toBeVisible({ timeout: 30_000 });

  await page.locator('button[title="Pipelines"]').click();
  await expect(page.getByTestId('pipeline-owner-scope-trigger')).toBeVisible({ timeout: 30_000 });

  await page.locator('button[title="Contatos"]').click();
  await expect(page.getByTestId('contacts-owner-scope-trigger')).toBeVisible({ timeout: 30_000 });
});
