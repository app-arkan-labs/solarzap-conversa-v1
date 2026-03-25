import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for IA instance profile smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  instanceName: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  instanceName: '',
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
  state.email = `ia.instance.profile.${suffix}@example.test`;
  state.password = `IAInstProf!${suffix}Aa1`;
  state.instanceName = `ia-inst-${suffix}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });
  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create IA instance profile user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `IA Instance Profile Org ${suffix}`,
    owner_id: state.userId,
    plan: 'start',
    subscription_status: 'active',
    plan_limits: {},
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create membership: ${memberErr.message}`);

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
  if (onboardingErr) throw new Error(`Failed to create onboarding state: ${onboardingErr.message}`);

  const { error: settingsErr } = await admin.from('ai_settings').insert({
    org_id: state.orgId,
    is_active: true,
    assistant_identity_name: 'Consultor Solar Global',
  });
  if (settingsErr) throw new Error(`Failed to create ai settings: ${settingsErr.message}`);

  const { error: instanceErr } = await admin.from('whatsapp_instances').insert({
    org_id: state.orgId,
    user_id: state.userId,
    instance_name: state.instanceName,
    display_name: 'Instancia Vendas',
    status: 'connected',
    is_active: true,
    ai_enabled: true,
  });
  if (instanceErr) throw new Error(`Failed to create whatsapp instance: ${instanceErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('whatsapp_instances').delete().eq('org_id', state.orgId);
    await admin.from('ai_settings').delete().eq('org_id', state.orgId);
    await admin.from('onboarding_progress').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('IA por instância: salva nome e prompt personalizados sem sobrescrever global', async ({ page }) => {
  await page.route('**/functions/v1/evolution-proxy**', async (route) => {
    await route.abort();
  });
  await page.route('**/functions/v1/evolution-api**', async (route) => {
    await route.abort();
  });
  await page.route('**/functions/v1/whatsapp-connect**', async (route) => {
    await route.abort();
  });

  const assistantName = 'Joao Vendas';
  const assistantPrompt = 'Voce e Joao da equipe de vendas. Se identificar pos-venda, atribua o contato para Maria da pos-vendas.';

  await login(page, state.email, state.password);
  await openAiSettings(page);

  await page.getByTestId(`ai-instance-row-${state.instanceName}`).waitFor({ state: 'visible', timeout: 30_000 });

  const nameInput = page.getByTestId(`ai-instance-assistant-name-input-${state.instanceName}`);
  await nameInput.fill(assistantName);
  await page.getByTestId(`ai-instance-assistant-name-save-${state.instanceName}`).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('whatsapp_instances')
          .select('assistant_identity_name')
          .eq('org_id', state.orgId)
          .eq('instance_name', state.instanceName)
          .limit(1)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        return String(data?.assistant_identity_name || '');
      },
      { timeout: 30_000 },
    )
    .toBe(assistantName);

  await page.getByTestId(`ai-instance-personalize-${state.instanceName}`).click();
  const promptInput = page.getByTestId('ai-instance-prompt-editor-textarea');
  await promptInput.fill(assistantPrompt);
  await page.getByTestId('ai-instance-prompt-editor-save').click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('whatsapp_instances')
          .select('assistant_prompt_override, assistant_prompt_override_version')
          .eq('org_id', state.orgId)
          .eq('instance_name', state.instanceName)
          .limit(1)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        const prompt = String(data?.assistant_prompt_override || '');
        const version = Number(data?.assistant_prompt_override_version || 0);
        return `${prompt}|${version}`;
      },
      { timeout: 30_000 },
    )
    .toBe(`${assistantPrompt}|1`);

  const { data: globalSettings, error: globalErr } = await admin
    .from('ai_settings')
    .select('assistant_identity_name')
    .eq('org_id', state.orgId)
    .limit(1)
    .maybeSingle();
  if (globalErr) throw new Error(`Failed to verify global assistant fallback: ${globalErr.message}`);
  expect(String(globalSettings?.assistant_identity_name || '')).toBe('Consultor Solar Global');

  await page.reload();
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
  await openAiSettings(page);

  await expect(page.getByTestId(`ai-instance-assistant-name-input-${state.instanceName}`)).toHaveValue(assistantName);
  await page.getByTestId(`ai-instance-personalize-${state.instanceName}`).click();
  await expect(page.getByTestId('ai-instance-prompt-editor-textarea')).toHaveValue(assistantPrompt);
});
