import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for auth membership forbidden/bootstrap recovery smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerPassword: string;
  leadName: string;
  leadPhone: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerUserId: '',
  ownerEmail: '',
  ownerPassword: '',
  leadName: '',
  leadPhone: '',
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
  state.ownerEmail = `auth.forbidden.owner.${suffix}@example.test`;
  state.ownerPassword = `AuthForbidden!${suffix}Aa1`;
  state.leadName = `AUTH-FORBIDDEN-LEAD-${suffix}`;
  state.leadPhone = `55${suffix.slice(-10)}`;

  const ownerResp = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, auth_membership_forbidden_e2e: true },
  });
  if (ownerResp.error || !ownerResp.data.user?.id) {
    throw new Error(`Failed to create auth-forbidden owner user: ${ownerResp.error?.message || 'unknown'}`);
  }
  state.ownerUserId = ownerResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `Auth Forbidden E2E Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create auth-forbidden org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.ownerUserId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create auth-forbidden membership: ${memberErr.message}`);

  const { error: leadErr } = await admin.from('leads').insert({
    org_id: state.orgId,
    user_id: state.ownerUserId,
    assigned_to_user_id: state.ownerUserId,
    nome: state.leadName,
    telefone: state.leadPhone,
    status_pipeline: 'novo_lead',
    canal: 'whatsapp',
  });
  if (leadErr) throw new Error(`Failed to create auth-forbidden lead: ${leadErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('interacoes').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.ownerUserId) {
    await admin.auth.admin.deleteUser(state.ownerUserId);
  }
});

test('auth membership forbidden recovery: organization_members returns 403, bootstrap_self recovers and app loads', async ({
  page,
}) => {
  let sawBootstrapSelf = false;

  await page.route('**/rest/v1/organization_members*', async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: '42501',
          message: 'permission denied for table organization_members (e2e)',
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/functions/v1/org-admin', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      try {
        const payload = request.postDataJSON() as { action?: string };
        if (payload?.action === 'bootstrap_self') {
          sawBootstrapSelf = true;
        }
      } catch {
        // Ignore malformed/non-JSON bodies (e.g. unexpected requests)
      }
    }

    await route.continue();
  });

  await login(page, state.ownerEmail, state.ownerPassword);

  await expect.poll(() => sawBootstrapSelf, { timeout: 15_000 }).toBe(true);

  await page.getByPlaceholder(/Pesquisar/i).fill(state.leadName);

  const row = page.locator('[data-testid="conversation-row"]').filter({ hasText: state.leadName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('toggle-team-leads')).toBeVisible({ timeout: 30_000 });
});
