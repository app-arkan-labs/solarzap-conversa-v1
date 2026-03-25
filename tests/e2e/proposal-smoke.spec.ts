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

async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? 25_000;
  const intervalMs = opts?.intervalMs ?? 700;
  const start = Date.now();
  let last: T | null | undefined = null;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms (last=${JSON.stringify(last)})`);
}

test('Pipeline: gerar proposta baixa PDF e cria registros premium (versions/events/sections)', async ({ page }) => {
  const email = `e2e.proposal.${Date.now()}.${rand(6)}@example.com`;
  const password = `S!moke_${Date.now()}_${rand(10)}`;
  const orgId = randomUUID();

  let userId: string | null = null;
  let leadId: number | null = null;
  let propostaId: number | null = null;

  const leadName = `E2E_LEAD_${Date.now()}_${rand(4)}`;

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

    const { error: orgErr } = await admin.from('organizations').insert({
      id: orgId,
      name: `E2E Proposal Org ${Date.now()}`,
      subscription_status: 'active',
    });
    if (orgErr) {
      throw new Error(`Failed to create org: ${orgErr.message}`);
    }

    const { error: memberErr } = await admin.from('organization_members').insert({
      org_id: orgId,
      user_id: userId,
      role: 'owner',
      can_view_team_leads: true,
    });
    if (memberErr) {
      throw new Error(`Failed to create membership: ${memberErr.message}`);
    }

    const { error: onboardingErr } = await admin.from('onboarding_progress').insert({
      user_id: userId,
      org_id: orgId,
      current_step: 'complete',
      completed_steps: ['profile', 'organization', 'install', 'explore'],
      skipped_steps: [],
      tour_completed_tabs: ['conversas', 'pipelines', 'calendario', 'disparos'],
      is_complete: true,
      guided_tour_version: 'v2-global-01',
      guided_tour_status: 'completed',
      guided_tour_seen_at: new Date().toISOString(),
      guided_tour_completed_at: new Date().toISOString(),
    });
    if (onboardingErr) {
      throw new Error(`Failed to seed onboarding progress: ${onboardingErr.message}`);
    }

    const phone = `55119999${Math.floor(1000 + Math.random() * 8999)}`;
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
        consumo_kwh: 500,
        valor_estimado: 32000,
        latitude: -23.55052,
        longitude: -46.633308,
        irradiance_source: 'pvgis',
        irradiance_ref_at: new Date().toISOString(),
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
    const welcomeDialog = page.getByRole('dialog', { name: /Bem-vindo ao SolarZap/i });
    if (await welcomeDialog.isVisible().catch(() => false)) {
      const skipTour = welcomeDialog.getByRole('button', { name: /Pular tour/i }).first();
      if (await skipTour.isVisible().catch(() => false)) {
        await skipTour.click({ force: true });
      } else {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await expect(welcomeDialog).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
    }
    await page.getByTitle('Pipelines').click();

    await expect(page.getByText(leadName)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId(`lead-actions-${String(leadId)}`).click();
    await page.getByTestId(`lead-action-proposal-${String(leadId)}`).click();

    await expect(page.getByText(/Gerador de Proposta|Gerar Proposta em PDF/i)).toBeVisible();
    const wizardDialog = page.getByRole('dialog').filter({ hasText: /Gerador de Proposta|Gerar Proposta em PDF/i }).last();

    // Step 1 -> Step 2
    await wizardDialog.getByRole('button', { name: /Proximo/i }).last().click();

    // Step 2 requires location fields
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

    const clientDownloadPromise = page.waitForEvent('download', { timeout: 30_000 }).catch(() => null);
    await wizardDialog.getByTestId('proposal-generate-pdf').click();

    const outDir = path.join(process.cwd(), 'test-results');
    fs.mkdirSync(outDir, { recursive: true });

    const clientDownload = await clientDownloadPromise;
    if (clientDownload) {
      const clientFilename = clientDownload.suggestedFilename().toLowerCase();
      expect(clientFilename).toContain('proposta');
      await clientDownload.saveAs(path.join(outDir, 'client.pdf'));
    }

    await expect(page.getByText('Proposta Pronta!')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const { data, error } = await admin
            .from('leads')
            .select('status_pipeline')
            .eq('id', leadId)
            .maybeSingle();
          if (error) return `ERROR:${error.message}`;
          return data?.status_pipeline || null;
        },
        { timeout: 30_000 },
      )
      .toBe('proposta_pronta');

    const sellerDownloadPromise = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);
    await page.getByTestId('download-seller-script').click();
    const sellerDownload = await sellerDownloadPromise;
    if (sellerDownload) {
      const sellerFilename = sellerDownload.suggestedFilename().toLowerCase();
      expect(sellerFilename).toContain('roteiro');
      await sellerDownload.saveAs(path.join(outDir, 'seller.pdf'));
    }

    const proposalRow = await waitFor(async () => {
      const { data, error } = await admin
        .from('propostas')
        .select('id, lead_id, user_id')
        .eq('lead_id', leadId)
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    });
    propostaId = Number(proposalRow.id);

    const versionRow = await waitFor(async () => {
      const { data, error } = await admin
        .from('proposal_versions')
        .select('id, proposta_id, lead_id, user_id, premium_payload')
        .eq('proposta_id', propostaId)
        .eq('lead_id', leadId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    });

    const versionWithStorage = await waitFor(async () => {
      const { data, error } = await admin
        .from('proposal_versions')
        .select('id, premium_payload')
        .eq('id', versionRow.id)
        .maybeSingle();
      if (error) throw new Error(error.message);

      const payload: any = data?.premium_payload || {};
      const storage = payload?.storage;
      const share = payload?.share;

      const ok =
        typeof storage?.bucket === 'string' &&
        storage.bucket.length > 0 &&
        typeof storage?.path === 'string' &&
        storage.path.length > 0 &&
        typeof share?.url === 'string' &&
        share.url.includes('/functions/v1/proposal-share?token=');

      return ok ? (data as any) : null;
    }, { timeoutMs: 45_000, intervalMs: 1_000 });

    const deliveryRow = await waitFor(async () => {
      const { data, error } = await admin
        .from('proposal_delivery_events')
        .select('id, event_type')
        .eq('proposal_version_id', versionRow.id)
        .eq('event_type', 'generated')
        .limit(1);
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    });
    expect(deliveryRow.event_type).toBe('generated');

    const downloadEvents = await waitFor(async () => {
      const { data, error } = await admin
        .from('proposal_delivery_events')
        .select('id, channel, event_type, metadata')
        .eq('proposal_version_id', versionRow.id)
        .eq('event_type', 'downloaded')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length >= 2 ? data : null;
    });

    const kinds = downloadEvents
      .map((e: any) => (e?.metadata as any)?.kind)
      .filter((k: any) => typeof k === 'string');
    expect(kinds).toContain('client_proposal');
    expect(kinds).toContain('seller_script');

    const sections = await waitFor(async () => {
      const { data, error } = await admin
        .from('proposal_sections')
        .select('id')
        .eq('proposal_version_id', versionRow.id)
        .limit(5);
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0 ? data : null;
    });
    expect(sections.length).toBeGreaterThan(0);

    const shareUrl = String((versionWithStorage as any)?.premium_payload?.share?.url || '');
    expect(shareUrl).toContain('/functions/v1/proposal-share?token=');

    const shareResp = await fetch(shareUrl, { redirect: 'manual' as any });
    expect([301, 302, 303, 307, 308]).toContain(shareResp.status);

    const opened = await waitFor(async () => {
      const { data, error } = await admin
        .from('proposal_delivery_events')
        .select('id, event_type')
        .eq('proposal_version_id', versionRow.id)
        .eq('event_type', 'opened')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    }, { timeoutMs: 25_000, intervalMs: 800 });
    expect(opened.event_type).toBe('opened');
  } finally {
    // Cleanup (best-effort)
    if (propostaId) {
      await admin.from('propostas').delete().eq('id', propostaId);
    }
    if (leadId) {
      await admin.from('leads').delete().eq('id', leadId);
    }
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
    await admin.from('organization_members').delete().eq('org_id', orgId);
    await admin.from('organizations').delete().eq('id', orgId);
  }
});
