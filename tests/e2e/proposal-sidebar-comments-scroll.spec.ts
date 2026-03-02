import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for sidebar proposals/comments smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  leadId: number;
  leadName: string;
  propostaId: number;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  leadId: 0,
  leadName: '',
  propostaId: 0,
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `e2e.sidebar.${suffix}@example.test`;
  state.password = `Sidebar!${suffix}Aa1`;
  state.leadName = `E2E Sidebar Lead ${suffix}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });
  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create sidebar test user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `E2E Sidebar Org ${suffix}`,
    owner_id: state.userId,
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create membership: ${memberErr.message}`);

  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .insert({
      org_id: state.orgId,
      user_id: state.userId,
      assigned_to_user_id: state.userId,
      nome: state.leadName,
      telefone: '11999999999',
      phone_e164: '5511999999999',
      canal: 'whatsapp',
      status_pipeline: 'respondeu',
      valor_estimado: 42000,
      consumo_kwh: 650,
    })
    .select('id')
    .single();
  if (leadErr || !lead?.id) {
    throw new Error(`Failed to create lead: ${leadErr?.message || 'missing lead id'}`);
  }
  state.leadId = Number(lead.id);

  const { error: interactionErr } = await admin.from('interacoes').insert({
    org_id: state.orgId,
    lead_id: state.leadId,
    user_id: state.userId,
    tipo: 'mensagem_cliente',
    mensagem: `Sidebar anchor ${suffix}`,
    instance_name: 'default',
    phone_e164: '5511999999999',
  });
  if (interactionErr) throw new Error(`Failed to seed interaction: ${interactionErr.message}`);

  const { data: proposta, error: propostaErr } = await admin
    .from('propostas')
    .insert({
      org_id: state.orgId,
      user_id: state.userId,
      lead_id: state.leadId,
      valor_projeto: 42000,
      consumo_kwh: 650,
      potencia_kw: 9.9,
      paineis_qtd: 18,
      economia_mensal: 700,
      payback_anos: 4.5,
      status: 'Enviada',
    })
    .select('id')
    .single();
  if (propostaErr || !proposta?.id) {
    throw new Error(`Failed to create proposta: ${propostaErr?.message || 'missing proposta id'}`);
  }
  state.propostaId = Number(proposta.id);

  const proposalVersions = Array.from({ length: 8 }).map((_, index) => ({
    proposta_id: state.propostaId,
    lead_id: state.leadId,
    user_id: state.userId,
    org_id: state.orgId,
    version_no: index + 1,
    status: 'sent',
    segment: 'residencial',
    source: 'manual',
    premium_payload: {
      public_pdf_url: `https://example.test/proposals/${state.leadId}/v${index + 1}.pdf`,
      share_url: `https://example.test/share/${state.leadId}/v${index + 1}`,
    },
  }));
  const { error: versionsErr } = await admin.from('proposal_versions').insert(proposalVersions);
  if (versionsErr) throw new Error(`Failed to seed proposal_versions: ${versionsErr.message}`);

  const comments = Array.from({ length: 18 }).map((_, index) => ({
    org_id: state.orgId,
    lead_id: state.leadId,
    texto: `Comentário de teste ${index + 1} para validar scroll no modal.`,
    autor: 'E2E',
  }));
  const { error: commentsErr } = await admin.from('comentarios_leads').insert(comments);
  if (commentsErr) throw new Error(`Failed to seed comments: ${commentsErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('proposal_delivery_events').delete().eq('org_id', state.orgId);
    await admin.from('proposal_sections').delete().eq('org_id', state.orgId);
    await admin.from('proposal_versions').delete().eq('org_id', state.orgId);
    await admin.from('propostas').delete().eq('org_id', state.orgId);
    await admin.from('comentarios_leads').delete().eq('org_id', state.orgId);
    await admin.from('interacoes').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }
  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('sidebar proposals and comments lists are scrollable and actions are enabled', async ({ page }) => {
  await login(page, state.email, state.password);

  await page.getByPlaceholder(/Pesquisar/i).fill(state.leadName);
  const row = page.locator('[data-testid="conversation-row"]').filter({ hasText: state.leadName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  await page.getByTestId('chat-open-details').click();

  await expect(page.getByText('Propostas deste Lead')).toBeVisible({ timeout: 30_000 });
  const proposalsScroll = page.getByTestId('lead-proposals-scroll');
  await expect(proposalsScroll).toBeVisible({ timeout: 30_000 });

  const proposalsHasOverflow = await proposalsScroll.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(proposalsHasOverflow).toBe(true);

  await expect(page.getByRole('button', { name: 'Ver PDF' }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Copiar Link' }).first()).toBeEnabled();

  await page.getByTestId('quick-action-comments').click();
  await expect(page.getByRole('heading', { name: new RegExp(`Coment.*${state.leadName}`, 'i') })).toBeVisible({ timeout: 30_000 });

  const commentsScroll = page.getByTestId('lead-comments-scroll');
  await expect(commentsScroll).toBeVisible({ timeout: 30_000 });
  const commentsHasOverflow = await commentsScroll.evaluate((el) => {
    const viewport = el.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return false;
    return viewport.scrollHeight > viewport.clientHeight;
  });
  expect(commentsHasOverflow).toBe(true);
});
