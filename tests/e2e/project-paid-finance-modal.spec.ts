import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for project paid finance modal e2e.');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  sellerUserId: string;
  sellerEmail: string;
  sellerPassword: string;
  cancelLeadId: number;
  prefillLeadId: number;
  emptyNotesLeadId: number;
  cancelLeadName: string;
  prefillLeadName: string;
  emptyNotesLeadName: string;
  skipReason: string | null;
};

const state: SetupState = {
  orgId: randomUUID(),
  sellerUserId: '',
  sellerEmail: '',
  sellerPassword: '',
  cancelLeadId: 0,
  prefillLeadId: 0,
  emptyNotesLeadId: 0,
  cancelLeadName: '',
  prefillLeadName: '',
  emptyNotesLeadName: '',
  skipReason: null,
};

async function getFinanceCommentsForLead(leadId: number) {
  const { data, error } = await admin
    .from('comentarios_leads')
    .select('texto, autor')
    .eq('org_id', state.orgId)
    .eq('lead_id', leadId);

  if (error) {
    throw new Error(`Failed to load lead comments: ${error.message}`);
  }

  return (data || []).filter((row) => typeof row.texto === 'string' && row.texto.startsWith('[Financeiro Projeto Pago]'));
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.sellerEmail = `e2e.finance.modal.${suffix}@example.test`;
  state.sellerPassword = `FinanceModal!${suffix}Aa1`;
  state.cancelLeadName = `FIN-CANCEL-${suffix}`;
  state.prefillLeadName = `FIN-PREFILL-${suffix}`;
  state.emptyNotesLeadName = `FIN-BLANK-${suffix}`;

  const sellerResp = await admin.auth.admin.createUser({
    email: state.sellerEmail,
    password: state.sellerPassword,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, e2e_finance_modal: true },
  });
  if (sellerResp.error || !sellerResp.data.user?.id) {
    throw new Error(`Failed to create seller user: ${sellerResp.error?.message || 'unknown'}`);
  }
  state.sellerUserId = sellerResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `Finance Modal Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.sellerUserId,
    role: 'user',
    can_view_team_leads: false,
  });
  if (memberErr) throw new Error(`Failed to create membership: ${memberErr.message}`);

  const { error: flagErr } = await admin
    .from('_admin_feature_flags')
    .upsert(
      {
        flag_key: 'finance_project_paid_v1',
        description: 'Enables mandatory finance modal and cash accounting on Projeto Pago',
        default_enabled: false,
      },
      { onConflict: 'flag_key' },
    );
  if (flagErr) {
    state.skipReason = `_admin_feature_flags unavailable: ${flagErr.message}`;
    return;
  }

  const { error: overrideErr } = await admin
    .from('_admin_org_feature_overrides')
    .upsert(
      {
        org_id: state.orgId,
        flag_key: 'finance_project_paid_v1',
        enabled: true,
        updated_by: state.sellerUserId,
      },
      { onConflict: 'org_id,flag_key' },
    );
  if (overrideErr) {
    state.skipReason = `_admin_org_feature_overrides unavailable: ${overrideErr.message}`;
    return;
  }

  const financePlanProbe = await admin.from('lead_sale_finance_plans').select('id').limit(1);
  if (financePlanProbe.error) {
    state.skipReason = `lead_sale_finance_plans unavailable: ${financePlanProbe.error.message}`;
    return;
  }

  const cancelLeadResp = await admin
    .from('leads')
    .insert({
      org_id: state.orgId,
      user_id: state.sellerUserId,
      assigned_to_user_id: state.sellerUserId,
      nome: state.cancelLeadName,
      telefone: `55${suffix.slice(-8)}81`,
      canal: 'whatsapp',
      status_pipeline: 'contrato_assinado',
      valor_estimado: 10000,
    })
    .select('id')
    .single();
  if (cancelLeadResp.error || !cancelLeadResp.data?.id) {
    throw new Error(`Failed to seed cancel lead: ${cancelLeadResp.error?.message || 'unknown'}`);
  }
  state.cancelLeadId = Number(cancelLeadResp.data.id);

  const prefillLeadResp = await admin
    .from('leads')
    .insert({
      org_id: state.orgId,
      user_id: state.sellerUserId,
      assigned_to_user_id: state.sellerUserId,
      nome: state.prefillLeadName,
      telefone: `55${suffix.slice(-8)}82`,
      canal: 'whatsapp',
      status_pipeline: 'contrato_assinado',
      valor_estimado: 15000,
    })
    .select('id')
    .single();
  if (prefillLeadResp.error || !prefillLeadResp.data?.id) {
    throw new Error(`Failed to seed prefill lead: ${prefillLeadResp.error?.message || 'unknown'}`);
  }
  state.prefillLeadId = Number(prefillLeadResp.data.id);

  const emptyNotesLeadResp = await admin
    .from('leads')
    .insert({
      org_id: state.orgId,
      user_id: state.sellerUserId,
      assigned_to_user_id: state.sellerUserId,
      nome: state.emptyNotesLeadName,
      telefone: `55${suffix.slice(-8)}83`,
      canal: 'whatsapp',
      status_pipeline: 'contrato_assinado',
      valor_estimado: 12000,
    })
    .select('id')
    .single();
  if (emptyNotesLeadResp.error || !emptyNotesLeadResp.data?.id) {
    throw new Error(`Failed to seed blank-notes lead: ${emptyNotesLeadResp.error?.message || 'unknown'}`);
  }
  state.emptyNotesLeadId = Number(emptyNotesLeadResp.data.id);

  const prefillPlanResp = await admin
    .from('lead_sale_finance_plans')
    .insert({
      org_id: state.orgId,
      lead_id: state.prefillLeadId,
      sale_value: 15000,
      project_cost: 9000,
      notes: 'plano prefill e2e',
      created_by: state.sellerUserId,
      updated_by: state.sellerUserId,
    })
    .select('id')
    .single();
  if (prefillPlanResp.error || !prefillPlanResp.data?.id) {
    throw new Error(`Failed to seed prefill finance plan: ${prefillPlanResp.error?.message || 'unknown'}`);
  }

  const { error: prefillInstallmentErr } = await admin
    .from('lead_sale_installments')
    .insert({
      org_id: state.orgId,
      plan_id: prefillPlanResp.data.id,
      lead_id: state.prefillLeadId,
      installment_no: 1,
      due_on: '2026-03-20',
      amount: 15000,
      payment_methods: ['pix', 'credit_card'],
      status: 'scheduled',
      cycle_no: 0,
      created_by: state.sellerUserId,
      updated_by: state.sellerUserId,
    });
  if (prefillInstallmentErr) {
    throw new Error(`Failed to seed prefill installment: ${prefillInstallmentErr.message}`);
  }
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('comentarios_leads').delete().eq('org_id', state.orgId);
    await admin.from('lead_sale_installments').delete().eq('org_id', state.orgId);
    await admin.from('lead_sale_finance_plans').delete().eq('org_id', state.orgId);
    await admin.from('lead_stage_history').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('_admin_org_feature_overrides').delete().eq('org_id', state.orgId).eq('flag_key', 'finance_project_paid_v1');
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }
  if (state.sellerUserId) {
    await admin.auth.admin.deleteUser(state.sellerUserId);
  }
});

test('moving to Projeto Pago opens mandatory finance modal and cancel keeps stage unchanged', async ({ page }) => {
  if (state.skipReason) test.skip(true, state.skipReason);

  await login(page, state.sellerEmail, state.sellerPassword);
  await page.getByRole('button', { name: 'Pipelines' }).click();
  await page.getByPlaceholder('Buscar leads...').fill(state.cancelLeadName);
  await page.getByRole('button', { name: /Aguardar pagamento/i }).first().click();

  await expect(page.getByText(/Parabens pela venda! Finalize o financeiro/i)).toBeVisible({ timeout: 20_000 });
  const modal = page.getByRole('dialog').last();
  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText(/Parabens pela venda! Finalize o financeiro/i)).toHaveCount(0);

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('leads')
          .select('status_pipeline')
          .eq('id', state.cancelLeadId)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        return data?.status_pipeline || null;
      },
      { timeout: 30_000 },
    )
    .toBe('contrato_assinado');
});

test('finance modal prefill loads existing plan and allows transition after save', async ({ page }) => {
  if (state.skipReason) test.skip(true, state.skipReason);
  const financeNote = `observacao financeira e2e ${Date.now()}`;

  await login(page, state.sellerEmail, state.sellerPassword);
  await page.getByRole('button', { name: 'Pipelines' }).click();
  await page.getByPlaceholder('Buscar leads...').fill(state.prefillLeadName);
  await page.getByRole('button', { name: /Aguardar pagamento/i }).first().click();

  await expect(page.getByText(/Parabens pela venda! Finalize o financeiro/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#finance-sale-value')).toHaveValue(/15000/);
  await expect(page.locator('#finance-project-cost')).toHaveValue(/9000/);
  await page.locator('#finance-notes').fill(financeNote);

  const modal = page.getByRole('dialog').last();
  await modal.getByRole('button', { name: /Proximo/i }).click();
  await expect(modal.getByText(/Selecionadas:/i)).toBeVisible();
  await expect(modal.getByText(/Pix, Cartao de credito/i)).toBeVisible();

  await modal.getByRole('button', { name: /Proximo/i }).click();
  await expect(modal.getByText(/Preenchido:/i)).toBeVisible();
  await expect(modal.getByRole('button', { name: /^Pix$/ })).toBeVisible();
  await expect(modal.getByRole('button', { name: /^Cartao de credito$/ })).toBeVisible();
  await expect(modal.getByRole('button', { name: /^Boleto$/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /^Cartao de debito$/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /^Transferencia bancaria$/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /^Financiamento$/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /^Dinheiro$/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /^Cheque$/ })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: /^Outro$/ })).toHaveCount(0);

  await modal.getByRole('button', { name: /Proximo/i }).click();
  await expect(modal.getByText(/Revisao final/i)).toBeVisible();

  await modal.getByRole('button', { name: /Salvar e continuar/i }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('leads')
          .select('status_pipeline')
          .eq('id', state.prefillLeadId)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        return data?.status_pipeline || null;
      },
      { timeout: 30_000 },
    )
    .toBe('projeto_pago');

  await expect
    .poll(
      async () => {
        const comments = await getFinanceCommentsForLead(state.prefillLeadId);
        return comments.some((comment) => comment.texto.includes(financeNote));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

test('finance modal saves without lead comment when observations are blank', async ({ page }) => {
  if (state.skipReason) test.skip(true, state.skipReason);

  await login(page, state.sellerEmail, state.sellerPassword);
  await page.getByRole('button', { name: 'Pipelines' }).click();
  await page.getByPlaceholder('Buscar leads...').fill(state.emptyNotesLeadName);
  await page.getByRole('button', { name: /Aguardar pagamento/i }).first().click();

  await expect(page.getByText(/Parabens pela venda! Finalize o financeiro/i)).toBeVisible({ timeout: 20_000 });
  const modal = page.getByRole('dialog').last();
  await expect(page.locator('#finance-notes')).toHaveValue('');

  await modal.getByRole('button', { name: /Proximo/i }).click();
  await expect(modal.getByText(/Selecionadas: Pix/i)).toBeVisible();

  await modal.getByRole('button', { name: /Proximo/i }).click();
  await expect(modal.getByText(/Pagamento simples detectado/i)).toBeVisible();

  await modal.getByRole('button', { name: /Proximo/i }).click();
  await expect(modal.getByText(/Revisao final/i)).toBeVisible();

  await modal.getByRole('button', { name: /Salvar e continuar/i }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('leads')
          .select('status_pipeline')
          .eq('id', state.emptyNotesLeadId)
          .maybeSingle();
        if (error) return `ERROR:${error.message}`;
        return data?.status_pipeline || null;
      },
      { timeout: 30_000 },
    )
    .toBe('projeto_pago');

  await expect
    .poll(
      async () => {
        const comments = await getFinanceCommentsForLead(state.emptyNotesLeadId);
        return comments.length;
      },
      { timeout: 30_000 },
    )
    .toBe(0);
});
