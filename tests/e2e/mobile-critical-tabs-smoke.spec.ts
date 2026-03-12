import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for mobile smoke e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const state = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  planLimits: {} as Record<string, unknown>,
};

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

test.use({ viewport: { width: 390, height: 844 } });

test.describe('mobile critical tabs smoke', () => {
  test.beforeAll(async () => {
    const suffix = Date.now();
    state.email = `mobile.tabs.${suffix}@example.test`;
    state.password = `MobileTabs!${suffix}Aa1`;

    const { data: startPlan } = await admin
      .from('_admin_subscription_plans')
      .select('limits')
      .eq('plan_key', 'start')
      .maybeSingle();

    state.planLimits = typeof startPlan?.limits === 'object' && startPlan?.limits && !Array.isArray(startPlan.limits)
      ? startPlan.limits as Record<string, unknown>
      : {};

    const userResp = await admin.auth.admin.createUser({
      email: state.email,
      password: state.password,
      email_confirm: true,
      user_metadata: { mobile_tabs_e2e: true, org_id: state.orgId },
    });

    if (userResp.error || !userResp.data.user?.id) {
      throw new Error(`Failed to create mobile smoke user: ${userResp.error?.message || 'unknown'}`);
    }

    state.userId = userResp.data.user.id;

    const { error: orgErr } = await admin.from('organizations').insert({
      id: state.orgId,
      name: `Mobile Tabs Org ${suffix}`,
      plan: 'start',
      plan_limits: state.planLimits,
      subscription_status: 'active',
      trial_ends_at: null,
      grace_ends_at: null,
    });
    if (orgErr) throw new Error(`Failed to create mobile smoke org: ${orgErr.message}`);

    const { error: memberErr } = await admin.from('organization_members').insert({
      org_id: state.orgId,
      user_id: state.userId,
      role: 'owner',
      can_view_team_leads: true,
    });
    if (memberErr) throw new Error(`Failed to create mobile smoke membership: ${memberErr.message}`);

    // Pre-seed completed onboarding so the test lands on the main app instead of /onboarding
    const { error: onboardingErr } = await admin.from('onboarding_progress').insert({
      user_id: state.userId,
      org_id: state.orgId,
      current_step: 'complete',
      completed_steps: ['profile', 'organization', 'install', 'explore'],
      skipped_steps: [],
      tour_completed_tabs: ['conversas', 'pipelines', 'calendario', 'disparos'],
      is_complete: true,
    });
    if (onboardingErr) throw new Error(`Failed to seed onboarding progress: ${onboardingErr.message}`);
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

  test('loads critical tabs in mobile viewport without blank screens', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(state.email);
    await page.locator('#password').fill(state.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/', { timeout: 30_000 });
    await dismissGuidedTourInterference(page);

    await expect(page.getByText('SolarZap')).toBeVisible();

    await dismissGuidedTourInterference(page);
    await page.getByTestId('nav-tab-pipelines').click();
    await dismissGuidedTourInterference(page);
    await expect(page.getByText('Pipeline de Vendas')).toBeVisible();

    await dismissGuidedTourInterference(page);
    await page.getByTestId('nav-tab-calendario').click();
    await dismissGuidedTourInterference(page);
    await expect(page.getByText(/Novo Agendamento/i)).toBeVisible();

    await dismissGuidedTourInterference(page);
    await page.getByTestId('nav-tab-contatos').click();
    await dismissGuidedTourInterference(page);
    await expect(page.getByText('Contatos')).toBeVisible();

    await dismissGuidedTourInterference(page);
    await page.getByTestId('nav-tab-disparos').click();
    await dismissGuidedTourInterference(page);
    await expect(page.getByText('Disparos em Massa')).toBeVisible();

    await dismissGuidedTourInterference(page);
    await page.getByTestId('nav-tab-propostas').click();
    await dismissGuidedTourInterference(page);
    await expect(page.getByText('Propostas')).toBeVisible();
  });
});
