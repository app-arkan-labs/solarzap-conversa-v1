import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for guided tour e2e: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const state = {
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

test.describe('guided tour run-once and manual replay', () => {
  test.beforeAll(async () => {
    const suffix = Date.now();
    state.email = `guided.tour.${suffix}@example.test`;
    state.password = `GuidedTour!${suffix}Aa1`;

    const userResp = await admin.auth.admin.createUser({
      email: state.email,
      password: state.password,
      email_confirm: true,
      user_metadata: { guided_tour_e2e: true, org_id: state.orgId },
    });

    if (userResp.error || !userResp.data.user?.id) {
      throw new Error(`Failed to create guided tour user: ${userResp.error?.message || 'unknown'}`);
    }

    state.userId = userResp.data.user.id;

    const { error: orgErr } = await admin.from('organizations').insert({
      id: state.orgId,
      name: `Guided Tour Org ${suffix}`,
      plan: 'start',
      subscription_status: 'active',
      plan_limits: {},
    });
    if (orgErr) {
      throw new Error(`Failed to create guided tour org: ${orgErr.message}`);
    }

    const { error: memberErr } = await admin.from('organization_members').insert({
      org_id: state.orgId,
      user_id: state.userId,
      role: 'owner',
      can_view_team_leads: true,
    });
    if (memberErr) {
      throw new Error(`Failed to create guided tour membership: ${memberErr.message}`);
    }

    const { error: onboardingErr } = await admin.from('onboarding_progress').insert({
      user_id: state.userId,
      org_id: state.orgId,
      current_step: 'complete',
      completed_steps: ['profile', 'organization', 'install', 'explore'],
      skipped_steps: [],
      tour_completed_tabs: [],
      is_complete: true,
      guided_tour_status: 'never_seen',
      guided_tour_version: null,
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

  test('autoplay appears once and can be replayed manually', async ({ page }) => {
    await login(page, state.email, state.password);

    await expect(page.getByRole('button', { name: /Iniciar tour/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Pular tour/i }).click();

    await page.reload();
    await expect(page.getByRole('button', { name: /Iniciar tour/i })).toHaveCount(0);

    await page.getByTestId('nav-help-tour').click();
    const endButton = page.getByRole('button', { name: /Encerrar/i });
    await expect(endButton).toBeVisible({ timeout: 15_000 });
    await endButton.click();
    await expect(endButton).toHaveCount(0);
  });
});
