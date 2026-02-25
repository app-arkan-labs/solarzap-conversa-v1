import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for M8 e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerPassword: string;
  invitedEmail: string;
  invitedUserId: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  ownerUserId: '',
  ownerEmail: '',
  ownerPassword: '',
  invitedEmail: '',
  invitedUserId: '',
};

async function findUserByEmail(email: string) {
  const normalized = email.toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = data.users ?? [];
    const found = users.find((candidate) => (candidate.email || '').toLowerCase() === normalized);
    if (found) {
      return found;
    }

    if (users.length < perPage) {
      break;
    }
  }

  return null;
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
  state.ownerEmail = `m8.owner.${suffix}@example.test`;
  state.ownerPassword = `M8Owner!${suffix}Aa1`;
  state.invitedEmail = `m8.member.${suffix}@example.test`;

  const createdOwner = await admin.auth.admin.createUser({
    email: state.ownerEmail,
    password: state.ownerPassword,
    email_confirm: true,
  });

  if (createdOwner.error || !createdOwner.data.user?.id) {
    throw new Error(`Failed to create M8 owner user: ${createdOwner.error?.message || 'unknown'}`);
  }

  state.ownerUserId = createdOwner.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M8 E2E Org ${suffix}`,
    owner_id: state.ownerUserId,
  });
  if (orgErr) {
    throw new Error(`Failed to create M8 org: ${orgErr.message}`);
  }

  const { error: membershipErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.ownerUserId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (membershipErr) {
    throw new Error(`Failed to create M8 owner membership: ${membershipErr.message}`);
  }
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.invitedUserId) {
    await admin.auth.admin.deleteUser(state.invitedUserId);
  } else if (state.invitedEmail) {
    const invitedUser = await findUserByEmail(state.invitedEmail);
    if (invitedUser?.id) {
      await admin.auth.admin.deleteUser(invitedUser.id);
    }
  }

  if (state.ownerUserId) {
    await admin.auth.admin.deleteUser(state.ownerUserId);
  }
});

test('M8 admin members: list, invite(create), update, remove', async ({ page }) => {
  await login(page, state.ownerEmail, state.ownerPassword);

  await page.goto('/admin/members');
  await expect(page.getByTestId('admin-members-page')).toBeVisible();
  await expect(page.getByTestId('members-table')).toBeVisible();

  await expect(page.locator('[data-testid^="member-row-"]').first()).toBeVisible();

  await page.getByTestId('invite-email-input').fill(state.invitedEmail);
  await page.getByTestId('invite-role-select').selectOption('user');
  await page.getByTestId('invite-mode-select').selectOption('create');

  const canViewToggle = page.getByTestId('invite-can-view-toggle');
  if (await canViewToggle.isChecked()) {
    await canViewToggle.uncheck();
  }

  await page.getByTestId('invite-submit').click();

  await expect
    .poll(
      async () => {
        const invitedUser = await findUserByEmail(state.invitedEmail);
        if (!invitedUser?.id) {
          return null;
        }

        state.invitedUserId = invitedUser.id;

        const { data, error } = await admin
          .from('organization_members')
          .select('role, can_view_team_leads')
          .eq('org_id', state.orgId)
          .eq('user_id', invitedUser.id)
          .maybeSingle();

        if (error) {
          return `ERROR:${error.message}`;
        }

        if (!data) {
          return null;
        }

        return `${data.role}|${data.can_view_team_leads ? 'true' : 'false'}`;
      },
      { timeout: 45_000 },
    )
    .toBe('user|false');

  expect(state.invitedUserId).not.toBe('');

  await expect(page.getByTestId(`member-row-${state.invitedUserId}`)).toBeVisible();

  await page.getByTestId(`member-role-${state.invitedUserId}`).selectOption('admin');

  const rowCanViewToggle = page.getByTestId(`member-can-view-${state.invitedUserId}`);
  if (!(await rowCanViewToggle.isChecked())) {
    await rowCanViewToggle.check();
  }

  await page.getByTestId(`member-save-${state.invitedUserId}`).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('organization_members')
          .select('role, can_view_team_leads')
          .eq('org_id', state.orgId)
          .eq('user_id', state.invitedUserId)
          .maybeSingle();

        if (error) {
          return `ERROR:${error.message}`;
        }

        if (!data) {
          return null;
        }

        return `${data.role}|${data.can_view_team_leads ? 'true' : 'false'}`;
      },
      { timeout: 30_000 },
    )
    .toBe('admin|true');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId(`member-remove-${state.invitedUserId}`).click();

  const removeDialog = page.getByRole('dialog', { name: /Remover Membro/i });
  if (await removeDialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await removeDialog.getByRole('button', { name: /^Remover$/ }).click();
  }

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('organization_members')
          .select('user_id')
          .eq('org_id', state.orgId)
          .eq('user_id', state.invitedUserId)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          return `ERROR:${error.message}`;
        }

        return data ? 'EXISTS' : 'REMOVED';
      },
      { timeout: 30_000 },
    )
    .toBe('REMOVED');
});
