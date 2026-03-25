import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for P0 conversation instance switch smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerPassword: string;
  leadId: number;
  leadName: string;
  leadPhoneE164: string;
  instanceAName: string;
  instanceADisplay: string;
  instanceBName: string;
  instanceBDisplay: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerUserId: '',
  ownerEmail: '',
  ownerPassword: '',
  leadId: 0,
  leadName: '',
  leadPhoneE164: '',
  instanceAName: '',
  instanceADisplay: '',
  instanceBName: '',
  instanceBDisplay: '',
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

async function ensureConversationsView(page: Page) {
  const searchInput = page.getByPlaceholder(/Pesquisar/i);
  const visibleOnCurrentTab = await searchInput
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (visibleOnCurrentTab) return;

  await page.getByTestId('nav-tab-conversas').click({ force: true });
  await searchInput.waitFor({ state: 'visible', timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.ownerEmail = `p0.instance.switch.${suffix}@example.test`;
  state.ownerPassword = `P0Instance!${suffix}Aa1`;
  state.leadName = `P0 Instance Lead ${suffix}`;
  state.leadPhoneE164 = `55${suffix.slice(-11)}`;
  state.instanceAName = `p0-inst-a-${suffix}`;
  state.instanceBName = `p0-inst-b-${suffix}`;
  state.instanceADisplay = `P0 Inst A ${suffix.slice(-4)}`;
  state.instanceBDisplay = `P0 Inst B ${suffix.slice(-4)}`;

  const ownerResp = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, p0_conversation_instance_switch: true },
  });
  if (ownerResp.error || !ownerResp.data.user?.id) {
    throw new Error(`Failed to create P0 instance switch owner user: ${ownerResp.error?.message || 'unknown'}`);
  }
  state.ownerUserId = ownerResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `P0 Instance Switch Org ${suffix}`,
    owner_id: state.ownerUserId,
    plan: 'start',
    subscription_status: 'active',
    plan_limits: {},
  });
  if (orgErr) throw new Error(`Failed to create P0 org: ${orgErr.message}`);

  const { error: membersErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.ownerUserId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (membersErr) throw new Error(`Failed to create P0 membership: ${membersErr.message}`);

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

  const { error: instanceErr } = await admin.from('whatsapp_instances').insert([
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      instance_name: state.instanceAName,
      display_name: state.instanceADisplay,
      status: 'connected',
      is_active: true,
    },
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      instance_name: state.instanceBName,
      display_name: state.instanceBDisplay,
      status: 'connected',
      is_active: true,
    },
  ]);
  if (instanceErr) throw new Error(`Failed to create P0 instances: ${instanceErr.message}`);

  const { data: leadRow, error: leadErr } = await admin
    .from('leads')
    .insert({
      org_id: state.orgId,
      user_id: state.ownerUserId,
      assigned_to_user_id: state.ownerUserId,
      nome: state.leadName,
      telefone: state.leadPhoneE164,
      phone_e164: state.leadPhoneE164,
      status_pipeline: 'novo_lead',
      canal: 'whatsapp',
      instance_name: state.instanceAName,
    })
    .select('id')
    .single();
  if (leadErr || !leadRow?.id) {
    throw new Error(`Failed to create P0 lead: ${leadErr?.message || 'missing lead id'}`);
  }
  state.leadId = Number(leadRow.id);

  const { error: interactionErr } = await admin.from('interacoes').insert({
    org_id: state.orgId,
    lead_id: state.leadId,
    user_id: state.ownerUserId,
    tipo: 'mensagem_cliente',
    mensagem: `P0 instance anchor ${suffix}`,
    instance_name: state.instanceAName,
    phone_e164: state.leadPhoneE164,
  });
  if (interactionErr) {
    throw new Error(`Failed to seed P0 interaction: ${interactionErr.message}`);
  }
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('interacoes').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('whatsapp_instances').delete().eq('org_id', state.orgId);
    await admin.from('onboarding_progress').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.ownerUserId) {
    await admin.auth.admin.deleteUser(state.ownerUserId);
  }
});

test('P0 conversation instance switch smoke: manual selection does not revert', async ({ page }) => {
  await page.route('**/functions/v1/evolution-proxy**', async (route) => {
    await route.abort();
  });
  await page.route('**/functions/v1/evolution-api**', async (route) => {
    await route.abort();
  });
  await page.route('**/functions/v1/whatsapp-connect**', async (route) => {
    await route.abort();
  });

  await login(page, state.ownerEmail, state.ownerPassword);
  await ensureConversationsView(page);

  await page.getByPlaceholder(/Pesquisar/i).fill(state.leadName);
  const row = page.locator('[data-testid="conversation-row"]').filter({ hasText: state.leadName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByText(state.leadName).first().click();

  await admin
    .from('whatsapp_instances')
    .update({ status: 'connected' })
    .eq('org_id', state.orgId)
    .in('instance_name', [state.instanceAName, state.instanceBName]);

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('whatsapp_instances')
          .select('instance_name, status')
          .eq('org_id', state.orgId)
          .in('instance_name', [state.instanceAName, state.instanceBName]);
        if (error) return `ERROR:${error.message}`;
        const rows = data || [];
        if (rows.length < 2) return 'MISSING';
        return rows.every((row) => row.status === 'connected');
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  const trigger = page.getByTestId('instance-selector-trigger');
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await expect(trigger).toContainText(state.instanceADisplay);

  await trigger.click();
  const whatsappSubmenu = page.getByRole('menuitem', { name: /^WhatsApp/i });
  await expect(whatsappSubmenu).toBeVisible({ timeout: 30_000 });
  await whatsappSubmenu.hover();
  await page.getByTestId(`instance-option-${state.instanceBName}`).click();

  await expect(trigger).toContainText(state.instanceBDisplay);

  await page.waitForTimeout(2500);
  await expect(trigger).toContainText(state.instanceBDisplay);
});
