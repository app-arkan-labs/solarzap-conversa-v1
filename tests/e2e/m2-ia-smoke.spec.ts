import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for M2 smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);

test('M2 smoke: login and open IA agents view', async ({ page }) => {
  const email = `e2e.m2.ia.${Date.now()}.${rand(6)}@example.com`;
  const password = `M2_Smoke_${Date.now()}_${rand(10)}`;
  let userId: string | null = null;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { e2e: true, gate: 'm2_ia_smoke' },
    });

    if (createErr || !created?.user?.id) {
      throw new Error(`Failed to create user for M2 smoke: ${createErr?.message || 'unknown'}`);
    }
    userId = created.user.id;

    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await page.waitForURL('**/', { timeout: 30_000 });
    await page.locator('button[title="Configurações"]').click();
    await page.getByRole('button', { name: /Intelig/i }).click();

    await expect(page.getByRole('heading', { name: /Intelig/i })).toBeVisible({ timeout: 30_000 });
  } finally {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
