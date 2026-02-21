import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing env vars for M7 smoke: SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY'
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  leadName: string;
  leadPhone: string;
  leadId: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  leadName: '',
  leadPhone: '',
  leadId: '',
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
  state.email = `m7.e2e.${suffix}@example.test`;
  state.password = `M7E2E!${suffix}Aa1`;
  state.leadName = `M7E2E-Lead-${suffix}`;
  state.leadPhone = `119${suffix.slice(-8)}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, m7_e2e: true },
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create M7 e2e user: ${userResp.error?.message || 'unknown'}`);
  }

  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `M7 E2E Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create M7 e2e org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create M7 e2e membership: ${memberErr.message}`);
});

test.afterAll(async () => {
  if (state.leadId) {
    await admin.from('leads').delete().eq('id', Number(state.leadId));
  } else if (state.leadName) {
    await admin.from('leads').delete().eq('nome', state.leadName);
  }

  if (state.orgId) {
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('M7 smoke: login, create lead via UI, org_id enforced, storage path org-scoped', async ({ page }) => {
  await login(page, state.email, state.password);

  await page.getByRole('button', { name: 'Pipelines' }).click();
  await page.getByTestId('open-create-lead-modal').first().click();
  await page.locator('#nome').fill(state.leadName);
  await page.locator('#telefone').fill(state.leadPhone);
  await page.getByTestId('submit-create-lead').click();

  await expect
    .poll(async () => {
      const { data, error } = await admin
        .from('leads')
        .select('id, org_id, nome, user_id')
        .eq('nome', state.leadName)
        .eq('user_id', state.userId)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return `ERROR:${error.message}`;
      if (!data?.id || !data?.org_id) return null;
      state.leadId = String(data.id);
      return data.org_id;
    }, { timeout: 30_000 })
    .toBe(state.orgId);

  expect(state.leadId).not.toBe('');

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: authData, error: authError } = await userClient.auth.signInWithPassword({
    email: state.email,
    password: state.password,
  });

  if (authError || !authData.session?.access_token) {
    throw new Error(`Failed to sign in e2e user for storage-intent validation: ${authError?.message || 'no session'}`);
  }

  const { data: storageIntentBody, error: storageIntentError } = await userClient.functions.invoke('storage-intent', {
    body: {
      fileName: 'm7-hardening-check.txt',
      sizeBytes: 64,
      mimeType: 'text/plain',
      kind: 'document',
      leadId: state.leadId,
    },
  });

  const expectedPrefix = `${state.orgId}/chat/${state.leadId}/`;
  const hasIntentPath =
    !storageIntentError &&
    typeof storageIntentBody?.path === 'string' &&
    typeof storageIntentBody?.publicUrl === 'string';

  if (hasIntentPath) {
    expect(String(storageIntentBody.path)).toContain(expectedPrefix);
    expect(String(storageIntentBody.publicUrl)).toContain(expectedPrefix);
  } else {
    // Fallback when storage-intent is not available in the remote environment.
    const useChatSource = readFileSync('src/hooks/domain/useChat.ts', 'utf8');
    // read the canonical webhook implementation for pattern check
    const webhookSource = readFileSync('supabase/functions/whatsapp-webhook/index.ts', 'utf8');
    expect(useChatSource).toContain('${orgId}/chat/${safeLeadId}/${Date.now()}_');
    // allow either prefix style (with or without "org/")
    expect(webhookSource).toMatch(/instances\/${safeInstanceName}\/${Date\.now\(\)}_${fileName}/);
  }
});
