import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for M2 smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);

test('M2 smoke: login and open IA agents view', async ({ page }) => {
  const suffix = `${Date.now()}`;
  const email = `e2e.m2.ia.${suffix}.${rand(6)}@example.com`;
  const password = `M2_Smoke_${suffix}_${rand(10)}`;
  const orgId = randomUUID();
  let userId: string | null = null;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { e2e: true, gate: 'm2_ia_smoke', org_id: orgId },
    });

    if (createErr || !created?.user?.id) {
      throw new Error(`Failed to create user for M2 smoke: ${createErr?.message || 'unknown'}`);
    }
    userId = created.user.id;

    const { error: orgErr } = await admin.from('organizations').insert({
      id: orgId,
      name: `M2 IA Org ${suffix}`,
      owner_id: userId,
      plan: 'start',
      subscription_status: 'active',
      plan_limits: {},
    });
    if (orgErr) {
      throw new Error(`Failed to create org for M2 smoke: ${orgErr.message}`);
    }

    const { error: memberErr } = await admin.from('organization_members').insert({
      org_id: orgId,
      user_id: userId,
      role: 'owner',
      can_view_team_leads: true,
    });
    if (memberErr) {
      throw new Error(`Failed to create membership for M2 smoke: ${memberErr.message}`);
    }

    const { error: onboardingErr } = await admin.from('onboarding_progress').insert({
      user_id: userId,
      org_id: orgId,
      current_step: 'complete',
      completed_steps: ['profile', 'organization', 'install', 'explore'],
      skipped_steps: [],
      tour_completed_tabs: [],
      is_complete: true,
      guided_tour_status: 'dismissed',
      guided_tour_version: 'v2-global-01',
    });
    if (onboardingErr) {
      throw new Error(`Failed to create onboarding state for M2 smoke: ${onboardingErr.message}`);
    }

    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await page.waitForURL('**/', { timeout: 30_000 });
    const skipTourButton = page.getByRole('button', { name: /Pular tour/i });
    const skipTourAppeared = await skipTourButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (skipTourAppeared) {
      await skipTourButton.click({ force: true });
      await page.getByRole('dialog', { name: /Bem-vindo ao SolarZap/i }).waitFor({ state: 'hidden', timeout: 10_000 });
    }
    await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByTestId('nav-settings-trigger').click();
    await page.getByTestId('nav-ia-agentes').click();

    await expect(page.getByRole('heading', { name: /Intelig/i })).toBeVisible({ timeout: 30_000 });
  } finally {
    if (userId) {
      await admin.from('onboarding_progress').delete().eq('user_id', userId).eq('org_id', orgId);
    }
    await admin.from('organization_members').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
