import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for P0 instance activate-all smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  instanceAName: string;
  instanceBName: string;
  leadLegacyAId: number;
  leadMappedByBInteractionId: number;
  leadDirectBId: number;
  phoneLegacyA: string;
  phoneMappedByB: string;
  phoneDirectB: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  instanceAName: '',
  instanceBName: '',
  leadLegacyAId: 0,
  leadMappedByBInteractionId: 0,
  leadDirectBId: 0,
  phoneLegacyA: '',
  phoneMappedByB: '',
  phoneDirectB: '',
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
  const aiRows = page.locator('[data-testid^="ai-stage-row-"]');

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
      const opened = await aiRows
        .first()
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
  state.email = `p0.instance.activate.${suffix}@example.test`;
  state.password = `P0InstAct!${suffix}Aa1`;
  state.instanceAName = `p0-act-a-${suffix}`;
  state.instanceBName = `p0-act-b-${suffix}`;
  state.phoneLegacyA = `55${suffix.slice(-9)}11`;
  state.phoneMappedByB = `55${suffix.slice(-9)}12`;
  state.phoneDirectB = `55${suffix.slice(-9)}13`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });
  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create P0 activate-all user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `P0 Activate AI Org ${suffix}`,
    owner_id: state.userId,
    plan: 'start',
    subscription_status: 'active',
    plan_limits: {},
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: membersErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (membersErr) throw new Error(`Failed to create membership: ${membersErr.message}`);

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

  const { error: settingsErr } = await admin.from('ai_settings').upsert(
    {
      org_id: state.orgId,
      is_active: true,
      assistant_identity_name: 'P0 Activate AI',
    },
    { onConflict: 'org_id' },
  );
  if (settingsErr) throw new Error(`Failed to create ai settings: ${settingsErr.message}`);

  const { error: instancesErr } = await admin.from('whatsapp_instances').insert([
    {
      org_id: state.orgId,
      user_id: state.userId,
      instance_name: state.instanceAName,
      display_name: `P0 A ${suffix.slice(-4)}`,
      status: 'connected',
      is_active: true,
      ai_enabled: false,
    },
    {
      org_id: state.orgId,
      user_id: state.userId,
      instance_name: state.instanceBName,
      display_name: `P0 B ${suffix.slice(-4)}`,
      status: 'connected',
      is_active: true,
      ai_enabled: false,
    },
  ]);
  if (instancesErr) throw new Error(`Failed to create instances: ${instancesErr.message}`);

  const { data: leadsRows, error: leadsErr } = await admin
    .from('leads')
    .insert([
      {
        org_id: state.orgId,
        user_id: state.userId,
        assigned_to_user_id: state.userId,
        nome: `P0 Legacy A ${suffix}`,
        telefone: state.phoneLegacyA,
        phone_e164: state.phoneLegacyA,
        status_pipeline: 'novo_lead',
        canal: 'whatsapp',
        instance_name: state.instanceAName,
        ai_enabled: false,
        ai_paused_reason: 'manual',
      },
      {
        org_id: state.orgId,
        user_id: state.userId,
        assigned_to_user_id: state.userId,
        nome: `P0 Mapped by B ${suffix}`,
        telefone: state.phoneMappedByB,
        phone_e164: state.phoneMappedByB,
        status_pipeline: 'novo_lead',
        canal: 'whatsapp',
        instance_name: state.instanceAName,
        ai_enabled: false,
        ai_paused_reason: 'manual',
      },
      {
        org_id: state.orgId,
        user_id: state.userId,
        assigned_to_user_id: state.userId,
        nome: `P0 Direct B ${suffix}`,
        telefone: state.phoneDirectB,
        phone_e164: state.phoneDirectB,
        status_pipeline: 'novo_lead',
        canal: 'whatsapp',
        instance_name: state.instanceBName,
        ai_enabled: false,
        ai_paused_reason: 'manual',
      },
    ])
    .select('id, phone_e164, nome');
  if (leadsErr || !leadsRows || leadsRows.length < 3) {
    throw new Error(`Failed to create leads: ${leadsErr?.message || 'missing rows'}`);
  }

  const leadByPhone = new Map((leadsRows || []).map((row) => [String(row.phone_e164 || ''), Number(row.id)]));
  state.leadLegacyAId = leadByPhone.get(state.phoneLegacyA) || 0;
  state.leadMappedByBInteractionId = leadByPhone.get(state.phoneMappedByB) || 0;
  state.leadDirectBId = leadByPhone.get(state.phoneDirectB) || 0;

  if (!state.leadLegacyAId || !state.leadMappedByBInteractionId || !state.leadDirectBId) {
    throw new Error('Failed to map created lead IDs');
  }

  const { error: interactionErr } = await admin.from('interacoes').insert({
    org_id: state.orgId,
    user_id: state.userId,
    lead_id: state.leadMappedByBInteractionId,
    mensagem: `P0 activation mapping anchor ${suffix}`,
    tipo: 'mensagem_cliente',
    instance_name: state.instanceBName,
    phone_e164: state.phoneMappedByB,
  });
  if (interactionErr) {
    throw new Error(`Failed to create mapping interaction: ${interactionErr.message}`);
  }
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('interacoes').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
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

test('P0 bulk activation: instance uses canonical + interaction mapping', async ({ page }) => {
  await page.route('**/functions/v1/evolution-proxy**', async (route) => {
    await route.abort();
  });
  await page.route('**/functions/v1/evolution-api**', async (route) => {
    await route.abort();
  });
  await page.route('**/functions/v1/whatsapp-connect**', async (route) => {
    await route.abort();
  });

  await login(page, state.email, state.password);
  await openAiSettings(page);

  await admin
    .from('whatsapp_instances')
    .update({ status: 'connected' })
    .eq('org_id', state.orgId)
    .in('instance_name', [state.instanceAName, state.instanceBName]);

  const activateButton = page.getByTestId(`instance-ai-activate-all-${state.instanceBName}`);
  await expect(activateButton).toBeVisible({ timeout: 30_000 });
  await activateButton.click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('whatsapp_instances')
          .select('ai_enabled')
          .eq('org_id', state.orgId)
          .eq('instance_name', state.instanceBName)
          .limit(1)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        if (!data) return null;
        return data.ai_enabled;
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('leads')
          .select('id, ai_enabled')
          .eq('org_id', state.orgId)
          .in('id', [state.leadMappedByBInteractionId, state.leadDirectBId]);
        if (error) return `ERROR:${error.message}`;
        return (data || []).every((row) => row.ai_enabled === true);
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('leads')
          .select('ai_enabled')
          .eq('org_id', state.orgId)
          .eq('id', state.leadLegacyAId)
          .limit(1)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        if (!data) return null;
        return data.ai_enabled;
      },
      { timeout: 30_000 },
    )
    .toBe(false);
});
