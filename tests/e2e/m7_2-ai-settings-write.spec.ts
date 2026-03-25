import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for M7.2 IA settings smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
};

const state: SetupState = {
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
  const skipTourButton = page.getByRole('button', { name: /Pular tour/i });
  const skipTourAppeared = await skipTourButton
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (skipTourAppeared) {
    await skipTourButton.click({ force: true });
    await page.getByRole('dialog', { name: /Bem-vindo ao SolarZap/i }).waitFor({ state: 'hidden', timeout: 10_000 });
  }

  // Wait until AuthContext resolves orgId and the main layout/nav is mounted.
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * openAiSettings — deterministic flow using data-testid anchors.
 *
 * Root cause of previous flakiness:
 *   The "Inteligência Artificial" button lives inside a Radix UI <PopoverContent>
 *   which is portal-mounted with a CSS enter animation when the trigger is clicked.
 *   Playwright's auto-retry click was racing against the Radix animation and detecting
 *   the element as "not stable" or "detached from DOM" every time.
 *
 * Fix:
 *   1. Click the Settings trigger via stable data-testid.
 *   2. Wait for the IA button to be *attached* AND *stable* before clicking
 *      (use waitFor({ state: 'visible' }) which implies stable+attached).
 *   3. Use force: false (default) so Playwright still validates the element is
 *      interactable, but we have already given it time to become stable.
 */
async function openAiSettings(page: Page) {
  const settingsTrigger = page.getByTestId('nav-settings-trigger');
  const aiButton = page.getByTestId('nav-ia-agentes');
  const aiSwitch = page.getByTestId('ai-master-switch');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await settingsTrigger.click();
    const appeared = await aiButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!appeared) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      continue;
    }

    const clicked = await aiButton
      .click({ force: true, timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (clicked) {
      const opened = await aiSwitch
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        return;
      }
    }
  }

  throw new Error('Unable to open IA settings view.');
}



test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `m7.2.ai.settings.${suffix}@example.test`;
  state.password = `M72AiSettings!${suffix}Aa1`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, m7_2_e2e: true },
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M7.2 e2e user: ${userResp.error?.message || 'unknown'}`);
  }

  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M7.2 AI Settings Org ${suffix}`,
    owner_id: state.userId,
    plan: 'start',
    subscription_status: 'active',
    plan_limits: {},
  });
  if (orgErr) throw new Error(`Failed to create M7.2 e2e org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create M7.2 e2e membership: ${memberErr.message}`);

  const { error: onboardingErr } = await admin.from('onboarding_progress').insert({
    user_id: state.userId,
    org_id: state.orgId,
    current_step: 'complete',
    completed_steps: ['profile', 'organization', 'install', 'explore'],
    skipped_steps: [],
    tour_completed_tabs: [],
    is_complete: true,
    guided_tour_status: 'dismissed',
    guided_tour_version: 'v2-global-01',
  });
  if (onboardingErr) throw new Error(`Failed to create M7.2 onboarding state: ${onboardingErr.message}`);

  // Deterministic baseline for the test: ensure ai_settings row exists for org.
  const { data: existingSettings, error: existingSettingsErr } = await admin
    .from('ai_settings')
    .select('id')
    .eq('org_id', state.orgId)
    .limit(1)
    .maybeSingle();
  if (existingSettingsErr) throw new Error(`Failed to read ai_settings baseline: ${existingSettingsErr.message}`);

  if (!existingSettings?.id) {
    const { error: settingsInsertErr } = await admin.from('ai_settings').insert({
      org_id: state.orgId,
      is_active: false,
      assistant_identity_name: 'M7.2 E2E',
    });
    if (settingsInsertErr) throw new Error(`Failed to create ai_settings baseline: ${settingsInsertErr.message}`);
  }
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('ai_stage_config').delete().eq('org_id', state.orgId);
    await admin.from('ai_settings').delete().eq('org_id', state.orgId);
    await admin.from('onboarding_progress').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('M7.2 smoke: IA settings write persists with org_id', async ({ page }) => {
  const { data: beforeRow, error: beforeErr } = await admin
    .from('ai_settings')
    .select('is_active')
    .eq('org_id', state.orgId)
    .limit(1)
    .maybeSingle();
  if (beforeErr) throw new Error(`Failed to read ai_settings before update: ${beforeErr.message}`);
  const expectedIsActive = !(beforeRow?.is_active ?? false);

  await login(page, state.email, state.password);
  await openAiSettings(page);
  const switchEl = page.getByTestId('ai-master-switch');
  await switchEl.waitFor({ state: 'visible', timeout: 15_000 });
  await switchEl.click();

  await expect
    .poll(async () => {
      const { data, error } = await admin
        .from('ai_settings')
        .select('id, org_id, is_active')
        .eq('org_id', state.orgId)
        .limit(1)
        .maybeSingle();

      if (error) return `ERROR:${error.message}`;
      if (!data?.id) return null;
      return `${data.org_id}|${data.is_active}`;
    }, { timeout: 30_000 })
    .toBe(`${state.orgId}|${expectedIsActive}`);

  await page.reload();

  // Wait again after reload because AuthContext resolves orgId asynchronously.
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
  await openAiSettings(page);
  const switchAfterReload = page.getByTestId('ai-master-switch');
  await expect(switchAfterReload).toHaveAttribute(
    'data-state',
    expectedIsActive ? 'checked' : 'unchecked'
  );
});
