import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for auto-schedule assignee smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerPassword: string;
  sellerCallUserId: string;
  sellerVisitUserId: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerUserId: '',
  ownerEmail: '',
  ownerPassword: '',
  sellerCallUserId: '',
  sellerVisitUserId: '',
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
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
}

async function openAiSettings(page: Page) {
  const settingsTrigger = page.getByTestId('nav-settings-trigger');
  const aiButton = page.getByTestId('nav-ia-agentes');
  const card = page.getByTestId('auto-schedule-controls-card');

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
      const opened = await card
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
  state.ownerEmail = `ia.auto.assign.owner.${suffix}@example.test`;
  state.ownerPassword = `IAAutoAssign!${suffix}Aa1`;

  const ownerResp = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
    user_metadata: { full_name: 'Owner IA E2E' },
  });
  if (ownerResp.error || !ownerResp.data.user?.id) {
    throw new Error(`Failed to create owner user: ${ownerResp.error?.message || 'unknown'}`);
  }
  state.ownerUserId = ownerResp.data.user.id;

  const sellerCallResp = await admin.auth.admin.createUser({
    email: `ia.auto.assign.call.${suffix}@example.test`,
    password: `IAAutoAssignCall!${suffix}Aa1`,
    email_confirm: true,
    user_metadata: { full_name: 'Vendedor Ligacao' },
  });
  if (sellerCallResp.error || !sellerCallResp.data.user?.id) {
    throw new Error(`Failed to create call seller user: ${sellerCallResp.error?.message || 'unknown'}`);
  }
  state.sellerCallUserId = sellerCallResp.data.user.id;

  const sellerVisitResp = await admin.auth.admin.createUser({
    email: `ia.auto.assign.visit.${suffix}@example.test`,
    password: `IAAutoAssignVisit!${suffix}Aa1`,
    email_confirm: true,
    user_metadata: { full_name: 'Vendedor Visita' },
  });
  if (sellerVisitResp.error || !sellerVisitResp.data.user?.id) {
    throw new Error(`Failed to create visit seller user: ${sellerVisitResp.error?.message || 'unknown'}`);
  }
  state.sellerVisitUserId = sellerVisitResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `IA Auto Assign Org ${suffix}`,
    owner_id: state.ownerUserId,
    plan: 'start',
    subscription_status: 'active',
    plan_limits: {},
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: membersErr } = await admin.from('organization_members').insert([
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgId,
      user_id: state.sellerCallUserId,
      role: 'user',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgId,
      user_id: state.sellerVisitUserId,
      role: 'user',
      can_view_team_leads: true,
    },
  ]);
  if (membersErr) throw new Error(`Failed to create members: ${membersErr.message}`);

  const { error: onboardingErr } = await admin.from('onboarding_progress').insert({
    user_id: state.ownerUserId,
    org_id: state.orgId,
    current_step: 'complete',
    completed_steps: ['profile', 'organization', 'install', 'explore'],
    skipped_steps: [],
    tour_completed_tabs: [],
    is_complete: true,
    guided_tour_status: 'dismissed',
    guided_tour_version: 'v2-global-01',
  });
  if (onboardingErr) throw new Error(`Failed to create onboarding state: ${onboardingErr.message}`);

  const { error: settingsErr } = await admin.from('ai_settings').insert({
    org_id: state.orgId,
    is_active: true,
    assistant_identity_name: 'IA Auto Assign',
    auto_schedule_call_enabled: true,
    auto_schedule_visit_enabled: true,
    auto_schedule_call_min_days: 0,
    auto_schedule_visit_min_days: 0,
  });
  if (settingsErr) throw new Error(`Failed to create ai settings: ${settingsErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('ai_settings').delete().eq('org_id', state.orgId);
    await admin.from('onboarding_progress').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.ownerUserId) await admin.auth.admin.deleteUser(state.ownerUserId);
  if (state.sellerCallUserId) await admin.auth.admin.deleteUser(state.sellerCallUserId);
  if (state.sellerVisitUserId) await admin.auth.admin.deleteUser(state.sellerVisitUserId);
});

test('Politica auto-agendamento persiste Atribuir para ligacao e visita', async ({ page }) => {
  await login(page, state.ownerEmail, state.ownerPassword);
  await openAiSettings(page);

  await page.getByTestId('auto-schedule-call-assign-trigger').click();
  await page.getByTestId(`auto-schedule-call-assign-option-${state.ownerUserId}`).click();

  await page.getByTestId('auto-schedule-visit-assign-trigger').click();
  await page.getByTestId(`auto-schedule-visit-assign-option-${state.ownerUserId}`).click();

  await page.getByTestId('auto-schedule-controls-save').click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('ai_settings')
          .select('auto_schedule_call_assign_to_user_id, auto_schedule_visit_assign_to_user_id')
          .eq('org_id', state.orgId)
          .limit(1)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        const callId = String(data?.auto_schedule_call_assign_to_user_id || '');
        const visitId = String(data?.auto_schedule_visit_assign_to_user_id || '');
        return `${callId}|${visitId}`;
      },
      { timeout: 30_000 },
    )
    .toBe(`${state.ownerUserId}|${state.ownerUserId}`);
});
