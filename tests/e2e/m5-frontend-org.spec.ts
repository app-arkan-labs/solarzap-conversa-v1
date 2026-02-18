import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for M5 smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  leadName: string;
  leadPhone: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
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
  state.email = `m5.e2e.${suffix}@example.test`;
  state.password = `M5E2E!${suffix}Aa1`;
  state.leadName = `M5E2E-Lead-${suffix}`;
  state.leadPhone = `119${suffix.slice(-8)}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, m5_e2e: true },
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M5 e2e user: ${userResp.error?.message || 'unknown'}`);
  }

  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M5 E2E Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create M5 e2e org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create M5 e2e membership: ${memberErr.message}`);
});

test.afterAll(async () => {
  if (state.leadName) {
    await admin.from('leads').delete().eq('nome', state.leadName);
  }
  if (state.orgId) {
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }
  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('M5 smoke: frontend injects org_id into lead created via UI', async ({ page }) => {
  await login(page, state.email, state.password);

  await page.getByRole('button', { name: 'Pipelines' }).click();
  await page.getByTestId('open-create-lead-modal').first().click();
  await page.locator('#nome').fill(state.leadName);
  await page.locator('#telefone').fill(state.leadPhone);
  await page.getByTestId('submit-create-lead').click();

  await expect
    .poll(async () => {
      const { data, error } = await admin
        .from('leads')
        .select('id, org_id, nome, user_id')
        .eq('nome', state.leadName)
        .eq('user_id', state.userId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return `ERROR:${error.message}`;
      return data?.org_id || null;
    }, { timeout: 30_000 })
    .toBe(state.orgId);
});
