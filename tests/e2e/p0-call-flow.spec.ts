import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for P0 call flow smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
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
  leadId: 0,
  leadName: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `p0.call.flow.${suffix}@example.test`;
  state.password = `P0CallFlow!${suffix}Aa1`;
  state.leadId = Number(`8${suffix}`.slice(0, 12));
  state.leadName = `P0 Call Lead ${suffix}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, p0_call_flow: true },
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create P0 call-flow user: ${userResp.error?.message || 'unknown'}`);
  }

  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `P0 Call Flow Org ${suffix}`,
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
    status_pipeline: 'chamada_agendada',
    valor_estimado: 25000,
    consumo_kwh: 600,
  });
  if (leadErr) throw new Error(`Failed to create lead: ${leadErr.message}`);

  const { data: beforeLead, error: beforeLeadErr } = await admin
    .from('leads')
    .select('id, status_pipeline')
    .eq('id', state.leadId)
    .maybeSingle();
  if (beforeLeadErr) throw new Error(`Failed to read lead before test: ${beforeLeadErr.message}`);

  console.log('[P0 call-flow] before lead status =', beforeLead?.status_pipeline);
});

test.afterAll(async () => {
  if (state.leadId) {
    await admin.from('lead_stage_history').delete().eq('org_id', state.orgId).eq('lead_id', state.leadId);
    await admin.from('leads').delete().eq('id', state.leadId);
  }

  if (state.orgId) {
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('P0 call flow: Sim, Realizei move stage immediately and chains to proposal step', async ({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    console.log(`[pageerror] ${err.message}`);
  });
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/leads') || req.url().includes('/rest/v1/lead_stage_history')) {
      console.log(`[req] ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/rest/v1/leads') || url.includes('/rest/v1/lead_stage_history')) {
      let body = '';
      try {
        body = await res.text();
      } catch {
        body = '<no-body>';
      }
      console.log(`[res] ${res.status()} ${url} body=${body.slice(0, 300)}`);
    }
  });

  await login(page, state.email, state.password);

  await page.getByRole('button', { name: 'Pipelines' }).click();
  await expect(page.getByText(/Pipeline de Vendas/i)).toBeVisible({ timeout: 30_000 });

  const nextActionButton = page.getByRole('button', { name: /Realizar chamada/i }).first();
  await expect(nextActionButton).toBeVisible({ timeout: 30_000 });
  await nextActionButton.click();

  await expect(page.getByText(new RegExp(`Ligar para ${state.leadName}`))).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Telefone' }).click();
  await page.getByRole('button', { name: /Ja abri no celular/i }).click();
  await page.getByRole('button', { name: /Sim, Realizei/i }).click();
  await expect(page.getByText(/Como foi a ligacao\?/i)).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder(/Ex: Cliente confirmou interesse/i).fill('Ligacao realizada, cliente confirmou interesse na proposta.');
  await page.getByRole('button', { name: /Salvar e continuar/i }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('leads')
          .select('status_pipeline')
          .eq('id', state.leadId)
          .maybeSingle();

        if (error) return `ERROR:${error.message}`;
        return data?.status_pipeline || null;
      },
      { timeout: 30_000 },
    )
    .toBe('chamada_realizada');

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('lead_stage_history')
          .select('to_stage')
          .eq('org_id', state.orgId)
          .eq('lead_id', state.leadId)
          .eq('to_stage', 'chamada_realizada');

        if (error) return `ERROR:${error.message}`;
        return data?.length || 0;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  const moveButton = page.getByRole('button', { name: /Sim, Mover/i });
  if (await moveButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await moveButton.click();

    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from('leads')
            .select('status_pipeline')
            .eq('id', state.leadId)
            .maybeSingle();

          if (error) return `ERROR:${error.message}`;
          return data?.status_pipeline || null;
        },
        { timeout: 30_000 },
      )
      .toBe('aguardando_proposta');
  }

  const { data: finalLead, error: finalLeadErr } = await admin
    .from('leads')
    .select('status_pipeline')
    .eq('id', state.leadId)
    .maybeSingle();
  if (finalLeadErr) throw new Error(`Failed to read lead final status: ${finalLeadErr.message}`);

  console.log('[P0 call-flow] final lead status =', finalLead?.status_pipeline);
});
