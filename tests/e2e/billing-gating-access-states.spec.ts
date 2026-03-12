import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for billing gating e2e: SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type TestState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  planLimitsByKey: Record<string, Record<string, unknown>>;
};

const state: TestState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  planLimitsByKey: {},
};

const plusDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

async function dismissGuidedTourInterference(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const skipButton = page.getByRole('button', { name: /Pular tour/i });
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click({ force: true });
      continue;
    }

    const endButton = page.getByRole('button', { name: /Encerrar/i });
    if (await endButton.isVisible().catch(() => false)) {
      await endButton.click({ force: true });
      continue;
    }

    break;
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
  await dismissGuidedTourInterference(page);
}

async function setBillingState(input: {
  plan?: string;
  subscriptionStatus: 'pending_checkout' | 'trialing' | 'active' | 'past_due' | 'unpaid';
  trialEndsAt?: string | null;
  graceEndsAt?: string | null;
}) {
  const payload: Record<string, unknown> = {
    subscription_status: input.subscriptionStatus,
    trial_ends_at: input.trialEndsAt ?? null,
    grace_ends_at: input.graceEndsAt ?? null,
    updated_at: new Date().toISOString(),
  };

  if (input.plan) {
    payload.plan = input.plan;
    payload.plan_limits = state.planLimitsByKey[input.plan] || {};
  }

  const { error } = await admin
    .from('organizations')
    .update(payload)
    .eq('id', state.orgId);

  if (error) {
    throw new Error(`Failed to update billing state: ${error.message}`);
  }
}

test.describe('billing gating access states', () => {
  test.beforeAll(async () => {
    const suffix = Date.now();
    state.email = `billing.gating.${suffix}@example.test`;
    state.password = `BillingGating!${suffix}Aa1`;

    const { data: planRows, error: planErr } = await admin
      .from('_admin_subscription_plans')
      .select('plan_key, limits')
      .in('plan_key', ['start', 'pro', 'scale', 'unlimited']);

    if (planErr) {
      throw new Error(`Failed to fetch plan catalog: ${planErr.message}`);
    }

    for (const row of planRows || []) {
      const key = String(row.plan_key || '').trim();
      if (!key) continue;
      const limits = typeof row.limits === 'object' && row.limits && !Array.isArray(row.limits)
        ? row.limits as Record<string, unknown>
        : {};
      state.planLimitsByKey[key] = limits;
    }

    const userResp = await admin.auth.admin.createUser({
      email: state.email,
      password: state.password,
      email_confirm: true,
      user_metadata: { billing_gating_e2e: true, org_id: state.orgId },
    });

    if (userResp.error || !userResp.data.user?.id) {
      throw new Error(`Failed to create billing gating user: ${userResp.error?.message || 'unknown'}`);
    }

    state.userId = userResp.data.user.id;

    const { error: orgErr } = await admin.from('organizations').insert({
      id: state.orgId,
      name: `Billing Gating Org ${suffix}`,
      plan: 'start',
      plan_limits: state.planLimitsByKey.start || {},
      subscription_status: 'pending_checkout',
    });
    if (orgErr) {
      throw new Error(`Failed to create billing gating org: ${orgErr.message}`);
    }

    const { error: memberErr } = await admin.from('organization_members').insert({
      org_id: state.orgId,
      user_id: state.userId,
      role: 'owner',
      can_view_team_leads: true,
    });
    if (memberErr) {
      throw new Error(`Failed to create billing gating membership: ${memberErr.message}`);
    }

    // Pre-seed completed onboarding so tests land on the main app instead of /onboarding
    const { error: onboardingErr } = await admin.from('onboarding_progress').insert({
      user_id: state.userId,
      org_id: state.orgId,
      current_step: 'complete',
      completed_steps: ['profile', 'organization', 'install', 'explore'],
      skipped_steps: [],
      tour_completed_tabs: ['conversas', 'pipelines', 'calendario', 'disparos'],
      is_complete: true,
    });
    if (onboardingErr) {
      throw new Error(`Failed to seed onboarding progress: ${onboardingErr.message}`);
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

  test('pending_checkout forces setup wizard', async ({ page }) => {
    await setBillingState({
      plan: 'start',
      subscriptionStatus: 'pending_checkout',
      trialEndsAt: null,
      graceEndsAt: null,
    });

    await login(page, state.email, state.password);
    // Do NOT call page.goto('/') here: we are already at '/' after login.
    // A second full-page reload triggers a React 18 Suspense concurrent commit that
    // leaves the BillingSetupWizard h3 with visibility:hidden transiently.

    await expect(page.getByText('Finalizar assinatura')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Continuar para checkout/i })).toBeVisible();
  });

  test('trialing and active allow full app access', async ({ page }) => {
    await setBillingState({
      plan: 'start',
      subscriptionStatus: 'trialing',
      trialEndsAt: plusDays(5),
      graceEndsAt: null,
    });

    await login(page, state.email, state.password);
    await page.goto('/');

    await expect(page.getByTitle('Pipelines')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Finalizar assinatura')).toHaveCount(0);
    await expect(page.getByText(/Assinatura necess/i)).toHaveCount(0);

    await setBillingState({
      plan: 'start',
      subscriptionStatus: 'active',
      trialEndsAt: null,
      graceEndsAt: null,
    });

    await page.reload();
    await expect(page.getByTitle('Pipelines')).toBeVisible();
    await expect(page.getByText(/modo leitura/i)).toHaveCount(0);
  });

  test('past_due in grace period keeps read_only mode and blocks only on usage', async ({ page }) => {
    await setBillingState({
      plan: 'start',
      subscriptionStatus: 'past_due',
      trialEndsAt: null,
      graceEndsAt: plusDays(2),
    });

    await login(page, state.email, state.password);
    await page.goto('/');

    await expect(page.getByTitle('Pipelines')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/modo leitura/i)).toBeVisible();
    await page.getByTestId('nav-tab-disparos').click();
    await dismissGuidedTourInterference(page);
    await expect(page.getByTestId('billing-blocker-dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /Nova Campanha/i }).dispatchEvent('click');
    await expect(page.getByTestId('billing-blocker-dialog')).toBeVisible();
    await page.getByTestId('billing-blocker-close-secondary').dispatchEvent('click');
    await expect(page.getByTestId('billing-blocker-dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test('unpaid shows hard block subscription screen', async ({ page }) => {
    await setBillingState({
      plan: 'start',
      subscriptionStatus: 'unpaid',
      trialEndsAt: null,
      graceEndsAt: null,
    });

    await login(page, state.email, state.password);
    await page.goto('/');

    await expect(page.getByText(/Pagamento pendente/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Atualizar pagamento/i })).toBeVisible();
    await expect(page.getByTestId('billing-blocker-dialog')).toHaveCount(0);
  });

  test('settings tracking tab renders soft wall and opens blocker on upgrade action', async ({ page }) => {
    await setBillingState({
      plan: 'start',
      subscriptionStatus: 'active',
      trialEndsAt: null,
      graceEndsAt: null,
    });

    await login(page, state.email, state.password);
    await page.goto('/');
    await dismissGuidedTourInterference(page);

    await page.getByTestId('nav-settings-trigger').click();
    await page.getByTestId('nav-tracking').click();
    await expect(page.getByTestId('billing-blocker-dialog')).toHaveCount(0);
    await expect(page.getByText(/Recurso bloqueado no plano atual/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Fazer upgrade/i })).toBeVisible();
    await page.getByRole('button', { name: /Fazer upgrade/i }).click();
    await expect(page.getByTestId('billing-blocker-dialog')).toBeVisible();
    await expect(page.getByTestId('billing-blocker-primary')).toContainText(/upgrade/i);
    await expect(page).toHaveURL(/\/$/);
  });

  test('unlimited plan bypasses billing blocker on governed actions', async ({ page }) => {
    await setBillingState({
      plan: 'unlimited',
      subscriptionStatus: 'unpaid',
      trialEndsAt: null,
      graceEndsAt: null,
    });

    await login(page, state.email, state.password);
    await page.goto('/');

    await page.getByTestId('nav-tab-disparos').click();
    await dismissGuidedTourInterference(page);
    await page.getByRole('button', { name: /Nova Campanha/i }).dispatchEvent('click');
    await expect(page.getByTestId('billing-blocker-dialog')).toHaveCount(0);
  });

  test('upgrade and downgrade labels follow current plan rank', async ({ page }) => {
    await setBillingState({
      plan: 'start',
      subscriptionStatus: 'active',
      trialEndsAt: null,
      graceEndsAt: null,
    });

    await login(page, state.email, state.password);
    await page.goto('/pricing');
    await expect(page.getByText(/Plano atual:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Fazer upgrade/i }).first()).toBeVisible();

    await setBillingState({
      plan: 'scale',
      subscriptionStatus: 'active',
      trialEndsAt: null,
      graceEndsAt: null,
    });

    await page.reload();
    await expect(page.getByText(/Plano atual:/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Fazer downgrade/i }).first()).toBeVisible();
  });
});
