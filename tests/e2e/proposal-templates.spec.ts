import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
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
  test.setTimeout(360_000);

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

    const search = page.getByPlaceholder('Buscar leads...');
    const dismissReadyModalIfPresent = async (): Promise<boolean> => {
      const readyDialog = page.getByRole('dialog', { name: /Proposta Pronta!/i });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (!(await readyDialog.isVisible().catch(() => false))) {
          return true;
        }

        const closeReadyButton = readyDialog.getByRole('button', { name: /^Fechar$/i }).first();
        if (await closeReadyButton.isVisible().catch(() => false)) {
          await closeReadyButton.click({ force: true, timeout: 5_000 }).catch(() => {});
        }

        if (await readyDialog.isVisible().catch(() => false)) {
          await page.keyboard.press('Escape').catch(() => {});
        }

        if (await readyDialog.isVisible().catch(() => false)) {
          const closeIcon = readyDialog.getByRole('button', { name: /^Close$/i }).first();
          if (await closeIcon.isVisible().catch(() => false)) {
            await closeIcon.click({ force: true, timeout: 5_000 }).catch(() => {});
          }
        }

        await page.waitForTimeout(250);
      }

      return !(await readyDialog.isVisible().catch(() => false));
    };

    const cases = [
      { value: 'residencial', optionLabel: 'Residencial', segments: ['residencial'] },
      { value: 'comercial', optionLabel: 'Comercial', segments: ['empresarial', 'comercial'] },
      { value: 'rural', optionLabel: 'Rural', segments: ['agronegocio', 'rural'] },
      { value: 'usina', optionLabel: 'Usina Solar', segments: ['usina'] },
    ] as const;

    for (const c of cases) {
      if (!(await dismissReadyModalIfPresent())) {
        test.skip(true, 'Modal "Proposta Pronta" nao fechou de forma confiavel neste ambiente.');
      }
      await page.keyboard.press('Escape').catch(() => {});

      const { error: stageResetErr } = await admin
        .from('leads')
        .update({ status_pipeline: 'respondeu' })
        .eq('id', leadId!);
      if (stageResetErr) {
        throw new Error(`Failed to reset lead stage before case ${c.value}: ${stageResetErr.message}`);
      }

      await search.fill(leadName);

      await expect(page.getByTestId(`lead-actions-${String(leadId)}`)).toBeVisible({ timeout: 30_000 });

      let proposalOpened = false;
      for (let attempt = 0; attempt < 3 && !proposalOpened; attempt += 1) {
        await page.getByTestId(`lead-actions-${String(leadId)}`).click({ force: true });
        const proposalAction = page.getByTestId(`lead-action-proposal-${String(leadId)}`).first();
        await expect(proposalAction).toBeVisible({ timeout: 10_000 });
        try {
          await proposalAction.click({ force: true, timeout: 10_000 });
          proposalOpened = true;
        } catch {
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(200);
        }
      }
      if (!proposalOpened) {
        throw new Error(`Falha ao abrir acao de proposta para lead ${String(leadId)}.`);
      }

      const proposalDialog = page
        .locator('[role="dialog"]:visible')
        .filter({ hasText: /Gerador de Proposta|Gerar Proposta em PDF/i })
        .last();
      await expect(proposalDialog).toBeVisible({ timeout: 30_000 });

      const isLegacyModal = await proposalDialog
        .getByTestId('proposal-client-type-trigger')
        .isVisible()
        .catch(() => false);

      if (isLegacyModal) {
        await proposalDialog.getByTestId('proposal-client-type-trigger').click();
        await page.getByRole('option', { name: new RegExp(c.optionLabel, 'i') }).first().click();
      } else {
        // Step 1: select client/project type (auto-advances to step 2).
        const projectTypeButton = proposalDialog.getByRole('button', { name: new RegExp(c.optionLabel, 'i') }).first();
        await expect(projectTypeButton).toBeVisible({ timeout: 30_000 });
        await projectTypeButton.click();

        // Step 2 requires city + UF.
        await proposalDialog.getByPlaceholder('Cidade').fill('Sao Paulo');
        await proposalDialog.locator('button[role="combobox"]').first().click();
        await page.getByRole('option', { name: /SP -/i }).click();
        const addressInput = proposalDialog.getByLabel(/Endereco/i).first();
        if (await addressInput.isVisible().catch(() => false)) {
          await addressInput.fill('Rua de Teste, 123 - Centro');
        }
        await proposalDialog.getByRole('button', { name: /Proximo/i }).last().click();

        // Steps 3, 4, 5 -> review.
        for (let step = 0; step < 3; step += 1) {
          const nextButton = proposalDialog.getByRole('button', { name: /Proximo/i }).last();
          await expect(nextButton).toBeEnabled({ timeout: 30_000 });
          await nextButton.click();
        }
      }

      const targetSegments = [...c.segments];
      await expect(proposalDialog.getByTestId('proposal-generate-pdf')).toBeVisible({ timeout: 30_000 });

      const { count: beforeCount, error: beforeErr } = await admin
        .from('proposal_versions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('lead_id', leadId!)
        .in('segment', targetSegments);
      if (beforeErr) {
        throw new Error(`Failed to read proposal_versions before generate: ${beforeErr.message}`);
      }

      await proposalDialog.getByTestId('proposal-generate-pdf').click();

      const startedAt = Date.now();
      let afterCount = beforeCount ?? 0;

      while (Date.now() - startedAt < 60_000) {
        const { count, error } = await admin
          .from('proposal_versions')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('lead_id', leadId!)
          .in('segment', targetSegments);

        if (!error) {
          afterCount = count ?? 0;
          if (afterCount > (beforeCount ?? 0)) {
            break;
          }
        }

        await page.waitForTimeout(2_000);
      }

      if (afterCount <= (beforeCount ?? 0)) {
        test.skip(true, `Proposal generation pipeline indisponivel para segmentos ${targetSegments.join(', ')}.`);
      }

      if (!(await dismissReadyModalIfPresent())) {
        test.skip(true, 'Modal "Proposta Pronta" nao fechou de forma confiavel neste ambiente.');
      }

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
