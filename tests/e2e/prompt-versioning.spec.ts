import { test, expect, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for prompt-versioning smoke: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type SetupState = {
  orgId: string;
  userId: string;
  email: string;
  password: string;
  stage: string;
};

const state: SetupState = {
  orgId: randomUUID(),
  userId: '',
  email: '',
  password: '',
  stage: 'respondeu',
};

const isSchemaMismatch = (error: any): boolean => {
  const code = typeof error?.code === 'string' ? error.code : '';
  return code === '42703' || code === 'PGRST204';
};

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/', { timeout: 30_000 });
  await page.getByTestId('nav-settings-trigger').waitFor({ state: 'visible', timeout: 30_000 });
}

async function openAiSettings(page: Page) {
  const settingsTrigger = page.getByTestId('nav-settings-trigger');
  const aiButton = page.getByTestId('nav-ia-agentes');
  const aiCards = page.locator('[data-testid^="ai-stage-card-"]');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await settingsTrigger.click();

    const appeared = await aiButton
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (!appeared) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      continue;
    }

    const clicked = await aiButton
      .click({ force: true, timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (clicked) {
      const opened = await aiCards
        .first()
        .waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (opened) return;
    }
  }

  throw new Error('Unable to open IA settings view.');
}

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  state.email = `prompt.versioning.${suffix}@example.test`;
  state.password = `PromptVersioning!${suffix}Aa1`;

  const userResp = await admin.auth.admin.createUser({
    email: state.email,
    password: state.password,
    email_confirm: true,
    user_metadata: { org_id: state.orgId, prompt_versioning_e2e: true },
  });

  if (userResp.error || !userResp.data.user?.id) {
    throw new Error(`Failed to create prompt-versioning user: ${userResp.error?.message || 'unknown'}`);
  }
  state.userId = userResp.data.user.id;

  const { error: orgErr } = await admin.from('organizations').insert({
    id: state.orgId,
    name: `Prompt Versioning Org ${suffix}`,
  });
  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  const { error: memberErr } = await admin.from('organization_members').insert({
    org_id: state.orgId,
    user_id: state.userId,
    role: 'owner',
    can_view_team_leads: true,
  });
  if (memberErr) throw new Error(`Failed to create membership: ${memberErr.message}`);

  const { error: settingsErr } = await admin.from('ai_settings').upsert(
    {
      org_id: state.orgId,
      is_active: true,
      assistant_identity_name: 'Prompt Versioning',
    },
    { onConflict: 'org_id' },
  );
  if (settingsErr) throw new Error(`Failed to upsert ai_settings baseline: ${settingsErr.message}`);

  const { error: stageErr } = await admin.from('ai_stage_config').upsert(
    {
      org_id: state.orgId,
      pipeline_stage: state.stage,
      is_active: true,
      agent_goal: 'Objetivo baseline',
      default_prompt: 'ETAPA: RESPONDEU\nOBJETIVO: Teste baseline\nPrompt baseline para versionamento.',
      prompt_override: null,
    },
    { onConflict: 'org_id,pipeline_stage' },
  );
  if (stageErr) throw new Error(`Failed to upsert ai_stage_config baseline: ${stageErr.message}`);
});

test.afterAll(async () => {
  if (state.orgId) {
    await admin.from('ai_stage_config').delete().eq('org_id', state.orgId);
    await admin.from('ai_settings').delete().eq('org_id', state.orgId);
    await admin.from('organization_members').delete().eq('org_id', state.orgId);
    await admin.from('organizations').delete().eq('id', state.orgId);
  }
  if (state.userId) {
    await admin.auth.admin.deleteUser(state.userId);
  }
});

test('prompt versioning: save increments version and restore remains editable', async ({ page }) => {
  const versionProbe = await admin
    .from('ai_stage_config')
    .select('prompt_override_version')
    .eq('org_id', state.orgId)
    .eq('pipeline_stage', state.stage)
    .limit(1)
    .maybeSingle();

  if (versionProbe.error && isSchemaMismatch(versionProbe.error)) {
    test.skip(true, 'prompt_override_version column not available in current test database');
  }
  if (versionProbe.error) throw new Error(`Failed to probe prompt version column: ${versionProbe.error.message}`);

  await login(page, state.email, state.password);
  await openAiSettings(page);

  const card = page.getByTestId(`ai-stage-card-${state.stage}`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText(/Versao\s+0/i)).toBeVisible({ timeout: 30_000 });

  await card.getByRole('button', { name: /Editar Prompt/i }).click();
  await page.getByRole('button', { name: /Continuar/i }).click();

  const editor = page.locator('textarea').first();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  const originalPrompt = await editor.inputValue();

  const customPrompt = `Prompt custom ${Date.now()} para teste de versionamento. Conteudo suficientemente longo para salvar sem bloqueio.`;
  await editor.fill(customPrompt);
  await expect(page.getByText(/Avisos nao bloqueiam o salvamento/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Salvar Altera/i })).toBeEnabled();
  await page.getByRole('button', { name: /Salvar Altera/i }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('ai_stage_config')
          .select('prompt_override, prompt_override_version')
          .eq('org_id', state.orgId)
          .eq('pipeline_stage', state.stage)
          .limit(1)
          .maybeSingle();

        if (error) return `ERROR:${error.message}`;
        if (!data) return null;
        return `${data.prompt_override}|${data.prompt_override_version}`;
      },
      { timeout: 30_000 },
    )
    .toBe(`${customPrompt}|1`);

  await expect(card.getByText(/Versao\s+1/i)).toBeVisible({ timeout: 30_000 });

  await card.getByRole('button', { name: /Editar Prompt/i }).click();
  await page.getByRole('button', { name: /Continuar/i }).click();
  const editorAfterSave = page.locator('textarea').first();
  await expect(editorAfterSave).toHaveValue(customPrompt);

  await page.getByRole('button', { name: /Restaurar Padr/i }).click();
  const restoredPrompt = await editorAfterSave.inputValue();
  expect(restoredPrompt).not.toBe(customPrompt);
  expect(restoredPrompt.length).toBeGreaterThan(0);
  expect(restoredPrompt).toBe(originalPrompt);

  await page.getByRole('button', { name: /Salvar Altera/i }).click();

  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('ai_stage_config')
          .select('prompt_override, prompt_override_version')
          .eq('org_id', state.orgId)
          .eq('pipeline_stage', state.stage)
          .limit(1)
          .maybeSingle();

        if (error) return `ERROR:${error.message}`;
        if (!data) return null;
        return `${data.prompt_override}|${data.prompt_override_version}`;
      },
      { timeout: 30_000 },
    )
    .toBe(`${restoredPrompt}|2`);

  await expect(card.getByText(/Versao\s+2/i)).toBeVisible({ timeout: 30_000 });
});
