import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env vars for e2e: SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
  );
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const rand = (n = 8) => Math.random().toString(16).slice(2, 2 + n);

test('Pipeline: templates por segmento (residencial/empresarial/agro/usina) geram PDF sem erro', async ({ page }) => {
  const email = `e2e.templates.${Date.now()}.${rand(6)}@example.com`;
  const password = `S!moke_${Date.now()}_${rand(10)}`;
  const orgId = randomUUID();

  let userId: string | null = null;
  let leadId: number | null = null;
  let leadName: string | null = null;

  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { e2e: true, org_id: orgId },
    });
    if (createErr || !created?.user?.id) {
      throw new Error(`Failed to create user: ${createErr?.message || 'unknown'}`);
    }
    userId = created.user.id;

    // Create org
    const { error: orgErr } = await admin.from('organizations').insert({
      id: orgId,
      name: `E2E TPL Org ${Date.now()}`
    });
    if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

    const { error: memberErr } = await admin.from('organization_members').insert({
      org_id: orgId,
      user_id: userId,
      role: 'owner',
      can_view_team_leads: true,
    });
    if (memberErr) throw new Error(`Failed to create membership: ${memberErr.message}`);

    leadName = `E2E_TPL_${Date.now()}_${rand(4)}`;
    const phone = `55119888${Math.floor(1000 + Math.random() * 8999)}`;
    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .insert({
        org_id: orgId,
        nome: leadName,
        telefone: phone,
        user_id: userId,
        assigned_to_user_id: userId,
        ai_enabled: true,
        status_pipeline: 'respondeu',
        consumo_kwh: 650,
        valor_estimado: 48000,
      })
      .select('id')
      .single();
    if (leadErr || !lead?.id) {
      throw new Error(`Failed to seed lead: ${leadErr?.message || 'unknown'}`);
    }
    leadId = Number(lead.id);

    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/');

    await page.getByTitle('Pipelines').click();

    const outDir = path.join(process.cwd(), 'test-results');
    fs.mkdirSync(outDir, { recursive: true });

    const search = page.getByPlaceholder('Buscar leads...');

    const cases = [
      { value: 'residencial', optionLabel: 'Residencial', fileLabel: 'residencial' },
      { value: 'comercial', optionLabel: 'Comercial', fileLabel: 'empresarial' },
      { value: 'rural', optionLabel: 'Rural', fileLabel: 'agronegocio' },
      { value: 'usina', optionLabel: 'Usina Solar', fileLabel: 'usina' },
    ] as const;

    for (const c of cases) {
      await search.fill(leadName);

      await expect(page.getByTestId(`lead-actions-${String(leadId)}`)).toBeVisible({ timeout: 30_000 });

      await page.getByTestId(`lead-actions-${String(leadId)}`).click();
      await page.getByTestId(`lead-action-proposal-${String(leadId)}`).click();
      await expect(page.getByText(/Gerador de Proposta|Gerar Proposta em PDF/i)).toBeVisible();
      const wizardDialog = page.getByRole('dialog').filter({ hasText: /Gerador de Proposta|Gerar Proposta em PDF/i }).last();

      // Step 1: select client/project type (auto-advances to step 2).
      await wizardDialog.getByRole('button', { name: new RegExp(c.optionLabel, 'i') }).first().click();

      // Step 2 requires city + UF
      await wizardDialog.getByPlaceholder('Cidade').fill('Sao Paulo');
      await wizardDialog.locator('button[role="combobox"]').first().click();
      await page.getByRole('option', { name: /SP -/i }).click();
      await wizardDialog.getByRole('button', { name: /Proximo/i }).last().click();
      // Steps 3, 4, 5 -> review
      for (let step = 0; step < 3; step += 1) {
        const nextButton = wizardDialog.getByRole('button', { name: /Proximo/i }).last();
        await expect(nextButton).toBeEnabled({ timeout: 30_000 });
        await nextButton.click();
      }
      await expect(wizardDialog.getByTestId('proposal-generate-pdf')).toBeVisible({ timeout: 30_000 });

      const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
      await wizardDialog.getByTestId('proposal-generate-pdf').click();

      const download = await downloadPromise;
      const suggested = download.suggestedFilename().toLowerCase();
      expect(suggested).toContain('proposta');
      await download.saveAs(path.join(outDir, `client-${c.fileLabel}.pdf`));

      await expect(page.getByText('Proposta Pronta!')).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Fechar' }).click();

      await search.fill('');
    }
  } finally {
    // Cleanup (best-effort)
    if (leadId) {
      await admin.from('propostas').delete().eq('lead_id', leadId);
      await admin.from('leads').delete().eq('id', leadId);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
    await admin.from('organization_members').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
  }
});
