import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for lead-stage-data smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  leadId: number;
  leadName: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  leadId: Number(`91${Date.now().toString().slice(-10)}`),
  leadName: '',
};

const isSchemaMismatch = (error: any): boolean => {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code === '42703' || code === 'PGRST204';
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
}

async function openPipelines(page: Page) {
  const pipelinesButton = page.locator('button[title="Pipelines"]');
  await pipelinesButton.waitFor({ state: 'visible', timeout: 30_000 });
  await pipelinesButton.click();
  await expect(page.getByRole('heading', { name: /Pipeline de Vendas/i })).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `lead.stage.data.${suffix}@example.test`;
  state.password = `LeadStageData!${suffix}Aa1`;
  state.leadName = `Lead Stage Data ${suffix}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, lead_stage_data_e2e: true },
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create lead-stage-data test user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `Lead Stage Data Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create membership: ${memberErr.message}`);

  const { error: leadErr } = await admin.from('leads').insert({
    id: state.leadId,
    org_id: state.orgId,
    user_id: state.userId,
    assigned_to_user_id: state.userId,
    nome: state.leadName,
    telefone: '11987654321',
    canal: 'whatsapp',
    status_pipeline: 'financiamento',
    valor_estimado: 32000,
    consumo_kwh: 750,
  });
  if (leadErr) throw new Error(`Failed to create lead: ${leadErr.message}`);
});

test.afterAll(async () => {
  if (state.leadId) {
    await admin.from('leads').delete().eq('id', state.leadId);
  }
  if (state.orgId) {
    await admin.from('ai_stage_config').delete().eq('org_id', state.orgId);
    await admin.from('ai_settings').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }
  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('lead stage data smoke: seed stage_data, render badges and details section', async ({ page }) => {
  const stageDataPayload = {
    respondeu: {
      segment: 'casa',
      timing: 'ate_3_meses',
      decision_makers: ['Joao', 'Maria'],
      bant_complete: true,
      updated_at: new Date().toISOString(),
    },
    financiamento: {
      financing_status: 'in_review',
      missing_docs: ['comprovante_renda'],
      bank_notes: 'Analise em andamento',
      updated_at: new Date().toISOString(),
    },
  };

  const { error: seedStageDataErr } = await admin
    .from('leads')
    .update({ lead_stage_data: stageDataPayload })
    .eq('id', state.leadId)
    .eq('org_id', state.orgId);

  if (seedStageDataErr && isSchemaMismatch(seedStageDataErr)) {
    test.skip(true, 'lead_stage_data column not available in current test database');
  }
  if (seedStageDataErr) throw new Error(`Failed to seed lead_stage_data: ${seedStageDataErr.message}`);

  await login(page, state.email, state.password);
  await openPipelines(page);

  const searchInput = page.getByPlaceholder('Buscar leads...');
  await searchInput.fill(state.leadName);

  const leadCardTitle = page.getByText(state.leadName, { exact: true }).first();
  await expect(leadCardTitle).toBeVisible({ timeout: 30_000 });

  const badges = page.getByTestId(`stage-badges-${state.leadId}`);
  await expect(badges).toBeVisible({ timeout: 30_000 });
  await expect(badges).toContainText('Financ:');
  await expect(badges).toContainText('BANT: completo');

  await leadCardTitle.click();
  await expect(page.getByRole('heading', { name: /Editar Lead/i })).toBeVisible({ timeout: 30_000 });

  const stageDataSection = page.getByTestId(`lead-stage-data-section-${state.leadId}`);
  await expect(stageDataSection).toBeVisible({ timeout: 30_000 });
  await expect(stageDataSection).toContainText('Dados do Agente');
  await expect(stageDataSection).toContainText('in_review');
  await expect(stageDataSection).toContainText('Joao, Maria');
});
