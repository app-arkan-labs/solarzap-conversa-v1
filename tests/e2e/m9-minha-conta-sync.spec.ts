import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { join } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M9 e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const AVATAR_FIXTURE_PATH = join(process.cwd(), 'public', 'logo.png');

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  nextPassword: string;
  leadName: string;
  leadPhone: string;
  nextDisplayName: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  nextPassword: '',
  leadName: '',
  leadPhone: '',
  nextDisplayName: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

async function openMinhaConta(page: Page) {
  await page.getByTestId('nav-settings-trigger').click();
  await page.getByTestId('nav-menu-minha-conta').click();
  await expect(page.getByRole('heading', { name: /Minha Conta/i })).toBeVisible();
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `m9.owner.${suffix}@example.test`;
  state.password = `M9Owner!${suffix}Aa1`;
  state.nextPassword = `M9OwnerNext!${suffix}Aa1`;
  state.leadName = `M9-Lead-${suffix}`;
  state.leadPhone = `119${suffix.slice(-8)}`;
  state.nextDisplayName = `M9 Nome ${suffix.slice(-4)}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
    user_metadata: { name: 'M9 Nome Inicial' },
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M9 e2e user: ${userResp.error?.message || 'unknown'}`);
  }

  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M9 E2E Org ${suffix}`,
    owner_id: state.userId,
  });
  if (orgErr) throw new Error(`Failed to create M9 e2e org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create M9 e2e membership: ${memberErr.message}`);
});

test.afterAll(async () => {
  if (state.leadName && state.userId) {
    await admin.from('leads').delete().eq('nome', state.leadName).eq('user_id', state.userId);
  }

  if (state.orgId) {
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('M9 smoke: Minha Conta updates profile/password and syncs assignment dropdown', async ({ page }) => {
  await login(page, state.email, state.password);

  await page.getByRole('button', { name: 'Pipelines' }).click();
  await page.getByTestId('open-create-lead-modal').first().click();
  await page.locator('#nome').fill(state.leadName);
  await page.locator('#telefone').fill(state.leadPhone);
  await page.getByTestId('submit-create-lead').click();

  await expect(page.getByText(state.leadName).first()).toBeVisible();

  await openMinhaConta(page);

  await page.getByTestId('profile-avatar-input').setInputFiles(AVATAR_FIXTURE_PATH);
  await expect(page.getByTestId('profile-avatar-image')).toBeVisible();
  await expect(page.getByTestId('nav-account-avatar-image')).toBeVisible();
  await expect
    .poll(
      async () => {
        const { data, error } = await admin.auth.admin.getUserById(state.userId);
        if (error) {
          return `ERROR:${error.message}`;
        }

        const metadata = (data.user?.user_metadata || {}) as Record<string, unknown>;
        return String(metadata.avatar_url || '');
      },
      { timeout: 30_000 },
    )
    .toContain('/storage/v1/object/public/avatars/');

  await page.locator('#name').fill(state.nextDisplayName);
  await page.getByRole('button', { name: /Salvar Altera/i }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin.auth.admin.getUserById(state.userId);
        if (error) {
          return `ERROR:${error.message}`;
        }

        const metadata = (data.user?.user_metadata || {}) as Record<string, unknown>;
        return String(metadata.name || '');
      },
      { timeout: 30_000 },
    )
    .toBe(state.nextDisplayName);

  await page.locator('#currentPassword').fill(state.password);
  await page.locator('#newPassword').fill(state.nextPassword);
  await page.locator('#confirmPassword').fill(state.nextPassword);
  await page.getByRole('button', { name: /Atualizar Senha/i }).click();
  await expect(page.getByText('Senha atualizada', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: /Sair da Conta/i }).click();
  await page.waitForURL('**/login', { timeout: 30_000 });

  await login(page, state.email, state.nextPassword);
  await page.getByRole('button', { name: 'Pipelines' }).click();

  const firstAssigneeTrigger = page.locator('[data-testid^="assign-member-select-trigger-"]').first();
  await expect(firstAssigneeTrigger).toBeVisible();
  await firstAssigneeTrigger.click();

  await expect(page.getByTestId(`assign-member-option-${state.userId}`)).toContainText(
    state.nextDisplayName,
  );
});

