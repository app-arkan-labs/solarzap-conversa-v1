import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M12 e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerPassword: string;
  operatorUserId: string;
  operatorEmail: string;
  operatorPassword: string;
  leadName: string;
  instanceName: string;
  instanceDisplayName: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerUserId: '',
  ownerEmail: '',
  ownerPassword: '',
  operatorUserId: '',
  operatorEmail: '',
  operatorPassword: '',
  leadName: '',
  instanceName: '',
  instanceDisplayName: '',
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
  state.ownerEmail = `m12.owner.${suffix}@example.test`;
  state.ownerPassword = `M12Owner!${suffix}Aa1`;
  state.operatorEmail = `m12.operator.${suffix}@example.test`;
  state.operatorPassword = `M12Operator!${suffix}Aa1`;
  state.leadName = `M12-Lead-${suffix}`;
  state.instanceName = `m12-instance-${suffix}`;
  state.instanceDisplayName = `M12 Shared ${suffix.slice(-4)}`;

  const ownerResp = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
  });
  if (ownerResp.error || !ownerResp.data.user?.id) {
    throw new Error(`Failed to create M12 owner user: ${ownerResp.error?.message || 'unknown'}`);
  }
  state.ownerUserId = ownerResp.data.user.id;

  const operatorResp = await admin.auth.admin.createUser({
    email: state.operatorEmail,
    password: state.operatorPassword,
    email_confirm: true,
  });
  if (operatorResp.error || !operatorResp.data.user?.id) {
    throw new Error(`Failed to create M12 operator user: ${operatorResp.error?.message || 'unknown'}`);
  }
  state.operatorUserId = operatorResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M12 E2E Org ${suffix}`,
    owner_id: state.ownerUserId,
  });
  if (orgErr) throw new Error(`Failed to create M12 org: ${orgErr.message}`);

  const { error: membershipErr } = await admin.from('organization_members').insert([
    {
      org_id: state.orgId,
      user_id: state.ownerUserId,
      role: 'owner',
      can_view_team_leads: true,
    },
    {
      org_id: state.orgId,
      user_id: state.operatorUserId,
      role: 'user',
      can_view_team_leads: false,
    },
  ]);
  if (membershipErr) throw new Error(`Failed to create M12 memberships: ${membershipErr.message}`);

  const { error: instanceErr } = await admin.from('whatsapp_instances').insert({
    org_id: state.orgId,
    user_id: state.operatorUserId,
    instance_name: state.instanceName,
    display_name: state.instanceDisplayName,
    status: 'connected',
    is_active: true,
  });
  if (instanceErr) throw new Error(`Failed to create M12 instance: ${instanceErr.message}`);

  const { error: leadErr } = await admin.from('leads').insert({
    org_id: state.orgId,
    user_id: state.ownerUserId,
    assigned_to_user_id: state.ownerUserId,
    nome: state.leadName,
    telefone: `55${suffix.slice(-8)}55`,
    status_pipeline: 'novo_lead',
    canal: 'whatsapp',
    instance_name: state.instanceName,
  });
  if (leadErr) throw new Error(`Failed to create M12 lead: ${leadErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('interacoes').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('whatsapp_instances').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.operatorUserId) {
    await admin.auth.admin.deleteUser(state.operatorUserId);
  }
  if (state.ownerUserId) {
    await admin.auth.admin.deleteUser(state.ownerUserId);
  }
});

test('M12 owner can use any connected instance in organization', async ({ page }) => {
  await login(page, state.ownerEmail, state.ownerPassword);

  await page.getByPlaceholder(/Pesquisar/i).fill(state.leadName);
  const row = page.locator('[data-testid="conversation-row"]').filter({ hasText: state.leadName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  await expect(page.getByTestId('user-assigned-instance-badge')).toHaveCount(0);
  await expect(page.getByRole('button', { name: new RegExp(state.instanceDisplayName, 'i') })).toBeVisible({
    timeout: 30_000,
  });
});
