import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for pipeline transition regression e2e.');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  sellerUserId: string;
  sellerEmail: string;
  sellerPassword: string;
  successLeadId: number;
  failLeadId: number;
  successLeadName: string;
  failLeadName: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  sellerUserId: '',
  sellerEmail: '',
  sellerPassword: '',
  successLeadId: 0,
  failLeadId: 0,
  successLeadName: '',
  failLeadName: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

async function openAndConfirmCall(page: Page) {
  await page.getByRole('button', { name: /Realizar chamada/i }).first().click();
  await expect(page.getByText(/Ligar para/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Telefone' }).click();
  await page.getByRole('button', { name: /Ja abri no celular/i }).click();
  await expect(page.getByRole('button', { name: /Sim, Realizei/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Sim, Realizei/i }).click();
  await expect(page.getByPlaceholder(/Ex: Cliente confirmou interesse/i)).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder(/Ex: Cliente confirmou interesse/i).fill('Ligacao registrada no fluxo de regressao.');
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.sellerEmail = `e2e.pipeline.seller.${suffix}@example.test`;
  state.sellerPassword = `PipeLineReg!${suffix}Aa1`;
  state.successLeadName = `PIPE-SUCCESS-${suffix}`;
  state.failLeadName = `PIPE-FAIL-${suffix}`;

  const sellerResp = await admin.auth.admin.createUser({
    email: state.sellerEmail,
    password: state.sellerPassword,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, e2e_pipeline: true },
  });
  if (sellerResp.error || !sellerResp.data.user?.id) {
    throw new Error(`Failed to create seller user: ${sellerResp.error?.message || 'unknown'}`);
  }
  state.sellerUserId = sellerResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `Pipeline Regression Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.sellerUserId,
    role: 'user',
    can_view_team_leads: false,
  });
  if (memberErr) throw new Error(`Failed to create seller membership: ${memberErr.message}`);

  const successLeadResp = await admin
    .from('leads')
    .insert({
      org_id: state.orgId,
      user_id: state.sellerUserId,
      assigned_to_user_id: state.sellerUserId,
      nome: state.successLeadName,
      telefone: `55${suffix.slice(-8)}71`,
      canal: 'whatsapp',
      status_pipeline: 'chamada_agendada',
    })
    .select('id')
    .single();
  if (successLeadResp.error || !successLeadResp.data?.id) {
    throw new Error(`Failed to seed success lead: ${successLeadResp.error?.message || 'unknown'}`);
  }
  state.successLeadId = Number(successLeadResp.data.id);

  const failLeadResp = await admin
    .from('leads')
    .insert({
      org_id: state.orgId,
      user_id: state.sellerUserId,
      assigned_to_user_id: state.sellerUserId,
      nome: state.failLeadName,
      telefone: `55${suffix.slice(-8)}72`,
      canal: 'whatsapp',
      status_pipeline: 'chamada_agendada',
    })
    .select('id')
    .single();
  if (failLeadResp.error || !failLeadResp.data?.id) {
    throw new Error(`Failed to seed fail lead: ${failLeadResp.error?.message || 'unknown'}`);
  }
  state.failLeadId = Number(failLeadResp.data.id);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('lead_stage_history').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }
  if (state.sellerUserId) {
    await admin.auth.admin.deleteUser(state.sellerUserId);
  }
});

test('seller assigned lead can move stage from chamada_agendada to chamada_realizada', async ({ page }) => {
  await login(page, state.sellerEmail, state.sellerPassword);
  await page.getByRole('button', { name: 'Pipelines' }).click();
  await page.getByPlaceholder('Buscar leads...').fill(state.successLeadName);

  await openAndConfirmCall(page);
  await page.getByRole('button', { name: /Salvar e continuar/i }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('leads')
          .select('status_pipeline')
          .eq('id', state.successLeadId)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        return data?.status_pipeline || null;
      },
      { timeout: 30_000 },
    )
    .toBe('chamada_realizada');
});

test('stage transition failure does not show success toast or open next-step modal', async ({ page }) => {
  await login(page, state.sellerEmail, state.sellerPassword);
  await page.getByRole('button', { name: 'Pipelines' }).click();
  await page.getByPlaceholder('Buscar leads...').fill(state.failLeadName);

  await openAndConfirmCall(page);
  await admin.from('leads').delete().eq('id', state.failLeadId);
  await page.getByRole('button', { name: /Salvar e continuar/i }).click();

  await expect(page.getByText('Falha ao mover lead', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Chamada registrada!/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Sim, Mover/i })).toHaveCount(0);
});
