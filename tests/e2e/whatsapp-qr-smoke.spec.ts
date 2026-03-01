import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for QR smoke e2e: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  instanceDisplayName: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  instanceDisplayName: '',
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

async function openIntegrations(page: Page) {
  await page.getByTestId('nav-settings-trigger').click();
  const integrationsButton = page.getByRole('button').filter({ hasText: /Central de Integr/i }).first();
  await expect(integrationsButton).toBeVisible({ timeout: 30_000 });
  await integrationsButton.click();
  await expect(page.getByText(/Central de Integr/i).first()).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `qr.smoke.${suffix}@example.test`;
  state.password = `QrSmoke!${suffix}Aa1`;
  state.instanceDisplayName = `QR Smoke ${suffix.slice(-4)}`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
  });
  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create QR smoke user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `QR Smoke Org ${suffix}`,
    owner_id: state.userId,
  });
  if (orgErr) throw new Error(`Failed to create QR smoke org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create QR smoke membership: ${memberErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('interacoes').delete().eq('org_id', state.orgId);
    await admin.from('leads').delete().eq('org_id', state.orgId);
    await admin.from('whatsapp_instances').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }

  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('WhatsApp QR smoke: create and refresh QR in Integrations view', async ({ page }) => {
  const qrFromCreate = 'QR_CREATE_BASE64_001';
  const qrFromRefresh = 'QR_REFRESH_BASE64_002';
  let connectRequests = 0;

  await page.route('**/functions/v1/evolution-proxy**', async (route) => {
    if (route.request().method().toUpperCase() === 'OPTIONS') {
      await route.fulfill({ status: 200, body: 'ok' });
      return;
    }

    const rawBody = route.request().postData() || '{}';
    let parsed: any = {};
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      parsed = {};
    }

    const action = String(parsed?.action || '').trim();
    const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};

    let body: Record<string, unknown>;

    if (action === 'createInstance') {
      body = {
        success: true,
        data: {
          instance: {
            instanceName: String(payload.instanceName || 'qr-smoke-instance'),
            instanceId: 'inst-qr-smoke',
            status: 'connecting',
          },
          qrcode: {
            base64: qrFromCreate,
            code: 'qr-create-code',
          },
        },
      };
    } else if (action === 'connectInstance') {
      connectRequests += 1;
      body = {
        success: true,
        data: {
          base64: qrFromRefresh,
          code: 'qr-refresh-code',
        },
      };
    } else if (action === 'setWebhook') {
      body = {
        success: true,
        data: {
          ok: true,
        },
      };
    } else if (action === 'getInstanceStatus') {
      body = {
        success: true,
        data: {
          instance: {
            instanceName: String(payload.instanceName || 'qr-smoke-instance'),
            state: 'connecting',
          },
        },
      };
    } else {
      body = {
        success: true,
        data: {},
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await login(page, state.email, state.password);
  await openIntegrations(page);

  const input = page.getByPlaceholder(/Nome da inst/i);
  await input.fill(state.instanceDisplayName);
  await page.getByRole('button', { name: /^Criar$/i }).click();

  const qrImage = page.getByAltText('QR Code WhatsApp');
  await expect(qrImage).toBeVisible({ timeout: 30_000 });
  await expect(qrImage).toHaveAttribute('src', new RegExp(qrFromCreate));

  await page.getByRole('button', { name: /Atualizar QR/i }).click();
  await expect(qrImage).toHaveAttribute('src', new RegExp(qrFromRefresh));
  expect(connectRequests).toBeGreaterThan(0);

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('whatsapp_instances')
          .select('qr_code')
          .eq('org_id', state.orgId)
          .eq('display_name', state.instanceDisplayName)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) return `ERROR:${error.message}`;
        if (!data) return null;
        return data.qr_code || null;
      },
      { timeout: 30_000 },
    )
    .toBe(qrFromRefresh);
});
