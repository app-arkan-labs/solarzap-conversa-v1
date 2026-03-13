import { test, expect, Page } from '@playwright/test';

const TEST_SYSTEM_ADMIN_EMAIL = process.env.TEST_SYSTEM_ADMIN_EMAIL;
const TEST_SYSTEM_ADMIN_PASSWORD = process.env.TEST_SYSTEM_ADMIN_PASSWORD;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
}

test('admin read-only smoke: dashboard e lista de orgs carregam', async ({ page }) => {
  test.skip(
    !TEST_SYSTEM_ADMIN_EMAIL || !TEST_SYSTEM_ADMIN_PASSWORD,
    'TEST_SYSTEM_ADMIN_EMAIL/PASSWORD nao configurados',
  );

  await login(page, TEST_SYSTEM_ADMIN_EMAIL!, TEST_SYSTEM_ADMIN_PASSWORD!);
  await page.goto('/admin');

  const currentUrl = page.url();
  if (currentUrl.includes('/admin/mfa-setup') || currentUrl.includes('/admin/mfa-verify')) {
    test.skip(true, 'Conta admin de teste exige passo interativo de MFA.');
  }

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Dashboard Admin')).toBeVisible();

  await page.goto('/admin/orgs');
  await expect(page).toHaveURL(/\/admin\/orgs$/);
  await expect(page.getByText('Organizacoes')).toBeVisible();
  await expect(page.getByText(/Lista \(\d+\)/)).toBeVisible();
});
